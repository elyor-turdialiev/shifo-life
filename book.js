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
    name: L('Ism va familiyangizni yozing.', 'Укажите имя и фамилию.', 'Please enter your full name.'),
    phone: L('Telefon raqamini toʻliq yozing.', 'Укажите номер телефона полностью.', 'Please enter your full phone number.'),
    email: L('Zoom yoki Teams uchun email yozing.', 'Для Zoom или Teams укажите email.', 'Please enter an email for Zoom or Teams.'),
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
  const sameZone = () => !myTz || !DATA || myTz === DATA.tz;

  async function load(keepDay) {
    try {
      const r = await fetch('/api/clinic?action=slots', { headers: { Accept: 'application/json' } });
      DATA = await r.json(); if (!r.ok || !Array.isArray(DATA.slots)) throw new Error();
    } catch (e) { $('#days').innerHTML = `<p class="form-msg err">${ERR.server}</p>`; return; }
    document.querySelectorAll('[data-len]').forEach(x => { x.textContent = DATA.minutes; });
    byDay = {};
    DATA.slots.forEach(s => { const d = new Date(s); (byDay[dayKey(d)] = byDay[dayKey(d)] || []).push(s); });
    const keys = Object.keys(byDay).sort();
    const tzn = $('#tz-note'); tzn.hidden = sameZone();
    if (!sameZone()) { const city = esc(myTz.split('/').pop().replace(/_/g, ' ')); tzn.innerHTML = L(`Vaqtlar sizning vaqtingizda (${city}).`, `Время указано по вашему часовому поясу (${city}).`, `Times are in your time zone (${city}).`); }
    if (!keys.length) { $('.cal-h').hidden = true; $('#days').innerHTML = `<p class="muted">${L('Hozircha boʻsh vaqt yoʻq. Iltimos, bizga yozing.', 'Сейчас нет свободного времени. Пожалуйста, напишите нам.', 'No free times right now. Please write to us.')} <a class="link" href="contact.html#clinic">${L('Bogʻlanish', 'Связаться', 'Contact us')}</a></p>`; $('#times').innerHTML = ''; return; }
    if (!keepDay || !byDay[day]) day = keys[0];
    if (pick && !DATA.slots.includes(pick)) pick = null;
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
    $('#times').innerHTML = (byDay[day] || []).map(s => `<button type="button" data-t="${s}" aria-pressed="${s === pick}">${new Date(s).toLocaleTimeString('en-GB', HM)}</button>`).join('');
    $('#times').querySelectorAll('[data-t]').forEach(b => b.addEventListener('click', () => { pick = b.dataset.t; $('#times').querySelectorAll('[data-t]').forEach(x => x.setAttribute('aria-pressed', x === b)); summary(); say(''); if (window.innerWidth < 900) form.scrollIntoView({ behavior: 'smooth', block: 'start' }); }));
  }
  const whenHtml = (s, mins, tz = true) => { const d = new Date(s);
    return `<p class="d">${fmt(d, { weekday: 'long', day: 'numeric', month: 'long' })}</p><p class="t">${d.toLocaleTimeString('en-GB', HM)}–${new Date(d.getTime() + mins * 60000).toLocaleTimeString('en-GB', HM)}</p>${!tz || sameZone() ? '' : `<p class="muted small">${L('Toshkent vaqti', 'По Ташкенту', 'Tashkent time')}: ${d.toLocaleTimeString('en-GB', { ...HM, timeZone: DATA.tz })}</p>`}`; };
  function summary() {
    const c = form.contact.value;
    $('#sum-when').innerHTML = pick ? `${whenHtml(pick, DATA.minutes, false)}<p class="muted small">${L('Video-qoʻngʻiroq', 'Видеозвонок', 'Video call')} · ${NAMES[c]}</p>` : `<p class="muted">${L('Hali vaqt tanlanmagan', 'Время ещё не выбрано', 'No time chosen yet')}</p>`;
    btn.disabled = !pick;
  }
  const onContact = () => {
    const c = form.contact.value, email = c === 'zoom' || c === 'teams';
    $('#detail-field').hidden = !email; form.contactDetail.required = email; if (!email) form.contactDetail.value = '';
    summary();
  };
  form.contact.addEventListener('change', onContact); onContact();

  form.addEventListener('submit', async e => {
    e.preventDefault();
    const f = form, c = f.contact.value, detail = f.contactDetail.value.trim();
    if (!pick) return say(ERR.time, 'err');
    if (f.name.value.trim().length < 2) { f.name.focus(); return say(ERR.name, 'err'); }
    if (f.phone.value.replace(/\D/g, '').length < 7) { f.phone.focus(); return say(ERR.phone, 'err'); }
    if ((c === 'zoom' || c === 'teams') && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(detail)) { f.contactDetail.focus(); return say(ERR.email, 'err'); }
    if (!f.consent.checked) return say(ERR.consent, 'err');
    btn.disabled = true; say(L('Yozilmoqda…', 'Записываем…', 'Booking…'), 'ok');
    const body = { start: pick, name: f.name.value.trim(), phone: f.phone.value.trim(), contact: c, contactDetail: detail, note: f.note.value.trim(), consent: true, website: f.website.value, lang: document.documentElement.lang };
    let r, d;
    try { r = await fetch('/api/clinic?action=book', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }); d = await r.json().catch(() => ({})); }
    catch (err) { r = { ok: false }; d = {}; }
    if (!r.ok) { say(ERR[d.error] || ERR.server, 'err'); btn.disabled = false; if (d.error === 'slot_gone') { pick = null; load(true); } return; }
    const b = d.booking, tashkent = new Date(b.start).toLocaleString('en-GB', { timeZone: DATA.tz, weekday: 'short', day: 'numeric', month: 'short', ...HM });
    /* email notice to the clinic via Netlify Forms (no health details in it) */
    try { await fetch('/', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ 'form-name': 'clinic-booking', 'booking-id': b.id, when: `${tashkent} (Tashkent)`, name: body.name, phone: body.phone, contact: NAMES[c], 'contact-detail': detail }).toString() }); } catch (err) {}
    done(b, body);
  });

  function done(b, body) {
    const how = body.contactDetail || body.phone;
    root.hidden = true; const box = $('#done'); box.hidden = false;
    box.innerHTML = `<div class="done-ico">${document.querySelector('#i-check') ? '<svg class="ic"><use href="#i-check"/></svg>' : '✓'}</div>
      <h2>${L('Siz yozildingiz!', 'Вы записаны!', 'You’re booked!')}</h2>
      <div class="sum-when">${whenHtml(b.start, b.minutes)}</div>
      <p>${L(`Konsultatsiyadan oldin siz bilan <b>${NAMES[body.contact]}</b> orqali bogʻlanamiz (${esc(how)}) va havolani yuboramiz.`, `Перед консультацией мы свяжемся с вами через <b>${NAMES[body.contact]}</b> (${esc(how)}) и отправим ссылку.`, `Before the consultation we’ll contact you on <b>${NAMES[body.contact]}</b> (${esc(how)}) and send you the link.`)}</p>
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
