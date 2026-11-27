/* Shifo Clinic: online diabetes consultation bookings.
   Public:  free times (action=slots) and booking a time (action=book).
   Staff:   Netlify Identity users with role "admin", "ceo" or "clinic" see bookings, change them, and set working hours.
   Storage: Netlify Blobs store "clinic" (strong consistency).
     settings          working hours, consultation length, days off
     b/<id>            one booking
     slot/<startISO>   lock: holds the booking id, written only if new, so a time can never be booked twice
     rl/<day>/<ip>     bookings per visitor per day (spam limit)                                              */
import { getStore } from '@netlify/blobs';

const DEFAULTS = {
  tz: 'Asia/Tashkent', minutes: 45, gap: 15, noticeHours: 12, horizonDays: 21,
  week: { 1: [['10:00', '17:00']], 2: [['10:00', '17:00']], 3: [['10:00', '17:00']], 4: [['10:00', '17:00']], 5: [['10:00', '17:00']], 6: [['10:00', '14:00']], 7: [] },
  off: []
};
const CONTACTS = ['whatsapp', 'telegram', 'zoom', 'teams'];
const CONDITIONS = ['t1', 't2', 'pre', 'preg', 'unsure', ''];
const STATUSES = ['booked', 'confirmed', 'done', 'cancelled'];
const PER_IP_DAY = 5, PER_PHONE_OPEN = 2;

const json = (status, data) => new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } });
const fail = (status, error) => json(status, { error });
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
const str = (v, max) => String(v == null ? '' : v).replace(/[\u0000-\u001f]/g, ' ').trim().slice(0, max);
const digits = s => String(s || '').replace(/\D/g, '');

