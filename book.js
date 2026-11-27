/* Shifo Clinic booking page: pick a free time, enter details, book. Talks to /api/clinic. */
(function () {
  const $ = s => document.querySelector(s);
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const L = (uz, ru, en) => `<span data-l="uz">${uz}</span><span data-l="ru">${ru}</span><span data-l="en">${en}</span>`;
  const LOC = { uz: 'uz-Latn-UZ', ru: 'ru-RU', en: 'en-GB' };
  const UZ_M = ['Yanvar', 'Fevral', 'Mart', 'Aprel', 'May', 'Iyun', 'Iyul', 'Avgust', 'Sentabr', 'Oktabr', 'Noyabr', 'Dekabr'];
  const UZ_MS = ['Yan', 'Fev', 'Mar', 'Apr', 'May', 'Iyn', 'Iyl', 'Avg', 'Sen', 'Okt', 'Noy', 'Dek'];
  const UZ_W = ['Yakshanba', 'Dushanba', 'Seshanba', 'Chorshanba', 'Payshanba', 'Juma', 'Shanba'];
  const UZ_WS = ['Ya', 'Du', 'Se', 'Ch', 'Pa', 'Ju', 'Sh'];
  const uzDate = (d, o) => { // browsers often lack Uzbek month and day names, so write them out
    const p = {}; new Intl.DateTimeFormat('en-US', { year: 'numeric', month: 'numeric', day: 'numeric', weekday: 'short', hour: '2-digit', minute: '2-digit', hourCycle: 'h23', ...(o.timeZone ? { timeZone: o.timeZone } : {}) }).formatToParts(d).forEach(x => { p[x.type] = x.value; });
    if (o.hour && !o.month && !o.weekday) return `${p.hour}:${p.minute}`;
    const w = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(p.weekday), m = +p.month - 1;
    const mo = o.month ? (o.month === 'long' ? UZ_M : UZ_MS)[m] : '';
    let s = o.day && o.month ? `${+p.day}-${mo.toLowerCase()}` : mo;
    if (o.year) s += ` ${p.year}`;
    if (o.weekday) { const wd = (o.weekday === 'long' ? UZ_W : UZ_WS)[w]; s = s ? `${wd}, ${s}` : wd; }
    return s;
  };
  const fmt = (d, o, tz) => L(...['uz', 'ru', 'en'].map(l => { const opt = { ...o, ...(tz ? { timeZone: tz } : {}) }; if (l === 'uz') return esc(uzDate(d, opt)); try { return esc(d.toLocaleString(LOC[l], opt)); } catch (e) { return esc(d.toLocaleString('en-GB', opt)); } }));
  const myTz = (() => { try { return Intl.DateTimeFormat().resolvedOptions().timeZone || ''; } catch (e) { return ''; } })();
  const dayKey = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  const HM = { hour: '2-digit', minute: '2-digit', hourCycle: 'h23' };
  const NAMES = { whatsapp: 'WhatsApp', telegram: 'Telegram', zoom: 'Zoom', teams: 'Microsoft Teams' };
  const ERR = {
    slot_gone: L('Bu vaqt hozirgina band qilindi. Boshqa vaqtni tanlang.', 'Это время только что заняли. Выберите другое.', 'Someone just booked that time. Please choose another.'),
    first: L('Ismingizni yozing.', 'Укажите имя.', 'Please enter your first name.'),
    last: L('Familiyangizni yozing.', 'Укажите фамилию.', 'Please enter your last name.'),
    contact: L('Qoʻngʻiroq qayerda boʻlishini tanlang.', 'Выберите, где провести звонок.', 'Please choose where we should hold the call.'),
    name: L('Ism va familiyangizni yozing.', 'Укажите имя и фамилию.', 'Please enter your full name.'),
    phone: L('Telefon raqamini toʻliq yozing.', 'Укажите номер телефона полностью.', 'Please enter your full phone number.'),
    email: L('Toʻgʻri email yozing.', 'Укажите правильный email.', 'Please enter a valid email.'),
    consent: L('Iltimos, rozilik belgisini qoʻying.', 'Пожалуйста, отметьте согласие.', 'Please tick the consent box.'),
    time: L('Avval vaqtni tanlang.', 'Сначала выберите время.', 'Please choose a time first.'),
    too_many: L('Bugun juda koʻp soʻrov yuborildi. Ertaga urinib koʻring yoki bizga yozing.', 'Сегодня отправлено слишком много заявок. Попробуйте завтра или напишите нам.', 'Too many bookings today from this connection. Try tomorrow or write to us.'),
    phone_limit: L('Bu raqam bilan allaqachon 2 ta yozilish bor. Oʻzgartirish uchun bizga yozing.', 'На этот номер уже есть 2 записи. Чтобы изменить, напишите нам.', 'This phone number already has 2 bookings. Write to us to change one.'),
    server: L('Yozilib boʻlmadi. Qayta urinib koʻring.', 'Не удалось записаться. Попробуйте ещё раз.', 'Booking didn’t go through. Please try again.')
  };
  const root = $('#book'); if (!root) return;
  const form = $('#step-details'), msg = $('#book-msg'), btn = $('#book-btn');
  let DATA = null, byDay = {}, day = null, pick = null, week = null;
  const say = (html, cls) => { msg.innerHTML = html; msg.className = 'form-msg ' + (cls || ''); };
  const ZONES = [
    ['Asia/Tashkent', 'Toshkent', 'Ташкент', 'Tashkent'], ['Asia/Almaty', 'Olmaota', 'Алматы', 'Almaty'], ['Europe/Moscow', 'Moskva', 'Москва', 'Moscow'],
    ['Europe/Istanbul', 'Istanbul', 'Стамбул', 'Istanbul'], ['Asia/Dubai', 'Dubay', 'Дубай', 'Dubai'], ['Europe/Riga', 'Riga', 'Рига', 'Riga'],
    ['Europe/Berlin', 'Berlin', 'Берлин', 'Berlin'], ['Europe/London', 'London', 'Лондон', 'London'], ['Asia/Seoul', 'Seul', 'Сеул', 'Seoul'],
    ['America/New_York', 'Nyu-York', 'Нью-Йорк', 'New York'], ['America/Chicago', 'Chikago', 'Чикаго', 'Chicago'],
    ['America/Denver', 'Denver', 'Денвер', 'Denver'], ['America/Los_Angeles', 'Los-Anjeles', 'Лос-Анджелес', 'Los Angeles']
  ];
  let viewTz = 'Asia/Tashkent';
  try { if (myTz) { new Intl.DateTimeFormat('en', { timeZone: myTz }); viewTz = myTz; } } catch (e) {}
  const sameZone = () => !DATA || viewTz === DATA.tz;
  const offset = tz => { try { return new Intl.DateTimeFormat('en-US', { timeZone: tz, timeZoneName: 'shortOffset' }).formatToParts(new Date()).find(x => x.type === 'timeZoneName').value; } catch (e) { return ''; } };
  const slotDay = s => new Intl.DateTimeFormat('en-CA', { timeZone: viewTz, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(s));
  const hm = (d, tz = viewTz) => d.toLocaleTimeString('en-GB', { ...HM, timeZone: tz });
  (function zonePicker() {
    const sel = $('#tz'); if (!sel) return;
    const list = ZONES.some(z => z[0] === viewTz) ? ZONES : [[viewTz, ...Array(3).fill(viewTz.split('/').pop().replace(/_/g, ' '))], ...ZONES];
    const lang = ['uz', 'ru', 'en'].includes(document.documentElement.lang) ? document.documentElement.lang : 'uz';
    sel.innerHTML = list.map(([v, uz, ru, en]) => { const o = offset(v), t = c => esc(o ? `${c} (${o})` : c); return `<option value="${esc(v)}" data-uz="${t(uz)}" data-ru="${t(ru)}" data-en="${t(en)}"${v === viewTz ? ' selected' : ''}>${t({ uz, ru, en }[lang])}</option>`; }).join('');
    sel.addEventListener('change', () => { viewTz = sel.value; group(true); });
  })();

  async function load(keepDay) {
    try {
      const r = await fetch('/api/clinic?action=slots', { headers: { Accept: 'application/json' } });
      DATA = await r.json(); if (!r.ok || !Array.isArray(DATA.slots)) throw new Error();
    } catch (e) { $('#days').innerHTML = `<p class="form-msg err">${ERR.server}</p>`; return; }
    document.querySelectorAll('[data-len]').forEach(x => { x.textContent = DATA.minutes; });
    group(keepDay);
  }
  function group(keepDay) {
    byDay = {};
    DATA.slots.forEach(s => { const k = slotDay(s); (byDay[k] = byDay[k] || []).push(s); });
    const keys = Object.keys(byDay).sort();
    if (pick && !DATA.slots.includes(pick)) pick = null;
    if (pick) day = slotDay(pick);
    if (!keys.length) { $('.cal-h').hidden = true; $('#days').innerHTML = `<p class="muted">${L('Hozircha boʻsh vaqt yoʻq. Iltimos, bizga yozing.', 'Сейчас нет свободного времени. Пожалуйста, напишите нам.', 'No free times right now. Please write to us.')} <a class="link" href="contact.html#clinic">${L('Bogʻlanish', 'Связаться', 'Contact us')}</a></p>`; $('#times').innerHTML = ''; return; }
    if (!keepDay || !byDay[day]) day = keys[0];
    week = monday(day);
    cal();
    times(); summary();
  }
  function monday(k) { const d = new Date(k + 'T12:00:00'); d.setDate(d.getDate() - ((d.getDay() + 6) % 7)); return dayKey(d); }
  function addDays(k, n) { const d = new Date(k + 'T12:00:00'); d.setDate(d.getDate() + n); return dayKey(d); }
  function cal() {
    const keys = Object.keys(byDay).sort(), first = monday(keys[0]), last = monday(keys[keys.length - 1]);
    const days = [0, 1, 2, 3, 4, 5, 6].map(n => addDays(week, n));
    const a = new Date(days[0] + 'T12:00:00'), z = new Date(days[6] + 'T12:00:00');
    $('#cal-month').innerHTML = a.getMonth() === z.getMonth() ? fmt(a, { month: 'long', year: 'numeric' }) : `${fmt(a, { month: 'short' })} – ${fmt(z, { month: 'short', year: 'numeric' })}`;
    $('#cal-prev').disabled = week <= first; $('#cal-next').disabled = week >= last;
    if (!days.includes(day) || !byDay[day]) { day = days.find(k => byDay[k]) || day; }
    $('#days').innerHTML = days.map(k => { const d = new Date(k + 'T12:00:00'), has = !!byDay[k]; return `<button type="button" role="tab" data-day="${k}" aria-selected="${k === day && has}"${has ? '' : ' disabled'}><span class="wd">${fmt(d, { weekday: 'short' })}</span><b>${d.getDate()}</b></button>`; }).join('');
    $('#days').querySelectorAll('[data-day]:not([disabled])').forEach(b => b.addEventListener('click', () => { day = b.dataset.day; $('#days').querySelectorAll('[data-day]').forEach(x => x.setAttribute('aria-selected', x === b)); times(); }));
    times();
  }
  $('#cal-prev').addEventListener('click', () => { week = addDays(week, -7); cal(); });
  $('#cal-next').addEventListener('click', () => { week = addDays(week, 7); cal(); });
  function times() {
    $('#times').innerHTML = (byDay[day] || []).map(s => `<button type="button" data-t="${s}" aria-pressed="${s === pick}">${hm(new Date(s))}</button>`).join('');
    $('#times').querySelectorAll('[data-t]').forEach(b => b.addEventListener('click', () => { pick = b.dataset.t; $('#times').querySelectorAll('[data-t]').forEach(x => x.setAttribute('aria-pressed', x === b)); summary(); say(''); if (window.innerWidth < 900) form.scrollIntoView({ behavior: 'smooth', block: 'start' }); }));
  }
  const whenHtml = (s, mins, tz = true) => { const d = new Date(s);
    return `<p class="d">${fmt(d, { weekday: 'long', day: 'numeric', month: 'long' }, viewTz)}</p><p class="t">${hm(d)}–${hm(new Date(d.getTime() + mins * 60000))}</p>${!tz || sameZone() ? '' : `<p class="muted small">${L('Toshkent vaqti', 'По Ташкенту', 'Tashkent time')}: ${hm(d, DATA.tz)}</p>`}`; };
  function summary() {
    const c = form.contact.value;
    $('#sum-when').innerHTML = pick ? `${whenHtml(pick, DATA.minutes, false)}<p class="muted small">${L('Video-qoʻngʻiroq', 'Видеозвонок', 'Video call')}${NAMES[c] ? ' · ' + NAMES[c] : ''}</p>` : `<p class="muted">${L('Hali vaqt tanlanmagan', 'Время ещё не выбрано', 'No time chosen yet')}</p>`;
    btn.disabled = !pick;
  }
  form.addEventListener('change', e => { if (e.target.name === 'contact') { e.target.closest('fieldset').classList.remove('bad'); summary(); } });
  form.addEventListener('input', e => e.target.classList.remove('bad'));

  form.addEventListener('submit', async e => {
    e.preventDefault();
    const f = form, c = f.contact.value, email = f.email.value.trim().toLowerCase(), detail = email;
    const bad = (el, k) => { el.classList.add('bad'); if (el.focus) el.focus(); return say(ERR[k], 'err'); };
    if (!pick) return say(ERR.time, 'err');
    if (!f.first.value.trim()) return bad(f.first, 'first');
    if (!f.last.value.trim()) return bad(f.last, 'last');
    if (!/^[^\s@]+@[^\s@.]+(\.[^\s@.]+)+$/.test(email)) return bad(f.email, 'email');
    const dg = f.phone.value.replace(/\D/g, '').length;
    if (dg < 8 || dg > 15) return bad(f.phone, 'phone');
    if (!c) { const fs = form.querySelector('[data-f="contact"]'); fs.classList.add('bad'); fs.querySelector('input').focus(); return say(ERR.contact, 'err'); }
    if (!f.consent.checked) return say(ERR.consent, 'err');
    btn.disabled = true; say(L('Yozilmoqda…', 'Записываем…', 'Booking…'), 'ok');
    const body = { start: pick, first: f.first.value.trim(), last: f.last.value.trim(), name: `${f.first.value.trim()} ${f.last.value.trim()}`, email, phone: f.phone.value.trim(), contact: c, contactDetail: detail, note: f.note.value.trim(), consent: true, website: f.website.value, lang: document.documentElement.lang };
    let r, d;
    try { r = await fetch('/api/clinic?action=book', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }); d = await r.json().catch(() => ({})); }
    catch (err) { r = { ok: false }; d = {}; }
    if (!r.ok) { say(ERR[d.error] || ERR.server, 'err'); btn.disabled = false; if (d.error === 'slot_gone') { pick = null; load(true); } return; }
    const b = d.booking, tashkent = new Date(b.start).toLocaleString('en-GB', { timeZone: DATA.tz, weekday: 'short', day: 'numeric', month: 'short', ...HM });
    /* email notice to the clinic via Netlify Forms (no health details in it) */
    try { await fetch('/', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ 'form-name': 'clinic-booking', 'booking-id': b.id, when: `${tashkent} (Tashkent)`, name: body.name, email: body.email, phone: body.phone, contact: NAMES[c], 'contact-detail': detail }).toString() }); } catch (err) {}
    done(b, body);
  });

  function done(b, body) {
    const how = c => c === 'zoom' || c === 'teams' ? body.email : body.phone;
    root.hidden = true; const box = $('#done'); box.hidden = false;
    box.innerHTML = `<div class="done-ico">${document.querySelector('#i-check') ? '<svg class="ic"><use href="#i-check"/></svg>' : '✓'}</div>
      <h2>${L('Siz yozildingiz!', 'Вы записаны!', 'You’re booked!')}</h2>
      <div class="sum-when">${whenHtml(b.start, b.minutes)}</div>
      <p>${L(`Konsultatsiyadan oldin siz bilan <b>${NAMES[body.contact]}</b> orqali bogʻlanamiz (${esc(how(body.contact))}) va havolani yuboramiz.`, `Перед консультацией мы свяжемся с вами через <b>${NAMES[body.contact]}</b> (${esc(how(body.contact))}) и отправим ссылку.`, `Before the consultation we’ll contact you on <b>${NAMES[body.contact]}</b> (${esc(how(body.contact))}) and send you the link.`)}</p>
      <p class="muted small">${L('Vaqtni oʻzgartirish kerak boʻlsa, bizga yozing.', 'Если нужно изменить время, напишите нам.', 'Need to change the time? Write to us.')}</p>
      <div class="actions"><button type="button" class="btn btn-p" id="ics">${L('Kalendarga qoʻshish', 'Добавить в календарь', 'Add to calendar')}</button><a class="btn btn-s" href="clinic.html">Shifo Clinic</a></div>`;
    $('#ics').addEventListener('click', () => {
      const z = d => new Date(d).toISOString().replace(/[-:]/g, '').replace(/\.\d+Z$/, 'Z'), end = Date.parse(b.start) + b.minutes * 60000;
      const ics = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Shifo Life//Clinic//EN', 'BEGIN:VEVENT', `UID:${b.id}@shifo-life`, `DTSTAMP:${z(Date.now())}`, `DTSTART:${z(b.start)}`, `DTEND:${z(end)}`,
        'SUMMARY:Shifo Clinic — online consultation', `DESCRIPTION:Video consultation. We will send the link on ${NAMES[body.contact]}.`, 'END:VEVENT', 'END:VCALENDAR'].join('\r\n');
      const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([ics], { type: 'text/calendar' })); a.download = 'shifo-consultation.ics'; document.body.appendChild(a); a.click(); a.remove();
    });
    box.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
  load();
})();
