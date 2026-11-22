/* Shifo Academy data: lessons, homework (with photo and audio hand-ins) and payments.
   Storage: Netlify Blobs (store "academy"), strong consistency so every read sees the latest save.
   Access: the caller's Netlify Identity token is checked on every request.
     student  -> own lessons, own homework (hand in), own payments (read only)
     teacher  -> every student's lessons and homework; review hand-ins
     admin    -> everything a teacher can do, plus payments                         */
import { getStore } from '@netlify/blobs';

const MAX_FILE = 4.5 * 1024 * 1024;       // per uploaded photo or recording
const MAX_FILES = 12;                     // per homework hand-in
const ID = /^[A-Za-z0-9-]{6,64}$/;

const json = (status, data) => new Response(JSON.stringify(data), {
  status, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }
});
const fail = (status, error) => json(status, { error });
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
const str = (v, max) => String(v == null ? '' : v).trim().slice(0, max);

async function whoIs(req) {
  const auth = req.headers.get('authorization') || '';
  if (!/^Bearer \S+$/.test(auth)) return null;
  try {
    const res = await fetch(new URL('/.netlify/identity/user', req.url), { headers: { Authorization: auth } });
    if (!res.ok) return null;
    const u = await res.json();
    const roles = ((u.app_metadata && u.app_metadata.roles) || []).map(r => String(r).toLowerCase().trim());
    const admin = roles.includes('admin');
    return { id: u.id, email: u.email, roles, admin, teacher: admin || roles.includes('teacher') };
  } catch (e) { return null; }
}