/* time zones without libraries: the UTC instant of a wall-clock time in a zone */
const offsetMin = (tz, at) => {
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-US', { timeZone: tz, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' }).formatToParts(at).map(x => [x.type, x.value]));
  return (Date.UTC(+p.year, p.month - 1, +p.day, +p.hour, +p.minute, +p.second) - at.getTime()) / 60000;
};
const zoned = (date, time, tz) => {
  const [y, m, d] = date.split('-').map(Number), [hh, mm] = time.split(':').map(Number);
  const guess = Date.UTC(y, m - 1, d, hh, mm);
  let t = guess - offsetMin(tz, new Date(guess)) * 60000;
  t = guess - offsetMin(tz, new Date(t)) * 60000;
  return new Date(t);
};
const localDate = (at, tz) => new Intl.DateTimeFormat('en-CA', { timeZone: tz }).format(at);
const weekday = (date) => { const d = new Date(date + 'T12:00:00Z').getUTCDay(); return d === 0 ? 7 : d; };
const addDays = (date, n) => { const d = new Date(date + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
const toMin = t => { const [h, m] = t.split(':').map(Number); return h * 60 + m; };
const fromMin = n => `${String(Math.floor(n / 60)).padStart(2, '0')}:${String(n % 60).padStart(2, '0')}`;

function allSlots(S, now = Date.now()) {
  const out = [], step = S.minutes + S.gap, first = localDate(new Date(now), S.tz);
  for (let i = 0; i <= S.horizonDays; i++) {
    const day = addDays(first, i);
    if (S.off.includes(day)) continue;
    for (const [a, b] of S.week[weekday(day)] || []) {
      for (let m = toMin(a); m + S.minutes <= toMin(b); m += step) {
        const at = zoned(day, fromMin(m), S.tz);
        if (at.getTime() >= now + S.noticeHours * 3600000) out.push(at.toISOString());
      }
    }
  }
  return out;
}

async function staff(req) {
  const auth = req.headers.get('authorization') || '';
  if (!/^Bearer \S+$/.test(auth)) return null;
  try {
    const res = await fetch(new URL('/.netlify/identity/user', req.url), { headers: { Authorization: auth } });
    if (!res.ok) return null;
    const u = await res.json();
    const roles = ((u.app_metadata && u.app_metadata.roles) || []).map(r => String(r).toLowerCase().trim());
    return roles.includes('admin') || roles.includes('ceo') || roles.includes('clinic') ? { email: u.email } : null;
  } catch (e) { return null; }
}

function cleanSettings(b) {
  const S = { ...DEFAULTS };
  if ([30, 45, 60, 90].includes(+b.minutes)) S.minutes = +b.minutes;
  if ([0, 5, 10, 15, 30].includes(+b.gap)) S.gap = +b.gap;
  if (+b.noticeHours >= 0 && +b.noticeHours <= 72) S.noticeHours = Math.round(+b.noticeHours);
  if (+b.horizonDays >= 7 && +b.horizonDays <= 60) S.horizonDays = Math.round(+b.horizonDays);
  const T = /^([01]\d|2[0-3]):[0-5]\d$/;
  if (b.week && typeof b.week === 'object') {
    S.week = {};
    for (let d = 1; d <= 7; d++) S.week[d] = (Array.isArray(b.week[d]) ? b.week[d] : []).filter(r => Array.isArray(r) && T.test(r[0]) && T.test(r[1]) && toMin(r[0]) < toMin(r[1])).slice(0, 4);
  }
  if (Array.isArray(b.off)) S.off = [...new Set(b.off.filter(d => /^\d{4}-\d{2}-\d{2}$/.test(d)))].sort().slice(-200);
  return S;
}

export default async (req) => {
  const url = new URL(req.url), action = url.searchParams.get('action') || '';
  const store = getStore({ name: 'clinic', consistency: 'strong' });
  const lister = getStore({ name: 'clinic' });   // listing via the regular edge (a strong-consistency listing can come back empty)
  const settings = async () => ({ ...DEFAULTS, ...((await store.get('settings', { type: 'json' })) || {}) });
  const takenSet = async () => new Set((await lister.list({ prefix: 'slot/' })).blobs.map(b => b.key.slice(5)));

  try {
    /* ---------- public ---------- */
    if (req.method === 'GET' && action === 'slots') {
      const S = await settings(), taken = await takenSet();
      return json(200, { tz: S.tz, minutes: S.minutes, slots: allSlots(S).filter(s => !taken.has(s)) });
    }

    if (req.method === 'POST' && action === 'book') {
      let b = {}; try { b = await req.json(); } catch (e) {}
      if (b.website) return json(200, { booking: { id: 'x', start: b.start } });   // spam trap filled in: pretend, save nothing
      const S = await settings();
      const t = new Date(b.start || ''), start = isNaN(t) ? '' : t.toISOString();
      if (!start || !allSlots(S).includes(start)) return fail(409, 'slot_gone');
      const name = str(b.name, 100), phone = str(b.phone, 30), contact = String(b.contact || '');
      if (name.length < 2) return fail(400, 'name');
      if (digits(phone).length < 7) return fail(400, 'phone');
      if (!CONTACTS.includes(contact)) return fail(400, 'contact');
      const okMail = v => /^[^\s@]+@[^\s@.]+(\.[^\s@.]+)+$/.test(v);
      const email = str(b.email, 120).toLowerCase();
      if (b.email !== undefined && !okMail(email)) return fail(400, 'email');
      const detail = str(b.contactDetail, 120) || email;
      if ((contact === 'zoom' || contact === 'teams') && !okMail(detail)) return fail(400, 'email');
      if (!b.consent) return fail(400, 'consent');

      const ip = (req.headers.get('x-nf-client-connection-ip') || req.headers.get('x-forwarded-for') || 'unknown').split(',')[0].trim().replace(/[^\w.:-]/g, '');
      const today = localDate(new Date(), S.tz), rlKey = `rl/${today}/${ip}`;
      const count = +((await store.get(rlKey)) || 0);
      if (count >= PER_IP_DAY) return fail(429, 'too_many');
      const open = [];
      for (const k of (await lister.list({ prefix: 'b/' })).blobs) {
        const x = await store.get(k.key, { type: 'json' });
        if (x && digits(x.phone) === digits(phone) && ['booked', 'confirmed'].includes(x.status) && Date.parse(x.start) > Date.now()) open.push(x);
      }
      if (open.length >= PER_PHONE_OPEN) return fail(429, 'phone_limit');

      const id = uid();
      const lock = await store.set(`slot/${start}`, id, { onlyIfNew: true });
      if (lock && lock.modified === false) return fail(409, 'slot_gone');
      const booking = { id, start, minutes: S.minutes, tz: S.tz, name, first: str(b.first, 60), last: str(b.last, 60), email, phone, contact, contactDetail: detail,
        forWhom: b.forWhom === 'family' ? 'family' : 'me', condition: CONDITIONS.includes(b.condition) ? b.condition : '',
        note: str(b.note, 1000), lang: ['uz', 'ru', 'en'].includes(b.lang) ? b.lang : 'uz', status: 'booked', created: new Date().toISOString() };
      await store.setJSON(`b/${id}`, booking);
      await store.set(rlKey, String(count + 1));
      return json(200, { booking: { id, start, minutes: booking.minutes, tz: S.tz, contact } });
    }

    /* ---------- staff ---------- */
    const me = await staff(req);
    if (!me) return fail(401, 'login');

    if (req.method === 'GET' && action === 'settings') return json(200, { settings: await settings() });
    if (req.method === 'GET' && action === 'bookings') {
      const list = [];
      for (const k of (await lister.list({ prefix: 'b/' })).blobs) { const x = await store.get(k.key, { type: 'json' }); if (x) list.push(x); }
      list.sort((a, b) => Date.parse(a.start) - Date.parse(b.start));
      return json(200, { bookings: list, tz: (await settings()).tz });
    }
    if (req.method !== 'POST') return fail(400, 'action');
    let b = {}; try { b = await req.json(); } catch (e) {}

    if (action === 'settings') {
      const S = cleanSettings(b.settings || {});
      await store.setJSON('settings', S);
      return json(200, { settings: S });
    }

    if (action === 'update') {
      const x = await store.get(`b/${String(b.id || '').replace(/[^\w-]/g, '')}`, { type: 'json' });
      if (!x) return fail(404, 'missing');
      if (b.start && b.start !== x.start) {                          // move to another time
        const to = new Date(b.start);
        if (isNaN(to)) return fail(400, 'start');
        const iso = to.toISOString();
        const lock = await store.set(`slot/${iso}`, x.id, { onlyIfNew: true });
        if (lock && lock.modified === false) return fail(409, 'slot_gone');
        if (x.status !== 'cancelled') await store.delete(`slot/${x.start}`);
        x.moved = (x.moved || []).concat({ from: x.start, at: new Date().toISOString(), by: me.email });
        x.start = iso;
        if (x.status === 'cancelled') x.status = 'booked';
      }
      if (b.status && STATUSES.includes(b.status) && b.status !== x.status) {
        if (b.status === 'cancelled') await store.delete(`slot/${x.start}`);
        if (x.status === 'cancelled') {                              // un-cancel: take the time back if still free
          const lock = await store.set(`slot/${x.start}`, x.id, { onlyIfNew: true });
          if (lock && lock.modified === false) return fail(409, 'slot_gone');
        }
        x.status = b.status;
      }
      if ('staffNote' in b) x.staffNote = str(b.staffNote, 2000);
      x.updated = new Date().toISOString(); x.updatedBy = me.email;
      await store.setJSON(`b/${x.id}`, x);
      return json(200, { booking: x });
    }
    return fail(400, 'action');
  } catch (e) {
    console.error(e);
    return fail(500, 'server');
  }
};

export const config = { path: '/api/clinic' };