export default async (req) => {
  const me = await whoIs(req);
  if (!me) return fail(401, 'login');

  const url = new URL(req.url);
  const q = Object.fromEntries(url.searchParams);
  const action = q.action || '';
  const store = getStore({ name: 'academy', consistency: 'strong' });

  const read = async (sid, kind) => (await store.get(`s/${sid}/${kind}`, { type: 'json' })) || [];
  const write = (sid, kind, list) => store.setJSON(`s/${sid}/${kind}`, list);
  const body = async () => { try { return await req.json(); } catch (e) { return {}; } };

  /* whose data: students only ever reach their own; teachers name a student */
  const target = sid => {
    if (!me.teacher) return me.id;
    if (!sid || !ID.test(sid)) return null;
    return sid;
  };
  const view = async sid => {
    const [schedule, homework, payments] = await Promise.all([read(sid, 'schedule'), read(sid, 'homework'), read(sid, 'payments')]);
    const out = { schedule, homework };
    if (!me.teacher || me.admin) out.payments = payments;   // students see their own; among staff only admin
    return out;
  };

  try {
    /* ---------- reading ---------- */
    if (req.method === 'GET') {
      if (action === 'me') return json(200, { ...(await view(me.id)), roles: me.roles });

      if (action === 'student') {
        if (!me.teacher) return fail(403, 'forbidden');
        const sid = target(q.id); if (!sid) return fail(400, 'student');
        return json(200, await view(sid));
      }

      if (action === 'board') {                       // teacher overview: hand-ins to review + upcoming lessons
        if (!me.teacher) return fail(403, 'forbidden');
        const { blobs } = await store.list({ prefix: 's/' });
        const review = [], lessons = [], now = Date.now();
        await Promise.all(blobs.map(async b => {
          const [, sid, kind] = b.key.split('/');
          if (kind === 'homework') (await read(sid, 'homework')).forEach(h => { if (h.submission) review.push({ student: sid, ...h }); });
          if (kind === 'schedule') (await read(sid, 'schedule')).forEach(l => { if (Date.parse(l.start) + (l.minutes || 60) * 60000 > now) lessons.push({ student: sid, ...l }); });
        }));
        lessons.sort((a, b) => Date.parse(a.start) - Date.parse(b.start));
        review.sort((a, b) => Date.parse(b.submission.at) - Date.parse(a.submission.at));
        return json(200, { review, lessons: lessons.slice(0, 50) });
      }

      if (action === 'file') {
        const sid = target(q.student || me.id); if (!sid) return fail(400, 'student');
        const key = String(q.key || '');
        if (!key.startsWith(`f/${sid}/`) || key.includes('..')) return fail(403, 'forbidden');
        const r = await store.getWithMetadata(key, { type: 'arrayBuffer' });
        if (!r) return fail(404, 'missing');
        return new Response(r.data, { status: 200, headers: { 'Content-Type': r.metadata.type || 'application/octet-stream', 'Cache-Control': 'private, max-age=3600' } });
      }
      return fail(400, 'action');
    }

    if (req.method !== 'POST') return fail(405, 'method');

    /* ---------- student: upload a photo or recording for a homework ---------- */
    if (action === 'upload') {
      if (me.teacher) return fail(403, 'forbidden');
      const hw = (await read(me.id, 'homework')).find(h => h.id === q.hw);
      if (!hw) return fail(404, 'homework');
      if (hw.review) return fail(409, 'reviewed');
      const type = str(q.type, 80);
      if (!/^(image|audio)\//.test(type)) return fail(415, 'type');
      const data = await req.arrayBuffer();
      if (!data.byteLength) return fail(400, 'empty');
      if (data.byteLength > MAX_FILE) return fail(413, 'too_big');
      const key = `f/${me.id}/${hw.id}/${uid()}`;
      const file = { key, name: str(q.name, 120) || 'file', type, size: data.byteLength };
      await store.set(key, data, { metadata: { type, name: file.name } });
      return json(200, { file });
    }

    const b = await body();

    /* ---------- student: hand in ---------- */
    if (action === 'submit') {
      if (me.teacher) return fail(403, 'forbidden');
      const list = await read(me.id, 'homework');
      const hw = list.find(h => h.id === b.id);
      if (!hw) return fail(404, 'homework');
      if (hw.review) return fail(409, 'reviewed');
      const files = (Array.isArray(b.files) ? b.files : []).slice(0, MAX_FILES)
        .filter(f => f && typeof f.key === 'string' && f.key.startsWith(`f/${me.id}/${hw.id}/`))
        .map(f => ({ key: f.key, name: str(f.name, 120), type: str(f.type, 80), size: +f.size || 0 }));
      const text = str(b.text, 8000);
      if (!text && !files.length) return fail(400, 'empty');
      const old = (hw.submission && hw.submission.files) || [];
      await Promise.all(old.filter(f => !files.some(n => n.key === f.key)).map(f => store.delete(f.key)));
      hw.submission = { text, files, at: new Date().toISOString() };
      await write(me.id, 'homework', list);
      return json(200, { homework: list });
    }

    /* everything below is staff only */
    if (!me.teacher) return fail(403, 'forbidden');
    const sid = target(b.student); if (!sid) return fail(400, 'student');

    if (action === 'lesson-save') {
      const l = b.lesson || {};
      const start = new Date(l.start);
      if (isNaN(start)) return fail(400, 'start');
      const link = str(l.link, 500);
      if (link && !/^https?:\/\//i.test(link)) return fail(400, 'link');
      const list = await read(sid, 'schedule');
      const item = { id: l.id && list.some(x => x.id === l.id) ? l.id : uid(), start: start.toISOString(),
        minutes: Math.min(240, Math.max(15, +l.minutes || 60)), title: str(l.title, 140), link, note: str(l.note, 500) };
      const next = list.filter(x => x.id !== item.id).concat(item).sort((x, y) => Date.parse(x.start) - Date.parse(y.start));
      await write(sid, 'schedule', next);
      return json(200, { schedule: next });
    }
    if (action === 'lesson-delete') {
      const next = (await read(sid, 'schedule')).filter(x => x.id !== b.id);
      await write(sid, 'schedule', next);
      return json(200, { schedule: next });
    }

    if (action === 'hw-save') {
      const h = b.homework || {};
      const title = str(h.title, 140); if (!title) return fail(400, 'title');
      const list = await read(sid, 'homework');
      const old = list.find(x => x.id === h.id);
      const due = h.due && !isNaN(new Date(h.due)) ? str(h.due, 10) : '';
      const item = { ...(old || { id: uid(), created: new Date().toISOString() }), title, text: str(h.text, 6000), due };
      const next = old ? list.map(x => x.id === item.id ? item : x) : [item, ...list];
      await write(sid, 'homework', next);
      return json(200, { homework: next });
    }
    if (action === 'hw-delete') {
      const list = await read(sid, 'homework');
      const gone = list.find(x => x.id === b.id);
      if (gone && gone.submission) await Promise.all((gone.submission.files || []).map(f => store.delete(f.key)));
      const next = list.filter(x => x.id !== b.id);
      await write(sid, 'homework', next);
      return json(200, { homework: next });
    }
    if (action === 'review') {
      const list = await read(sid, 'homework');
      const hw = list.find(x => x.id === b.id);
      if (!hw || !hw.submission) return fail(404, 'homework');
      const score = b.score === '' || b.score == null ? null : Math.min(10, Math.max(1, Math.round(+b.score)));
      hw.review = { score: Number.isFinite(score) ? score : null, feedback: str(b.feedback, 4000), at: new Date().toISOString(), by: me.email };
      await write(sid, 'homework', list);
      return json(200, { homework: list });
    }

    if (action === 'pay-save' || action === 'pay-delete') {
      if (!me.admin) return fail(403, 'admin');
      const list = await read(sid, 'payments');
      if (action === 'pay-delete') {
        const next = list.filter(x => x.id !== b.id);
        await write(sid, 'payments', next);
        return json(200, { payments: next });
      }
      const p = b.payment || {};
      if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(p.month || '')) return fail(400, 'month');
      if (!['paid', 'due', 'overdue'].includes(p.status)) return fail(400, 'status');
      const item = { id: p.id && list.some(x => x.id === p.id) ? p.id : uid(), month: p.month,
        amount: Math.max(0, Math.round((+p.amount || 0) * 100) / 100), status: p.status, note: str(p.note, 300) };
      const next = list.filter(x => x.id !== item.id).concat(item).sort((x, y) => y.month.localeCompare(x.month));
      await write(sid, 'payments', next);
      return json(200, { payments: next });
    }

    return fail(400, 'action');
  } catch (e) {
    console.error(e);
    return fail(500, 'server');
  }
};

export const config = { path: '/api/academy' };
