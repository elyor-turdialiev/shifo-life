/* Shifo Academy — live login and student/teacher areas (Netlify Identity).
   Talks to the site's own Identity endpoint at /.netlify/identity and the
   functions at /.netlify/functions/course and /.netlify/functions/students. */
(function () {
  const API = '/.netlify/identity';
  const KEY = 'shifo-auth';
  const page = document.body.dataset.page;
  const doc = document.documentElement;
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const L = (uz, ru, en) => `<span data-l="uz">${uz}</span><span data-l="ru">${ru}</span><span data-l="en">${en}</span>`;
  const I = n => `<svg class="ic" aria-hidden="true"><use href="#i-${n}"/></svg>`;
  const toast = html => { const t = document.getElementById('toast'); if (!t) return; t.innerHTML = html; t.classList.add('show'); clearTimeout(t._h); t._h = setTimeout(() => t.classList.remove('show'), 3500); };

  /* ---------- session storage ---------- */
  const store = {
    read() { try { return JSON.parse(localStorage.getItem(KEY) || sessionStorage.getItem(KEY) || 'null'); } catch (e) { return null; } },
    write(s, remember) {
      try {
        const keep = remember === undefined ? !!localStorage.getItem(KEY) : remember;
        localStorage.removeItem(KEY); sessionStorage.removeItem(KEY);
        (keep ? localStorage : sessionStorage).setItem(KEY, JSON.stringify(s));
      } catch (e) {}
    },
    clear() { try { localStorage.removeItem(KEY); sessionStorage.removeItem(KEY); } catch (e) {} }
  };
  const saveTokens = (t, remember) => store.write({ access: t.access_token, refresh: t.refresh_token, exp: Date.now() + (t.expires_in || 3600) * 1000 }, remember);

  /* ---------- Identity API ---------- */
  async function req(path, opts = {}) {
    const res = await fetch(API + path, opts);
    let body = null; try { body = await res.json(); } catch (e) {}
    if (!res.ok) { const err = new Error((body && (body.error_description || body.msg || body.error)) || res.statusText); err.status = res.status; throw err; }
    return body;
  }
  const form = o => new URLSearchParams(o).toString();
  const auth = {
    async login(email, password, remember) {
      const t = await req('/token', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: form({ grant_type: 'password', username: email, password }) });
      saveTokens(t, remember); return auth.user();
    },
    async token() {
      const s = store.read(); if (!s) return null;
      if (Date.now() < s.exp - 60000) return s.access;
      try {
        const t = await req('/token', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: form({ grant_type: 'refresh_token', refresh_token: s.refresh }) });
        saveTokens(t); return t.access_token;
      } catch (e) { store.clear(); return null; }
    },
    async user() { const tk = await auth.token(); if (!tk) return null; try { return await req('/user', { headers: { Authorization: 'Bearer ' + tk } }); } catch (e) { return null; } },
    async update(data) { const tk = await auth.token(); return req('/user', { method: 'PUT', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + tk }, body: JSON.stringify(data) }); },
    recover: email => req('/recover', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email }) }),
    verify: (type, token, password) => req('/verify', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(password ? { type, token, password } : { type, token }) }),
    async logout() { const tk = await auth.token(); if (tk) { try { await fetch(API + '/logout', { method: 'POST', headers: { Authorization: 'Bearer ' + tk } }); } catch (e) {} } store.clear(); }
  };
  const rolesOf = u => ((u && u.app_metadata && u.app_metadata.roles) || []).map(r => String(r).toLowerCase().trim());
  const homeFor = u => rolesOf(u).some(r => r === 'teacher' || r === 'admin' || r === 'clinic') ? 'teacher.html' : 'student.html';
  const nameOf = u => (u.user_metadata && u.user_metadata.full_name) || u.email.split('@')[0];
  const initials = n => n.split(/\s+/).filter(Boolean).slice(0, 2).map(x => x[0].toUpperCase()).join('') || '•';
  async function fn(name, params) {
    const tk = await auth.token(); if (!tk) { location.replace('login.html'); throw new Error('login'); }
    const res = await fetch(`/.netlify/functions/${name}?${new URLSearchParams(params || {})}`, { headers: { Authorization: 'Bearer ' + tk } });
    const body = await res.json().catch(() => ({}));
    if (res.status === 401) { store.clear(); location.replace('login.html'); }
    if (!res.ok) { const e = new Error(body.error || res.status); e.code = body.error; throw e; }
    return body;
  }

  /* ================= LOGIN ================= */
  if (page === 'login') {
    /* Student / Teacher switch: changes the selected tab; after log in the account's own role decides the area */
    const roleBtns = document.querySelectorAll('[data-role]');
    const setRole = r => roleBtns.forEach(b => b.setAttribute('aria-pressed', b.dataset.role === r));
    roleBtns.forEach(b => b.addEventListener('click', () => { setRole(b.dataset.role); history.replaceState(null, '', b.dataset.role === 'teacher' ? '#teacher' : location.pathname); }));
    setRole(location.hash === '#teacher' ? 'teacher' : 'student');
    const views = ['login', 'reset', 'invite', 'newpw'].reduce((o, k) => (o[k] = document.getElementById(k + '-view'), o), {});
    const show = v => Object.entries(views).forEach(([k, el]) => el && (el.hidden = k !== v));
    document.querySelectorAll('[data-show]').forEach(a => a.addEventListener('click', e => { e.preventDefault(); show(a.dataset.show); }));
    document.querySelectorAll('[data-toggle-pw]').forEach(b => b.addEventListener('click', () => { const i = b.parentElement.querySelector('input'); i.type = i.type === 'password' ? 'text' : 'password'; }));
    document.querySelectorAll('.role').forEach(r => r.hidden = true); // role comes from the account itself
    const msg = (id, html, cls) => { const m = document.getElementById(id); m.innerHTML = html; m.className = 'form-msg ' + cls; };
    const busy = (f, on) => { const b = f.querySelector('button[type=submit]'); if (b) b.disabled = on; };
    const ERR = {
      creds: L('Email yoki parol notoʻgʻri.', 'Неверный email или пароль.', 'Wrong email or password.'),
      off: L('Kirish hali yoqilmagan. Shifo Academy bilan bogʻlaning.', 'Вход ещё не включён. Свяжитесь с Shifo Academy.', 'Log in isn’t switched on yet. Please contact Shifo Academy.'),
      link: L('Havola eskirgan yoki ishlatilgan. Yangisini soʻrang.', 'Ссылка устарела или уже использована. Запросите новую.', 'This link has expired or was already used. Ask for a new one.'),
      short: L('Parol kamida 8 belgidan iborat boʻlsin.', 'Пароль должен быть не короче 8 символов.', 'Use at least 8 characters for your password.'),
      match: L('Parollar mos emas.', 'Пароли не совпадают.', 'The passwords don’t match.'),
      net: L('Internet bilan bogʻliq muammo. Qayta urinib koʻring.', 'Проблема с интернетом. Попробуйте ещё раз.', 'Connection problem. Try again.')
    };
    const errText = e => e.status === 404 ? ERR.off : (e.status === 400 || e.status === 401 || e.status === 422) ? ERR.creds : ERR.net;

    // Already logged in → go straight in
    if (!location.hash) auth.user().then(u => { if (u) location.replace(homeFor(u)); });

    // Links from Identity emails
    const h = new URLSearchParams(location.hash.slice(1));
    let linkToken = null;
    if (h.get('invite_token')) { linkToken = h.get('invite_token'); show('invite'); }
    else if (h.get('recovery_token')) {
      show('newpw');
      auth.verify('recovery', h.get('recovery_token')).then(t => { saveTokens(t, true); history.replaceState(null, '', location.pathname); })
        .catch(() => msg('newpw-msg', ERR.link, 'err'));
    } else if (h.get('confirmation_token')) {
      auth.verify('signup', h.get('confirmation_token')).then(t => { saveTokens(t, true); return auth.user(); }).then(u => location.replace(homeFor(u))).catch(() => msg('login-msg', ERR.link, 'err'));
    } else if (location.hash === '#reset') show('reset');

    document.getElementById('login-form').addEventListener('submit', async e => {
      e.preventDefault(); const f = e.target;
      if (!/\S+@\S+\.\S+/.test(f.email.value) || !f.password.value) return msg('login-msg', L('Email va parolni kiriting.', 'Введите email и пароль.', 'Enter your email and password.'), 'err');
      busy(f, true); msg('login-msg', L('Kirilmoqda…', 'Входим…', 'Logging in…'), 'ok');
      try { const u = await auth.login(f.email.value.trim(), f.password.value, f.remember.checked); location.replace(homeFor(u)); }
      catch (err) { msg('login-msg', errText(err), 'err'); busy(f, false); }
    });
    document.getElementById('reset-form').addEventListener('submit', async e => {
      e.preventDefault(); const f = e.target;
      if (!/\S+@\S+\.\S+/.test(f.email.value)) return msg('reset-msg', L('Emailni toʻgʻri kiriting.', 'Введите корректный email.', 'Enter a valid email.'), 'err');
      busy(f, true);
      try { await auth.recover(f.email.value.trim()); } catch (err) { if (err.status === 404) { busy(f, false); return msg('reset-msg', ERR.off, 'err'); } }
      msg('reset-msg', L('Agar bu email roʻyxatda boʻlsa, parolni tiklash havolasi yuborildi. Pochtangizni tekshiring.', 'Если этот email зарегистрирован, мы отправили ссылку для восстановления. Проверьте почту.', 'If this email has an account, a reset link is on its way. Check your inbox.'), 'ok');
      busy(f, false);
    });
    document.getElementById('invite-form').addEventListener('submit', async e => {
      e.preventDefault(); const f = e.target;
      if (f.password.value.length < 8) return msg('invite-msg', ERR.short, 'err');
      if (f.password.value !== f.password2.value) return msg('invite-msg', ERR.match, 'err');
      busy(f, true);
      try {
        const t = await auth.verify('signup', linkToken, f.password.value);
        saveTokens(t, true);
        if (f.fullname.value.trim()) await auth.update({ data: { full_name: f.fullname.value.trim() } });
        const u = await auth.user(); history.replaceState(null, '', location.pathname); location.replace(homeFor(u));
      } catch (err) { msg('invite-msg', ERR.link, 'err'); busy(f, false); }
    });
    document.getElementById('newpw-form').addEventListener('submit', async e => {
      e.preventDefault(); const f = e.target;
      if (f.password.value.length < 8) return msg('newpw-msg', ERR.short, 'err');
      if (f.password.value !== f.password2.value) return msg('newpw-msg', ERR.match, 'err');
      busy(f, true);
      try { await auth.update({ password: f.password.value }); const u = await auth.user(); location.replace(homeFor(u)); }
      catch (err) { msg('newpw-msg', ERR.link, 'err'); busy(f, false); }
    });
    return;
  }

  if (page !== 'student' && page !== 'teacher') return;

  /* ================= AREAS ================= */
  const title = document.getElementById('view-title');
  const views = [...document.querySelectorAll('.view')];
  const navLinks = [...document.querySelectorAll('[data-view]')];
  const RENDER = {}, rendered = {};
  let USER = null, ALLOWED = null;

  function route() {
    let name = (location.hash || '#overview').slice(1);
    if (ALLOWED && !ALLOWED.includes(name)) name = ALLOWED[0];
    const v = views.find(x => x.id === 'view-' + name) || views[0];
    const key = v.id.slice(5);
    views.forEach(x => x.hidden = x !== v);
    navLinks.forEach(a => a.classList.toggle('on', a.dataset.view === key));
    title.innerHTML = L(esc(v.dataset.titleUz), esc(v.dataset.titleRu), esc(v.dataset.titleEn));
    if (!rendered[key] && RENDER[key]) { rendered[key] = true; RENDER[key](v); }
    window.scrollTo({ top: 0, behavior: 'instant' });
  }
  document.querySelectorAll('[data-logout]').forEach(a => a.addEventListener('click', async e => { e.preventDefault(); await auth.logout(); location.replace('login.html'); }));
  document.querySelectorAll('.icon-btn[aria-label="Notifications"]').forEach(b => b.addEventListener('click', () => toast(L('Yangi bildirishnomalar yoʻq.', 'Новых уведомлений нет.', 'No new notifications.'))));
  const loading = `<div class="card muted">${L('Yuklanmoqda…', 'Загрузка…', 'Loading…')}</div>`;
  const failed = e => `<div class="card"><p class="callout">${I('alert')}<span>${e && e.code === 'no_level'
    ? L('Akkauntingizga hali daraja biriktirilmagan. Shifo Academy bilan bogʻlaning.', 'К вашему аккаунту ещё не привязан уровень. Свяжитесь с Shifo Academy.', 'Your account doesn’t have a level yet. Please contact Shifo Academy.')
    : L('Yuklab boʻlmadi. Sahifani yangilang.', 'Не удалось загрузить. Обновите страницу.', 'Couldn’t load this. Refresh the page.')}</span></p></div>`;

  /* course reader (shared) */
  async function renderCourse(v, opts) {
    v.innerHTML = loading;
    const isT = page === 'teacher';
    let level = opts.level, edition = opts.edition || 'student';
    async function draw() {
      let list;
      try { list = await fn('course', { level, edition }); } catch (e) { v.innerHTML = failed(e); return; }
      level = list.level;
      const lastKey = `shifo-sec-${level}-${edition}`;
      let sel = (() => { try { return localStorage.getItem(lastKey); } catch (e) { return null; } })() || (list.sections[1] && list.sections[1].id) || list.sections[0].id;
      const tools = isT ? `<div class="toolbar" style="margin-bottom:16px">
          <div class="mini-tabs" role="tablist" style="margin:0">${list.levels.map(l => `<button type="button" role="tab" data-lv="${l}" aria-selected="${l === level}">${l.toUpperCase()}</button>`).join('')}</div>
          <div class="mini-tabs" role="tablist" style="margin:0"><button type="button" role="tab" data-ed="student" aria-selected="${edition === 'student'}">${L('Talaba kitobi', 'Книга студента', 'Student Edition')}</button><button type="button" role="tab" data-ed="teacher" aria-selected="${edition === 'teacher'}">${L('Oʻqituvchi kitobi', 'Книга преподавателя', 'Teacher Edition')}</button></div></div>` : '';
      const lab = s => s.id === 'intro' ? L('Kirish', 'Введение', 'Introduction') : s.id === 'progress' ? L('Natijalarim', 'Мой прогресс', 'My progress') : esc(s.title);
      const items = list.sections.map(s => `<li><button type="button" data-sec="${esc(s.id)}" aria-current="${s.id === sel}"><span class="n">${s.week || (s.id === 'intro' ? I('book') : I('chart'))}</span><span class="t">${lab(s)}</span></button></li>`).join('');
      v.innerHTML = `${tools}<div class="grid g12" style="align-items:start">
        <div class="card"><div class="card-h"><h3>Medical English · ${level.toUpperCase()}</h3><span class="tag rose">${edition === 'teacher' ? L('Oʻqituvchi', 'Преподаватель', 'Teacher') : L('Talaba', 'Студент', 'Student')}</span></div><ul class="weeklist">${items}</ul></div>
        <div id="sec-body">${loading}</div></div>`;
      const open = async id => {
        sel = id; try { localStorage.setItem(lastKey, id); localStorage.setItem('shifo-last-' + page, JSON.stringify({ level, edition, id })); } catch (e) {}
        v.querySelectorAll('[data-sec]').forEach(b => b.setAttribute('aria-current', b.dataset.sec === id));
        const box = v.querySelector('#sec-body'); box.innerHTML = loading;
        try {
          const r = await fn('course', { level, edition, section: id });
          const s = r.section;
          box.innerHTML = `<article class="card book"><p class="muted" style="font-size:.88rem;font-weight:600">${s.week ? L(s.week + '-hafta', 'Неделя ' + s.week, 'Week ' + s.week) + ' · ' + L(`${s.week * 3 - 2}–${s.week * 3}-darslar`, `Уроки ${s.week * 3 - 2}–${s.week * 3}`, `Lessons ${s.week * 3 - 2}–${s.week * 3}`) : 'Medical English · ' + level.toUpperCase()}</p><h2>${esc(s.title)}</h2>${s.html}</article>`;
          if (window.innerWidth < 900) box.scrollIntoView({ behavior: 'smooth' });
        } catch (e) { box.innerHTML = failed(e); }
      };
      v.querySelectorAll('[data-sec]').forEach(b => b.addEventListener('click', () => open(b.dataset.sec)));
      v.querySelectorAll('[data-lv]').forEach(b => b.addEventListener('click', () => { level = b.dataset.lv; draw(); }));
      v.querySelectorAll('[data-ed]').forEach(b => b.addEventListener('click', () => { edition = b.dataset.ed; draw(); }));
      open(sel);
    }
    draw();
  }

  /* ================= Academy data (schedule, homework, payments) ================= */
  const LOC = { uz: 'uz-Latn-UZ', ru: 'ru-RU', en: 'en-GB' };
  const fmt = (d, o) => L(...['uz', 'ru', 'en'].map(l => { try { return esc(d.toLocaleString(LOC[l], o)); } catch (e) { return esc(d.toLocaleString('en-GB', o)); } }));
  const dayFmt = d => fmt(d, { weekday: 'short', day: 'numeric', month: 'short' });
  const timeFmt = d => fmt(d, { hour: '2-digit', minute: '2-digit' });
  const monthFmt = m => { const [y, mo] = m.split('-').map(Number); return fmt(new Date(y, mo - 1, 1, 12), { month: 'long', year: 'numeric' }); };
  const dateBlock = d => `<span class="when"><b>${d.getDate()}</b><span>${fmt(d, { month: 'short' })}</span></span>`;
  const pre = s => esc(s).replace(/\n/g, '<br>');
  const money = n => '$' + (Math.round(n * 100) / 100).toFixed(2).replace(/\.00$/, '');

  async function api(action, o = {}) {
    const tk = await auth.token(); if (!tk) { location.replace('login.html'); throw new Error('login'); }
    const headers = { Authorization: 'Bearer ' + tk };
    let body;
    if (o.raw) { body = o.raw; headers['Content-Type'] = o.raw.type || 'application/octet-stream'; }
    else if (o.body) { body = JSON.stringify(o.body); headers['Content-Type'] = 'application/json'; }
    const res = await fetch(`${o.path || '/api/academy'}?${new URLSearchParams({ action, ...(o.params || {}) })}`, { method: o.body || o.raw ? 'POST' : 'GET', headers, body });
    if (o.blob && res.ok) return res.blob();
    const data = await res.json().catch(() => ({}));
    if (res.status === 401) { store.clear(); location.replace('login.html'); }
    if (!res.ok) { const e = new Error(data.error || res.status); e.code = data.error; throw e; }
    return data;
  }
  const ERRS = {
    too_big: L('Fayl juda katta (4 MB gacha).', 'Файл слишком большой (до 4 МБ).', 'That file is too big (4 MB max).'),
    type: L('Faqat rasm yoki audio yuklash mumkin.', 'Можно загружать только фото или аудио.', 'Only photos and audio can be uploaded.'),
    reviewed: L('Bu vazifa allaqachon tekshirilgan.', 'Это задание уже проверено.', 'This homework has already been reviewed.'),
    empty: L('Javob yozing yoki fayl qoʻshing.', 'Напишите ответ или добавьте файл.', 'Write an answer or add a file.'),
    link: L('Havola https:// bilan boshlanishi kerak.', 'Ссылка должна начинаться с https://', 'The link must start with https://'),
    admin: L('Toʻlovlarni faqat administrator oʻzgartiradi.', 'Оплаты меняет только администратор.', 'Only the admin can change payments.'),
    daily_limit: L('Bugungi mashgʻulot bajarildi. Ertaga yana!', 'Сегодняшняя практика уже пройдена. До завтра!', 'You’ve done today’s practice. See you tomorrow!'),
    ai_busy: L('AI hozir javob bera olmadi. Qayta urinib koʻring.', 'AI сейчас не ответил. Попробуйте ещё раз.', 'The AI didn’t answer just now. Please try again.'),
    not_set_up: L('Nutq mashqi hali sozlanmagan.', 'Разговорная практика ещё не настроена.', 'Speaking practice isn’t set up yet.'),
    time_up: L('Mashgʻulot vaqti tugadi.', 'Время практики закончилось.', 'This practice session has ended.'),
    ended: L('Mashgʻulot tugagan.', 'Практика уже завершена.', 'This practice session has ended.')
  };
  const speakApi = (action, o = {}) => api(action, { ...o, path: '/api/speak' });
  const errMsg = e => ERRS[e && e.code] || L('Saqlab boʻlmadi. Qayta urinib koʻring.', 'Не удалось сохранить. Попробуйте ещё раз.', 'Couldn’t save. Please try again.');

  /* drawer */
  const drawer = document.getElementById('drawer');
  const openDrawer = html => { drawer.querySelector('.panel-d').innerHTML = html; drawer.classList.add('open'); drawer.setAttribute('aria-hidden', 'false'); const f = drawer.querySelector('input, textarea, select'); if (f) f.focus(); return drawer.querySelector('.panel-d'); };
  const closeDrawer = () => { drawer.classList.remove('open'); drawer.setAttribute('aria-hidden', 'true'); };
  drawer.addEventListener('click', e => { if (e.target.closest('[data-close]')) closeDrawer(); });
  document.addEventListener('keydown', e => { if (e.key === 'Escape' && drawer.classList.contains('open')) closeDrawer(); });
  const dHead = (title, sub) => `<div class="card-h" style="margin:0 0 6px"><div>${sub ? `<p class="muted" style="font-size:.88rem;font-weight:600">${sub}</p>` : ''}<h2 id="drawer-title" style="font-size:1.4rem">${title}</h2></div><button type="button" class="icon-btn" data-close aria-label="Close">${I('x')}</button></div>`;

  /* lessons */
  const lessonState = l => {
    const s = Date.parse(l.start), e = s + (l.minutes || 60) * 60000, now = Date.now();
    return now > e ? 'past' : now >= s - 15 * 60000 ? 'open' : 'soon';
  };
  const joinBtn = l => {
    const st = lessonState(l);
    if (st === 'past') return `<span class="tag grey">${L('Oʻtdi', 'Прошло', 'Done')}</span>`;
    if (!l.link) return `<span class="tag grey">${L('Havola yoʻq', 'Нет ссылки', 'No link yet')}</span>`;
    if (st === 'open') return `<a class="btn btn-p btn-sm" href="${esc(l.link)}" target="_blank" rel="noopener">${I('video')}${L('Qoʻshilish', 'Войти', 'Join')}</a>`;
    return `<button type="button" class="btn btn-s btn-sm" disabled title="${{ uz: 'Havola dars boshlanishidan 15 daqiqa oldin ochiladi', ru: 'Ссылка откроется за 15 минут до начала', en: 'The link opens 15 minutes before the lesson' }[doc.lang] || ''}">${I('clock')}<span>${L('Ochiladi', 'Откроется в', 'Opens')} ${timeFmt(new Date(Date.parse(l.start) - 15 * 60000))}</span></button>`;
  };
  const lessonItem = (l, extra) => {
    const d = new Date(l.start);
    return `<li>${dateBlock(d)}<div class="what"><b>${esc(l.title || L('Dars', 'Урок', 'Lesson'))}</b><span>${dayFmt(d)} · ${timeFmt(d)} · ${l.minutes || 60} ${L('daq', 'мин', 'min')}${l.who ? ' · ' + esc(l.who) : ''}</span>${l.note ? `<span class="lnote">${esc(l.note)}</span>` : ''}</div>${extra || joinBtn(l)}</li>`;
  };
  const splitLessons = list => {
    const now = Date.now(), end = l => Date.parse(l.start) + (l.minutes || 60) * 60000;
    return { next: list.filter(l => end(l) > now), past: list.filter(l => end(l) <= now).reverse() };
  };

  /* homework */
  const hwState = h => h.review ? 'reviewed' : h.submission ? 'in' : 'todo';
  const HWTAG = {
    todo: `<span class="tag warn">${L('Topshirilmagan', 'Не сдано', 'To do')}</span>`,
    in: `<span class="tag rose">${L('Tekshiruvda', 'На проверке', 'Handed in')}</span>`,
    reviewed: `<span class="tag">${I('check')}${L('Tekshirildi', 'Проверено', 'Reviewed')}</span>`
  };
  const dueText = h => h.due ? `${L('Muddat', 'Срок', 'Due')}: ${dayFmt(new Date(h.due + 'T12:00:00'))}` : L('Muddatsiz', 'Без срока', 'No due date');
  const fileCache = {};
  async function fileURL(student, key) {
    if (fileCache[key]) return fileCache[key];
    const blob = await api('file', { params: { key, ...(student ? { student } : {}) }, blob: true });
    return (fileCache[key] = URL.createObjectURL(blob));
  }
  const filesHtml = files => (files || []).length ? `<div class="files">${files.map(f => f.type.startsWith('image/')
    ? `<a class="thumb" href="#" data-file="${esc(f.key)}" data-kind="img" aria-label="${esc(f.name)}"><span class="ph">${I('image')}</span></a>`
    : `<div class="aud" data-file="${esc(f.key)}" data-kind="audio"><span class="ph">${I('mic')}${esc(f.name)}</span></div>`).join('')}</div>` : '';
  async function hydrateFiles(root, student) {
    for (const el of root.querySelectorAll('[data-file]')) {
      try {
        const url = await fileURL(student, el.dataset.file);
        if (el.dataset.kind === 'img') { el.innerHTML = `<img src="${url}" alt="">`; el.href = url; el.target = '_blank'; el.rel = 'noopener'; }
        else el.innerHTML = `<audio controls preload="metadata" src="${url}"></audio>`;
      } catch (e) { el.classList.add('broken'); }
    }
  }
  const answerHtml = h => h.submission ? `<div class="answer-box"><p class="lbl">${L('Javob', 'Ответ', 'Answer')} · ${dayFmt(new Date(h.submission.at))}</p>${h.submission.text ? `<div class="answer">${pre(h.submission.text)}</div>` : ''}${filesHtml(h.submission.files)}</div>` : '';
  const reviewHtml = h => h.review ? `<div class="fb">${h.review.score ? `<span class="score">${h.review.score}/10</span> ` : ''}<b>${L('Oʻqituvchi izohi', 'Отзыв преподавателя', 'Teacher’s feedback')}:</b> ${pre(h.review.feedback || '—')}</div>` : '';

  /* photos: shrink before upload so phone pictures stay small */
  function shrinkImage(file) {
    return new Promise(resolve => {
      if (!/^image\/(jpeg|png|webp|heic|heif)/.test(file.type) && !file.type.startsWith('image/')) return resolve(file);
      const img = new Image(), url = URL.createObjectURL(file);
      img.onload = () => {
        const max = 1800, k = Math.min(1, max / Math.max(img.width, img.height));
        const c = document.createElement('canvas'); c.width = Math.round(img.width * k); c.height = Math.round(img.height * k);
        c.getContext('2d').drawImage(img, 0, 0, c.width, c.height); URL.revokeObjectURL(url);
        c.toBlob(b => resolve(b && b.size < file.size ? new File([b], file.name.replace(/\.\w+$/, '') + '.jpg', { type: 'image/jpeg' }) : file), 'image/jpeg', .85);
      };
      img.onerror = () => { URL.revokeObjectURL(url); resolve(file); };
      img.src = url;
    });
  }

  /* student hand-in form */
  function handIn(h, onSaved) {
    const keep = h.submission && !h.review ? (h.submission.files || []).slice() : [];
    const added = [];   // {file, url}
    let rec = null, chunks = [], timer = null;
    const p = openDrawer(`${dHead(esc(h.title), dueText(h))}
      ${h.text ? `<div class="answer" style="margin:6px 0 18px">${pre(h.text)}</div>` : ''}
      <form id="hand-in" novalidate>
        <label>${L('Javobingiz', 'Ваш ответ', 'Your answer')}<textarea name="text" placeholder="">${esc(h.submission && !h.review ? h.submission.text : '')}</textarea></label>
        <div class="attach">
          <label class="btn btn-s btn-sm file-pick">${I('image')}${L('Rasm qoʻshish', 'Добавить фото', 'Add photos')}<input type="file" accept="image/*" multiple hidden data-pick="image"></label>
          <button type="button" class="btn btn-s btn-sm" data-rec ${window.MediaRecorder ? '' : 'hidden'}>${I('mic')}<span>${L('Ovoz yozish', 'Записать голос', 'Record voice')}</span></button>
          <label class="btn btn-s btn-sm file-pick">${I('upload')}${L('Audio fayl', 'Аудиофайл', 'Audio file')}<input type="file" accept="audio/*" hidden data-pick="audio"></label>
        </div>
        <ul class="att-list" id="att"></ul>
        <p class="form-msg" id="hand-msg"></p>
        <button class="btn btn-p" type="submit">${I('upload')}${L('Topshirish', 'Сдать', 'Hand in')}</button>
      </form>`);
    const list = p.querySelector('#att'), msg = p.querySelector('#hand-msg');
    const say = (html, cls) => { msg.innerHTML = html; msg.className = 'form-msg ' + cls; };
    const draw = () => {
      list.innerHTML = keep.map((f, i) => `<li>${f.type.startsWith('image/') ? I('image') : I('mic')}<span>${esc(f.name)}</span><button type="button" class="icon-btn" data-rm-keep="${i}" aria-label="Remove">${I('x')}</button></li>`).join('') +
        added.map((a, i) => `<li>${a.file.type.startsWith('image/') ? `<img src="${a.url}" alt="">` : I('mic')}<span>${esc(a.file.name)}</span><small>${a.file.size < 1048576 ? Math.max(1, Math.round(a.file.size / 1024)) + ' KB' : (a.file.size / 1048576).toFixed(1) + ' MB'}</small><button type="button" class="icon-btn" data-rm="${i}" aria-label="Remove">${I('x')}</button></li>`).join('');
      list.querySelectorAll('[data-rm]').forEach(b => b.addEventListener('click', () => { added.splice(+b.dataset.rm, 1); draw(); }));
      list.querySelectorAll('[data-rm-keep]').forEach(b => b.addEventListener('click', () => { keep.splice(+b.dataset.rmKeep, 1); draw(); }));
    };
    const add = async files => {
      for (const f of files) {
        const file = f.type.startsWith('image/') ? await shrinkImage(f) : f;
        if (file.size > 4.4 * 1048576) { say(ERRS.too_big, 'err'); continue; }
        added.push({ file, url: URL.createObjectURL(file) });
      }
      draw();
    };
    p.querySelectorAll('[data-pick]').forEach(inp => inp.addEventListener('change', () => { add([...inp.files]); inp.value = ''; }));
    const recBtn = p.querySelector('[data-rec]');
    recBtn.addEventListener('click', async () => {
      if (rec) { rec.stop(); return; }
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        const type = ['audio/webm;codecs=opus', 'audio/mp4', 'audio/webm'].find(t => MediaRecorder.isTypeSupported && MediaRecorder.isTypeSupported(t)) || '';
        rec = new MediaRecorder(stream, type ? { mimeType: type, audioBitsPerSecond: 48000 } : { audioBitsPerSecond: 48000 });
        chunks = []; const t0 = Date.now();
        rec.ondataavailable = e => e.data.size && chunks.push(e.data);
        rec.onstop = () => {
          stream.getTracks().forEach(t => t.stop()); clearInterval(timer);
          const mime = (rec.mimeType || 'audio/webm').split(';')[0], ext = mime.includes('mp4') ? 'm4a' : 'webm';
          const n = added.filter(a => a.file.type.startsWith('audio/')).length + 1;
          add([new File(chunks, `voice-${n}.${ext}`, { type: mime })]);
          rec = null; recBtn.classList.remove('recording'); recBtn.querySelector('span').innerHTML = L('Ovoz yozish', 'Записать голос', 'Record voice');
        };
        rec.start(); recBtn.classList.add('recording');
        const tick = () => { const s = Math.floor((Date.now() - t0) / 1000); recBtn.querySelector('span').innerHTML = `${L('Toʻxtatish', 'Стоп', 'Stop')} · ${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; if (s >= 600) rec && rec.stop(); };
        tick(); timer = setInterval(tick, 500);
      } catch (e) { say(L('Mikrofonga ruxsat berilmadi.', 'Нет доступа к микрофону.', 'Microphone access was not allowed.'), 'err'); }
    });
    p.querySelector('#hand-in').addEventListener('submit', async e => {
      e.preventDefault();
      if (rec) rec.stop();
      const f = e.target, text = f.text.value.trim();
      if (!text && !keep.length && !added.length) return say(ERRS.empty, 'err');
      const btn = f.querySelector('[type=submit]'); btn.disabled = true;
      try {
        const files = keep.slice();
        for (let i = 0; i < added.length; i++) {
          say(`${L('Yuklanmoqda', 'Загрузка', 'Uploading')} ${i + 1}/${added.length}…`, 'ok');
          const a = added[i];
          const r = await api('upload', { params: { hw: h.id, name: a.file.name, type: a.file.type || 'application/octet-stream' }, raw: a.file });
          files.push(r.file);
        }
        say(L('Saqlanmoqda…', 'Сохраняем…', 'Saving…'), 'ok');
        const r = await api('submit', { body: { id: h.id, text, files } });
        closeDrawer(); onSaved(r.homework);
        toast(L('Topshirildi. Oʻqituvchingiz tekshiradi.', 'Сдано. Преподаватель проверит.', 'Handed in. Your teacher will review it.'));
      } catch (err) { say(errMsg(err), 'err'); btn.disabled = false; }
    });
  }

  /* ================= Speaking practice (AI) ================= */
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  const LV = { b1: 1, b2: 2, c1: 3 };
  const tr = o => o ? L(esc(o.uz || o.en), esc(o.ru || o.en), esc(o.en)) : '';
  const CRIT = [['fluency', L('Ravonlik', 'Беглость', 'Fluency')], ['vocabulary', L('Soʻz boyligi', 'Словарный запас', 'Vocabulary')], ['grammar', L('Grammatika', 'Грамматика', 'Grammar')], ['clarity', L('Aniqlik', 'Ясность', 'Clarity')], ['task', L('Vazifa', 'Задание', 'Task')]];
  let VOICE = null;
  const pickVoice = () => {
    if (!window.speechSynthesis) return;
    const vs = speechSynthesis.getVoices().filter(v => /^en[-_]/i.test(v.lang));
    VOICE = vs.find(v => /Google US English|Samantha|Natural|Aria|Jenny|Ava/i.test(v.name)) || vs.find(v => /en[-_]US/i.test(v.lang)) || vs[0] || null;
  };
  if (window.speechSynthesis) { pickVoice(); speechSynthesis.onvoiceschanged = pickVoice; }
  const sayAloud = (text, level, on) => {
    if (!on || !window.speechSynthesis || !text) return;
    speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text);
    if (VOICE) u.voice = VOICE;
    u.lang = (VOICE && VOICE.lang) || 'en-US'; u.rate = level === 'b1' ? .9 : 1;
    speechSynthesis.speak(u);
  };
  const scoreChart = list => {
    const pts = list.filter(s => s.eval).slice(0, 12).reverse();
    if (pts.length < 2) return `<p class="muted" style="font-size:.92rem">${L('Ikki va undan koʻp mashgʻulotdan keyin bu yerda rivojlanish grafigi chiqadi.', 'После двух и более занятий здесь появится график прогресса.', 'After two or more sessions, your progress chart appears here.')}</p>`;
    const W = 320, H = 120, P = 14, x = i => P + i * (W - 2 * P) / (pts.length - 1), y = v => H - P - (v - 1) * (H - 2 * P) / 9;
    const line = pts.map((s, i) => `${x(i).toFixed(1)},${y(s.eval.overall).toFixed(1)}`).join(' ');
    return `<svg class="spark-chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="Scores"><line x1="${P}" x2="${W - P}" y1="${y(5)}" y2="${y(5)}" class="mid"/><polyline points="${line}"/>${pts.map((s, i) => `<circle cx="${x(i).toFixed(1)}" cy="${y(s.eval.overall).toFixed(1)}" r="4"><title>${s.eval.overall}/10</title></circle>`).join('')}</svg>`;
  };
  const resultHtml = (s, sc) => {
    const e = s.eval;
    if (!e) return `<div class="card"><h3>${s.note === 'too_short' ? L('Baholash uchun juda qisqa', 'Слишком коротко для оценки', 'Too short to score') : L('Baho hali tayyor emas', 'Оценка ещё не готова', 'Not scored yet')}</h3><p class="muted" style="margin-top:8px">${s.note === 'too_short' ? L('Baho olish uchun kamida 3 marta gapiring.', 'Чтобы получить оценку, ответьте хотя бы 3 раза.', 'Speak at least 3 times to get a score.') : L('Qayta urinib koʻring.', 'Попробуйте ещё раз.', 'Please try again.')}</p></div>`;
    return `<div class="sp-result">
      <div class="card sp-score"><div class="big"><b>${e.overall}</b><span>/10</span></div><div><p class="k">${sc ? tr(sc.title) : ''}</p><p>${L('Koʻrsatilgan daraja', 'Показанный уровень', 'Level shown')}: <b>${esc(e.level_shown)}</b></p><p class="muted">${esc(e.summary)}</p></div></div>
      <div class="card"><h3>${L('Mezonlar', 'Критерии', 'Scores')}</h3><div class="bars">${CRIT.map(([k, t]) => `<div class="bar"><span>${t}</span><i style="--v:${e.scores[k] * 10}%"></i><b>${e.scores[k]}</b></div>`).join('')}</div></div>
      ${e.strengths.length ? `<div class="card"><h3>${L('Yaxshi chiqdi', 'Получилось хорошо', 'What went well')}</h3><ul class="ticks">${e.strengths.map(x => `<li>${I('check')}${esc(x)}</li>`).join('')}</ul></div>` : ''}
      ${e.corrections.length ? `<div class="card"><h3>${L('Tuzatishlar', 'Исправления', 'Corrections')}</h3><div class="fixes">${e.corrections.map(c => `<div class="fix"><p class="said">${esc(c.said)}</p><p class="better">${I('arrow')}${esc(c.better)}</p><p class="why">${esc(c.why)}</p></div>`).join('')}</div></div>` : ''}
      <div class="card next"><p class="k">${I('sparkle')}${L('Keyingi qadam', 'Следующий шаг', 'Practise next')}</p><p>${esc(e.next_step)}</p></div>
    </div>`;
  };
  const transcriptHtml = s => `<div class="chat static">${s.turns.map(t => `<div class="msg ${t.r}"><p>${esc(t.t)}</p></div>`).join('')}</div>`;

  /* ================= start ================= */
  (async function start() {
    USER = await auth.user();
    if (!USER) { location.replace('login.html'); return; }
    const roles = rolesOf(USER), isAdmin = roles.includes('admin'), isTeacher = isAdmin || roles.includes('teacher'), isClinic = isAdmin || roles.includes('clinic');
    if (page === 'teacher' && !isTeacher && !isClinic) { location.replace('student.html'); return; }
    if (page === 'student' && (isTeacher || isClinic)) { location.replace('teacher.html'); return; }
    if (page === 'teacher') {   /* show only the screens this account may use */
      const can = k => k === 'bookings' ? isClinic : isTeacher;
      ALLOWED = views.map(x => x.id.slice(5)).filter(can);
      navLinks.forEach(a => { if (!can(a.dataset.view)) a.hidden = true; });
    }
    const name = nameOf(USER), level = ['b1', 'b2', 'c1'].find(l => roles.includes(l));
    document.getElementById('me').innerHTML = `<span class="avatar${isTeacher ? ' c3' : ''}">${esc(initials(name))}</span><div><b>${esc(name)}</b><span>${isTeacher || isClinic ? (isAdmin ? L('Administrator', 'Администратор', 'Admin') : isTeacher ? L('Oʻqituvchi', 'Преподаватель', 'Teacher') : L('Klinika', 'Клиника', 'Clinic')) : 'Medical English' + (level ? ' · ' + level.toUpperCase() : '')}</span></div><a href="login.html" data-logout aria-label="Log out">${I('logout')}</a>`;
    document.querySelectorAll('#me [data-logout]').forEach(a => a.addEventListener('click', async e => { e.preventDefault(); await auth.logout(); location.replace('login.html'); }));
    const last = (() => { try { return JSON.parse(localStorage.getItem('shifo-last-' + page) || 'null'); } catch (e) { return null; } })();
    const rerender = (...keys) => keys.forEach(k => { rendered[k] = false; const v = document.getElementById('view-' + k); if (v && !v.hidden && RENDER[k]) { rendered[k] = true; RENDER[k](v); } });

    /* ---------------- STUDENT ---------------- */
    if (page === 'student') {
      let D = null;
      const load = async () => D || (D = await api('me'));
      const setCounts = () => document.querySelectorAll('[data-hw-count]').forEach(c => { const n = D ? D.homework.filter(h => hwState(h) === 'todo').length : 0; c.textContent = n; c.hidden = !n; });
      load().then(setCounts).catch(() => {});

      RENDER.overview = async v => {
        v.innerHTML = loading;
        try { await load(); } catch (e) { v.innerHTML = failed(e); return; }
        const { next } = splitLessons(D.schedule), todo = D.homework.filter(h => hwState(h) === 'todo');
        const fb = D.homework.find(h => h.review);
        const due = (D.payments || []).find(p => p.status !== 'paid');
        v.innerHTML = `<div class="grid g21">
          <div class="card hello"><svg class="bg"><use href="#mark-light"/></svg>
            <h2>${L('Salom', 'Здравствуйте', 'Hello')}, ${esc(name.split(' ')[0])}!</h2>
            <p>${next[0] ? `${L('Keyingi dars', 'Следующее занятие', 'Next lesson')}: ${dayFmt(new Date(next[0].start))}, ${timeFmt(new Date(next[0].start))}` : (level ? L(`Sizning darajangiz: ${level.toUpperCase()}`, `Ваш уровень: ${level.toUpperCase()}`, `Your level: ${level.toUpperCase()}`) : '')}</p>
            <div class="actions"><a class="btn btn-w" href="#course">${I('book')}${last ? L('Davom ettirish', 'Продолжить', 'Continue the course') : L('Kursni ochish', 'Открыть курс', 'Open my course')}</a><a class="btn btn-ghost" href="#schedule">${I('calendar')}${L('Jadval', 'Расписание', 'Schedule')}</a></div></div>
          <div class="card kpi"><p class="k">${I('edit')}${L('Uy vazifasi', 'Домашка', 'Homework')}</p><b>${todo.length}</b><small>${L('topshirish kerak', 'нужно сдать', 'to hand in')}</small>
            ${due ? `<div class="callout" style="margin-top:16px">${I('wallet')}<span>${monthFmt(due.month)}: ${due.status === 'overdue' ? L('toʻlov muddati oʻtgan', 'оплата просрочена', 'payment overdue') : L('toʻlov kutilmoqda', 'ожидается оплата', 'payment due')}</span></div>` : ''}</div>
        </div>
        <div class="grid g2" style="margin-top:18px">
          <div class="card"><div class="card-h"><h3>${L('Keyingi darslar', 'Ближайшие занятия', 'Next lessons')}</h3><a class="link" href="#schedule">${L('Hammasi', 'Все', 'See all')}${I('arrow')}</a></div>
            ${next.length ? `<ul class="list">${next.slice(0, 3).map(l => lessonItem(l)).join('')}</ul>` : `<p class="muted">${L('Hozircha rejalashtirilgan dars yoʻq.', 'Пока нет запланированных занятий.', 'No lessons planned yet.')}</p>`}</div>
          <div class="card"><div class="card-h"><h3>${L('Uy vazifasi', 'Домашнее задание', 'Homework')}</h3><a class="link" href="#homework">${L('Hammasi', 'Все', 'See all')}${I('arrow')}</a></div>
            ${todo.length ? todo.slice(0, 3).map(h => `<div class="hwi slim"><span class="ico">${I('edit')}</span><div><b>${esc(h.title)}</b><span class="meta">${dueText(h)}</span></div>${HWTAG.todo}</div>`).join('') : `<p class="muted">${L('Topshirilmagan vazifa yoʻq.', 'Несданных заданий нет.', 'Nothing to hand in.')}</p>`}
            ${fb ? `<p style="margin:18px 0 8px;font-weight:600;color:var(--ink);font-size:.95rem">${L('Oxirgi izoh', 'Последний отзыв', 'Latest feedback')}</p><div class="hwi slim"><span class="ico">${I('check')}</span><div><b>${esc(fb.title)}</b><span class="meta">${esc((fb.review.feedback || '').slice(0, 140))}</span></div>${fb.review.score ? `<span class="score">${fb.review.score}/10</span>` : ''}</div>` : ''}</div>
        </div>`;
      };

      RENDER.course = v => renderCourse(v, { level, edition: 'student' });

      RENDER.schedule = async v => {
        v.innerHTML = loading;
        try { await load(); } catch (e) { v.innerHTML = failed(e); return; }
        const { next, past } = splitLessons(D.schedule);
        v.innerHTML = `<div class="card"><div class="card-h"><h3>${L('Keyingi darslar', 'Ближайшие занятия', 'Upcoming lessons')}</h3><span class="tag rose">${L('Onlayn', 'Онлайн', 'Online')}</span></div>
          ${next.length ? `<ul class="list">${next.map(l => lessonItem(l)).join('')}</ul>` : `<p class="muted">${L('Oʻqituvchingiz darslarni qoʻshganda shu yerda koʻrinadi.', 'Занятия появятся здесь, когда преподаватель их добавит.', 'Lessons appear here when your teacher adds them.')}</p>`}</div>
          ${past.length ? `<div class="card" style="margin-top:18px"><div class="card-h"><h3>${L('Oʻtgan darslar', 'Прошедшие занятия', 'Past lessons')}</h3></div><ul class="list">${past.slice(0, 12).map(l => lessonItem(l)).join('')}</ul></div>` : ''}
          <p class="note">${L('Vaqt sizning mahalliy vaqtingizda. Havola dars boshlanishidan 15 daqiqa oldin ochiladi.', 'Время указано по вашему часовому поясу. Ссылка откроется за 15 минут до начала.', 'Times are in your local time. The link opens 15 minutes before the lesson.')}</p>`;
      };

      RENDER.homework = async v => {
        v.innerHTML = loading;
        try { await load(); } catch (e) { v.innerHTML = failed(e); return; }
        const card = h => {
          const st = hwState(h);
          return `<div class="hwi hw-card"><span class="ico">${I(st === 'reviewed' ? 'check' : 'edit')}</span>
            <div><b>${esc(h.title)}</b><span class="meta">${dueText(h)}${h.submission ? ' · ' + L('Topshirildi', 'Сдано', 'Handed in') + ' ' + dayFmt(new Date(h.submission.at)) : ''}</span></div>
            <div class="hw-act">${HWTAG[st]}${st !== 'reviewed' ? `<button type="button" class="btn ${st === 'todo' ? 'btn-p' : 'btn-s'} btn-sm" data-hand="${esc(h.id)}">${I('upload')}${st === 'todo' ? L('Topshirish', 'Сдать', 'Hand in') : L('Oʻzgartirish', 'Изменить', 'Change')}</button>` : ''}</div>
            ${h.text ? `<div class="task">${pre(h.text)}</div>` : ''}
            ${answerHtml(h)}${reviewHtml(h)}</div>`;
        };
        const groups = [['todo', L('Topshirish kerak', 'Нужно сдать', 'To hand in')], ['in', L('Tekshiruvda', 'На проверке', 'Waiting for review')], ['reviewed', L('Tekshirildi', 'Проверено', 'Reviewed')]];
        v.innerHTML = D.homework.length ? groups.map(([k, t]) => { const items = D.homework.filter(h => hwState(h) === k); return items.length ? `<h3 class="grp">${t} · ${items.length}</h3><div class="hw">${items.map(card).join('')}</div>` : ''; }).join('')
          : `<div class="card"><h3>${L('Hozircha uy vazifasi yoʻq', 'Пока нет домашних заданий', 'No homework yet')}</h3><p class="muted" style="margin-top:8px">${L('Oʻqituvchingiz vazifa berganda shu yerda paydo boʻladi.', 'Задания появятся здесь, когда преподаватель их даст.', 'Homework appears here when your teacher sets it.')}</p></div>`;
        v.querySelectorAll('[data-hand]').forEach(b => b.addEventListener('click', () => handIn(D.homework.find(h => h.id === b.dataset.hand), hw => { D.homework = hw; setCounts(); rerender('homework', 'overview'); })));
        hydrateFiles(v);
      };

      RENDER.speaking = async v => {
        v.innerHTML = loading;
        let D2; try { D2 = await speakApi('list'); } catch (e) { v.innerHTML = failed(e); return; }
        const SC = D2.scenarios, scOf = id => SC.find(x => x.id === id);
        const mine = LV[level] || 1;
        const open = D2.sessions.find(s => !s.ended && Date.now() - Date.parse(s.started) < D2.maxMinutes * 60000);
        const scored = D2.sessions.filter(s => s.eval), avg = scored.length ? (scored.slice(0, 5).reduce((a, s) => a + s.eval.overall, 0) / Math.min(5, scored.length)).toFixed(1) : '—';
        const sorted = SC.filter(x => LV[x.level] <= mine).sort((a, b) => (b.level === level) - (a.level === level) || LV[b.level] - LV[a.level]);
        v.innerHTML = `<div class="grid g21">
            <div class="card hello sp-hello"><svg class="bg"><use href="#mark-light"/></svg>
              <h2>${L('AI bilan nutq mashqi', 'Разговорная практика с AI', 'Speaking practice with AI')}</h2>
              <p>${L('Vaziyatni tanlang, AI bilan ingliz tilida gaplashing va baho hamda tuzatishlarni oling.', 'Выберите ситуацию, поговорите с AI по-английски и получите оценку и исправления.', 'Pick a scene, talk with the AI in English, and get scores and corrections.')}</p>
              <p class="sp-left">${open ? I('mic') + L('Boshlangan mashgʻulotingiz bor.', 'У вас есть начатая практика.', 'You have a session in progress.') : D2.left > 0 ? I('check') + L('Bugun 1 ta mashgʻulot mavjud', 'Сегодня доступна 1 практика', '1 session available today') : I('clock') + L('Bugungi mashgʻulot bajarildi. Keyingisi ertaga.', 'Сегодняшняя практика пройдена. Следующая завтра.', 'Today’s session is done. Next one tomorrow.')}</p>
              ${open ? `<div class="actions"><button type="button" class="btn btn-w" data-resume="${esc(open.id)}">${I('mic')}${L('Davom ettirish', 'Продолжить', 'Continue')}</button></div>` : ''}
            </div>
            <div class="card"><div class="card-h"><h3>${L('Rivojlanish', 'Прогресс', 'Progress')}</h3><span class="avg"><b>${avg}</b>/10</span></div>${scoreChart(D2.sessions)}<p class="muted" style="font-size:.82rem;margin-top:6px">${L('Oxirgi 5 ta mashgʻulotning oʻrtachasi', 'Среднее за последние 5 практик', 'Average of your last 5 sessions')}</p></div>
          </div>
          ${!SR ? `<div class="callout" style="margin-top:18px">${I('mic')}<span>${L('Ovozli kiritish Chrome, Edge yoki Safari’da ishlaydi. Bu brauzerda javobni yozishingiz mumkin.', 'Голосовой ввод работает в Chrome, Edge или Safari. В этом браузере можно печатать ответы.', 'Voice input works in Chrome, Edge or Safari. In this browser you can type your answers.')}</span></div>` : ''}
          <h3 class="grp" style="margin-top:28px">${L('Vaziyatni tanlang', 'Выберите ситуацию', 'Choose a scene')}</h3>
          <div class="grid g3 scenes">${sorted.map(x => `<div class="card scene"><div class="card-h" style="margin-bottom:10px"><span class="tag ${x.level === level ? 'rose' : 'grey'}">${x.level.toUpperCase()}</span><span class="muted who">${tr(x.who)}</span></div>
            <h3>${tr(x.title)}</h3><p class="muted">${tr(x.goal)}</p>
            <button type="button" class="btn ${x.level === level ? 'btn-p' : 'btn-s'} btn-sm" data-start="${esc(x.id)}" ${D2.left > 0 && !open ? '' : 'disabled'}>${I('mic')}${L('Boshlash', 'Начать', 'Start')}</button></div>`).join('')}</div>
          ${D2.sessions.length ? `<div class="card" style="margin-top:18px"><div class="card-h"><h3>${L('Oʻtgan mashgʻulotlar', 'Прошлые практики', 'Past sessions')}</h3></div><ul class="list">${D2.sessions.filter(s => s.ended).map(s => { const d = new Date(s.started), sc = scOf(s.scenario); return `<li>${dateBlock(d)}<div class="what"><b>${sc ? tr(sc.title) : esc(s.scenario)}</b><span>${dayFmt(d)} · ${s.turns} ${L('javob', 'ответов', 'replies')}</span></div>${s.eval ? `<button type="button" class="btn btn-s btn-sm" data-result="${esc(s.id)}"><b>${s.eval.overall}/10</b></button>` : s.note === 'score_failed' ? `<button type="button" class="btn btn-p btn-sm" data-rescore="${esc(s.id)}">${L('Baholash', 'Оценить', 'Get score')}</button>` : `<span class="tag grey">${L('Baholanmadi', 'Без оценки', 'Not scored')}</span>`}</li>`; }).join('')}</ul></div>` : ''}`;

        v.querySelectorAll('[data-start]').forEach(b => b.addEventListener('click', async () => {
          b.disabled = true;
          try { const r = await speakApi('start', { body: { scenario: b.dataset.start } }); room(v, r.session, scOf(r.session.scenario)); }
          catch (e) { toast(errMsg(e)); b.disabled = false; }
        }));
        v.querySelectorAll('[data-resume]').forEach(b => b.addEventListener('click', async () => {
          try { const r = await speakApi('session', { params: { id: b.dataset.resume } }); room(v, r.session, scOf(r.session.scenario)); } catch (e) { toast(errMsg(e)); }
        }));
        const showResult = (s, sc) => { const p = openDrawer(`${dHead(sc ? tr(sc.title) : '', dayFmt(new Date(s.started)))}${resultHtml(s, sc)}<details class="tx"><summary>${L('Suhbat matni', 'Текст разговора', 'Transcript')}</summary>${transcriptHtml(s)}</details>`); p.classList.add('wide'); };
        v.querySelectorAll('[data-result]').forEach(b => b.addEventListener('click', async () => {
          try { const r = await speakApi('session', { params: { id: b.dataset.result } }); showResult(r.session, scOf(r.session.scenario)); } catch (e) { toast(errMsg(e)); }
        }));
        v.querySelectorAll('[data-rescore]').forEach(b => b.addEventListener('click', async () => {
          b.disabled = true;
          try { const r = await speakApi('finish', { body: { id: b.dataset.rescore, lang: doc.lang } }); showResult(r.session, scOf(r.session.scenario)); rerender('speaking'); }
          catch (e) { toast(errMsg(e)); b.disabled = false; }
        }));

        /* the conversation */
        function room(v, S, sc) {
          let voiceOn = true, rec = null, busy = false, finished = false;
          const maxT = D2.maxTurns, mineCount = () => S.turns.filter(t => t.r === 'me').length;
          v.innerHTML = `<div class="card room">
              <div class="room-h"><div><p class="k"><span class="tag rose">${esc(S.level.toUpperCase())}</span> ${sc ? tr(sc.who) : ''}</p><h3>${sc ? tr(sc.title) : ''}</h3><p class="muted sc-goal">${sc ? tr(sc.goal) : ''}</p></div>
                <div class="room-tools"><span class="turns" id="turns"></span><button type="button" class="icon-btn" id="voice" aria-label="Voice">${I('volume')}</button><button type="button" class="btn btn-s btn-sm" id="end" title="${{ uz: 'Tugatish va baho olish', ru: 'Завершить и получить оценку', en: 'Finish and get feedback' }[doc.lang] || ''}">${I('check')}${L('Tugatish', 'Завершить', 'Finish')}</button></div></div>
              <div class="chat" id="chat" aria-live="polite"></div>
              <div class="talk">
                ${SR ? `<button type="button" class="mic" id="mic" aria-label="Speak">${I('mic')}</button><p class="hint" id="hint">${L('Bosing va gapiring', 'Нажмите и говорите', 'Tap and speak')}</p>` : ''}
                <form class="type" id="type"><input name="t" autocomplete="off" maxlength="600" placeholder="${{ uz: 'Yoki shu yerga yozing…', ru: 'Или напишите здесь…', en: 'Or type here…' }[doc.lang] || ''}"><button class="icon-btn" type="submit" aria-label="Send">${I('send')}</button></form>
              </div>
            </div>`;
          const chat = v.querySelector('#chat'), hint = v.querySelector('#hint'), mic = v.querySelector('#mic'), form = v.querySelector('#type');
          const counter = () => { v.querySelector('#turns').innerHTML = `${mineCount()}/${maxT}`; };
          const add = (r, t, cls) => { const d = document.createElement('div'); d.className = `msg ${r}${cls ? ' ' + cls : ''}`; d.innerHTML = `<p>${esc(t)}</p>${r === 'ai' && window.speechSynthesis ? `<button type="button" class="replay" aria-label="Play">${I('play')}</button>` : ''}`; const rb = d.querySelector('.replay'); if (rb) rb.addEventListener('click', () => sayAloud(t, S.level, true)); chat.appendChild(d); chat.scrollTop = chat.scrollHeight; return d; };
          S.turns.forEach(t => add(t.r, t.t)); counter();
          const last = S.turns[S.turns.length - 1]; if (last && last.r === 'ai') sayAloud(last.t, S.level, voiceOn);
          v.querySelector('#voice').addEventListener('click', e => { voiceOn = !voiceOn; e.currentTarget.innerHTML = I(voiceOn ? 'volume' : 'mute'); if (!voiceOn && window.speechSynthesis) speechSynthesis.cancel(); });
          async function send(text) {
            text = (text || '').trim(); if (!text || busy || finished) return;
            busy = true; add('me', text); const wait = add('ai', '…', 'typing');
            try {
              const r = await speakApi('turn', { body: { id: S.id, text } });
              S.turns.push({ r: 'me', t: text }, { r: 'ai', t: r.reply });
              wait.remove(); add('ai', r.reply); counter(); sayAloud(r.reply, S.level, voiceOn);
              if (r.turns >= maxT) finish();
            } catch (e) {
              wait.remove(); chat.lastChild.classList.add('unsent');
              if (e.code === 'time_up' || e.code === 'ended') finish(); else toast(errMsg(e));
            } finally { busy = false; }
          }
          form.addEventListener('submit', e => { e.preventDefault(); const t = form.t.value; form.t.value = ''; send(t); });
          if (mic) mic.addEventListener('click', () => {
            if (rec) { rec.stop(); return; }
            if (busy || finished) return;
            if (window.speechSynthesis) speechSynthesis.cancel();
            rec = new SR(); rec.lang = 'en-US'; rec.interimResults = true; rec.continuous = false;
            let fin = '';
            rec.onresult = e => { let mid = ''; for (let i = e.resultIndex; i < e.results.length; i++) { const t = e.results[i][0].transcript; if (e.results[i].isFinal) fin += t; else mid += t; } hint.textContent = (fin + mid) || '…'; };
            rec.onerror = e => { hint.innerHTML = e.error === 'not-allowed' || e.error === 'service-not-allowed' ? L('Mikrofonga ruxsat bering yoki yozing.', 'Разрешите доступ к микрофону или печатайте.', 'Allow the microphone, or type instead.') : L('Eshitilmadi. Qayta bosing.', 'Не расслышали. Нажмите ещё раз.', 'Didn’t catch that. Tap again.'); };
            rec.onend = () => { mic.classList.remove('on'); rec = null; const t = fin.trim(); if (t) { hint.innerHTML = L('Bosing va gapiring', 'Нажмите и говорите', 'Tap and speak'); send(t); } };
            mic.classList.add('on'); hint.innerHTML = L('Tinglayapman…', 'Слушаю…', 'Listening…');
            try { rec.start(); } catch (e) { mic.classList.remove('on'); rec = null; }
          });
          async function finish() {
            if (finished) return; finished = true;
            if (rec) rec.stop(); if (window.speechSynthesis) speechSynthesis.cancel();
            v.innerHTML = `<div class="card sp-wait">${I('sparkle')}<h3>${L('Nutqingiz baholanmoqda…', 'Оцениваем вашу речь…', 'Scoring your speaking…')}</h3><p class="muted">${L('Bir necha soniya.', 'Несколько секунд.', 'A few seconds.')}</p></div>`;
            let r; try { r = await speakApi('finish', { body: { id: S.id, lang: doc.lang } }); }
            catch (e) { toast(errMsg(e)); rendered.speaking = false; RENDER.speaking(v); return; }
            v.innerHTML = `<button type="button" class="link back" data-back>${I('arrowl')}${L('Nutq mashqi', 'Разговорная практика', 'Speaking practice')}</button>${resultHtml(r.session, sc)}<details class="tx card"><summary>${L('Suhbat matni', 'Текст разговора', 'Transcript')}</summary>${transcriptHtml(r.session)}</details>`;
            v.querySelector('[data-back]').addEventListener('click', () => RENDER.speaking(v));
          }
          v.querySelector('#end').addEventListener('click', finish);
          const left = Date.parse(S.started) + D2.maxMinutes * 60000 - Date.now();
          setTimeout(() => { if (!finished && v.isConnected) finish(); }, Math.max(1000, left));
        }
      };

      RENDER.payments = async v => {
        v.innerHTML = loading;
        try { await load(); } catch (e) { v.innerHTML = failed(e); return; }
        const P = D.payments || [];
        const PT = { paid: `<span class="tag">${I('check')}${L('Toʻlangan', 'Оплачено', 'Paid')}</span>`, due: `<span class="tag warn">${L('Kutilmoqda', 'Ожидается', 'Due')}</span>`, overdue: `<span class="tag bad">${L('Muddati oʻtgan', 'Просрочено', 'Overdue')}</span>` };
        v.innerHTML = `<div class="card"><div class="card-h"><h3>${L('Toʻlovlar', 'Оплаты', 'Payments')}</h3><span class="muted" style="font-size:.9rem">USD</span></div>
          ${P.length ? `<div class="months">${P.map(p => `<div class="month ${p.status}"><b>${monthFmt(p.month)}</b><span>${p.amount ? money(p.amount) : ''}</span><div>${PT[p.status]}</div>${p.note ? `<span class="pnote">${esc(p.note)}</span>` : ''}</div>`).join('')}</div>`
            : `<p class="muted">${L('Hozircha toʻlovlar kiritilmagan.', 'Оплаты пока не внесены.', 'No payments recorded yet.')}</p>`}
          <p class="note">${L('Toʻlov boʻyicha savollar boʻlsa, bizga yozing.', 'Вопросы по оплате? Напишите нам.', 'Questions about a payment? Write to us.')} <a class="link" href="contact.html#academy">${L('Bogʻlanish', 'Связаться', 'Contact us')}</a></p></div>`;
      };
    }

    /* ---------------- TEACHER / ADMIN ---------------- */
    if (page === 'teacher' && isTeacher) {
      let roster = null, board = null;
      const getRoster = async () => roster || (roster = (await fn('students')).students);
      const getBoard = async (fresh) => (!fresh && board) || (board = await api('board'));
      const who = id => { const s = (roster || []).find(x => x.id === id); return s ? (s.name || s.email) : ''; };
      const setCounts = () => document.querySelectorAll('[data-review-count]').forEach(c => { const n = board ? board.review.filter(h => !h.review).length : 0; c.textContent = n; c.hidden = !n; });
      Promise.all([getRoster(), getBoard()]).then(setCounts).catch(() => {});

      /* review drawer (shared by To review and the student page) */
      function reviewDrawer(sid, h, onSaved) {
        const p = openDrawer(`${dHead(esc(h.title), esc(who(sid)) + ' · ' + dayFmt(new Date(h.submission.at)))}
          ${h.text ? `<p class="lbl">${L('Vazifa', 'Задание', 'Task')}</p><div class="task">${pre(h.text)}</div>` : ''}
          ${answerHtml(h)}
          <form id="review-form" style="margin-top:18px">
            <label>${L('Baho', 'Оценка', 'Score')}<select name="score"><option value="">—</option>${Array.from({ length: 10 }, (_, i) => `<option${h.review && h.review.score === i + 1 ? ' selected' : ''}>${i + 1}</option>`).join('')}</select></label>
            <label>${L('Izoh', 'Отзыв', 'Feedback')}<textarea name="feedback">${esc(h.review ? h.review.feedback : '')}</textarea></label>
            <p class="form-msg" id="rv-msg"></p>
            <button class="btn btn-p" type="submit">${I('check')}${L('Saqlash', 'Сохранить', 'Save feedback')}</button>
          </form>`);
        hydrateFiles(p, sid);
        p.querySelector('#review-form').addEventListener('submit', async e => {
          e.preventDefault(); const f = e.target, btn = f.querySelector('[type=submit]'); btn.disabled = true;
          try {
            const r = await api('review', { body: { student: sid, id: h.id, score: f.score.value, feedback: f.feedback.value } });
            closeDrawer(); await getBoard(true); setCounts(); onSaved && onSaved(r.homework);
            toast(L('Izoh saqlandi. Talaba uni koʻradi.', 'Отзыв сохранён. Студент его увидит.', 'Feedback saved. The student can see it now.'));
          } catch (err) { const m = p.querySelector('#rv-msg'); m.innerHTML = errMsg(err); m.className = 'form-msg err'; btn.disabled = false; }
        });
      }

      RENDER.overview = async v => {
        v.innerHTML = loading;
        try { await Promise.all([getRoster(), getBoard()]); } catch (e) { v.innerHTML = failed(e); return; }
        const waiting = board.review.filter(h => !h.review), week = board.lessons.filter(l => Date.parse(l.start) < Date.now() + 7 * 864e5);
        v.innerHTML = `<div class="grid g21">
          <div class="card hello"><svg class="bg"><use href="#mark-light"/></svg>
            <h2>${L('Xayrli kun', 'Добрый день', 'Good day')}, ${esc(name.split(' ')[0])}!</h2>
            <p>${L('Talabalaringiz, darslar va uy vazifalari shu yerda.', 'Здесь ваши студенты, занятия и домашние задания.', 'Your students, lessons and homework are here.')}</p>
            <div class="actions"><a class="btn btn-w" href="#students">${I('users')}${L('Talabalar', 'Студенты', 'Students')}</a><a class="btn btn-ghost" href="#course">${I('book')}${L('Oʻqituvchi kitobi', 'Книга преподавателя', 'Teacher Edition')}</a></div></div>
          <div class="card kpi"><p class="k">${I('edit')}${L('Tekshirish kerak', 'Ждут проверки', 'To review')}</p><b>${waiting.length}</b><small>${L('topshirilgan ish', 'сданных работ', 'hand-ins')}</small></div>
        </div>
        <div class="grid g3" style="margin-top:18px">
          <div class="card kpi"><p class="k">${I('users')}${L('Talabalar', 'Студенты', 'Students')}</p><b>${roster.length}</b><small>${L('akkaunt', 'аккаунтов', 'accounts')}</small></div>
          <div class="card kpi"><p class="k">${I('calendar')}${L('Shu hafta', 'На этой неделе', 'This week')}</p><b>${week.length}</b><small>${L('dars', 'занятий', 'lessons')}</small></div>
          <div class="card kpi"><p class="k">${I('check')}${L('Tekshirilgan', 'Проверено', 'Reviewed')}</p><b>${board.review.length - waiting.length}</b><small>${L('ish', 'работ', 'hand-ins')}</small></div>
        </div>
        <div class="grid g2" style="margin-top:18px">
          <div class="card"><div class="card-h"><h3>${L('Keyingi darslar', 'Ближайшие занятия', 'Next lessons')}</h3><a class="link" href="#schedule">${L('Hammasi', 'Все', 'See all')}${I('arrow')}</a></div>
            ${board.lessons.length ? `<ul class="list">${board.lessons.slice(0, 4).map(l => lessonItem({ ...l, who: who(l.student) })).join('')}</ul>` : `<p class="muted">${L('Rejalashtirilgan dars yoʻq.', 'Нет запланированных занятий.', 'No lessons planned.')}</p>`}</div>
          <div class="card"><div class="card-h"><h3>${L('Tekshirish kerak', 'Ждут проверки', 'To review')}</h3><a class="link" href="#review">${L('Hammasi', 'Все', 'See all')}${I('arrow')}</a></div>
            ${waiting.length ? waiting.slice(0, 4).map(h => `<div class="hwi slim"><span class="avatar sm">${esc(initials(who(h.student) || '?'))}</span><div><b>${esc(h.title)}</b><span class="meta">${esc(who(h.student))} · ${dayFmt(new Date(h.submission.at))}</span></div><button type="button" class="btn btn-p btn-sm" data-rv="${esc(h.student)}|${esc(h.id)}">${L('Tekshirish', 'Проверить', 'Review')}</button></div>`).join('') : `<p class="muted">${L('Hammasi tekshirildi.', 'Всё проверено.', 'All caught up.')}</p>`}</div>
        </div>`;
        v.querySelectorAll('[data-rv]').forEach(b => b.addEventListener('click', () => { const [sid, id] = b.dataset.rv.split('|'); reviewDrawer(sid, board.review.find(h => h.student === sid && h.id === id), () => rerender('overview', 'review')); }));
      };

      RENDER.schedule = async v => {
        v.innerHTML = loading;
        try { await Promise.all([getRoster(), getBoard(true)]); } catch (e) { v.innerHTML = failed(e); return; }
        v.innerHTML = `<div class="card"><div class="card-h"><h3>${L('Barcha talabalar darslari', 'Занятия всех студентов', 'Lessons for all students')}</h3><span class="muted" style="font-size:.9rem">${L('Darsni talaba sahifasida qoʻshing', 'Добавляйте занятия на странице студента', 'Add lessons on a student’s page')}</span></div>
          ${board.lessons.length ? `<ul class="list">${board.lessons.map(l => lessonItem({ ...l, who: who(l.student) }, `<a class="btn btn-s btn-sm" href="#students" data-goto="${esc(l.student)}">${L('Ochish', 'Открыть', 'Open')}</a>`)).join('')}</ul>` : `<p class="muted">${L('Rejalashtirilgan dars yoʻq.', 'Нет запланированных занятий.', 'No lessons planned.')}</p>`}</div>`;
        v.querySelectorAll('[data-goto]').forEach(a => a.addEventListener('click', () => { openStudent = a.dataset.goto; rendered.students = false; }));
      };

      RENDER.review = async v => {
        v.innerHTML = loading;
        try { await Promise.all([getRoster(), getBoard(true)]); } catch (e) { v.innerHTML = failed(e); return; }
        setCounts();
        const waiting = board.review.filter(h => !h.review), done = board.review.filter(h => h.review).slice(0, 30);
        const item = h => `<div class="hwi"><span class="avatar">${esc(initials(who(h.student) || '?'))}</span><div><b>${esc(h.title)}</b><span class="meta">${esc(who(h.student))} · ${L('topshirildi', 'сдано', 'handed in')} ${dayFmt(new Date(h.submission.at))}${h.submission.files.length ? ' · ' + h.submission.files.length + ' ' + L('fayl', 'файл.', 'file(s)') : ''}</span></div>
          ${h.review ? `<button type="button" class="btn btn-s btn-sm" data-rv="${esc(h.student)}|${esc(h.id)}">${h.review.score ? h.review.score + '/10' : L('Tekshirildi', 'Проверено', 'Reviewed')}</button>` : `<button type="button" class="btn btn-p btn-sm" data-rv="${esc(h.student)}|${esc(h.id)}">${L('Tekshirish', 'Проверить', 'Review')}</button>`}</div>`;
        v.innerHTML = `<h3 class="grp">${L('Tekshirish kerak', 'Ждут проверки', 'Waiting for review')} · ${waiting.length}</h3><div class="hw">${waiting.map(item).join('') || `<div class="card muted">${L('Hammasi tekshirildi.', 'Всё проверено.', 'All caught up.')}</div>`}</div>
          ${done.length ? `<h3 class="grp">${L('Tekshirilgan', 'Проверено', 'Reviewed')} · ${done.length}</h3><div class="hw">${done.map(item).join('')}</div>` : ''}`;
        v.querySelectorAll('[data-rv]').forEach(b => b.addEventListener('click', () => { const [sid, id] = b.dataset.rv.split('|'); reviewDrawer(sid, board.review.find(h => h.student === sid && h.id === id), () => rerender('review', 'overview')); }));
      };

      /* students list + one student's page */
      let openStudent = null;
      RENDER.students = async v => {
        v.innerHTML = loading;
        let r; try { r = await getRoster(); } catch (e) { v.innerHTML = failed(e); return; }
        if (openStudent && r.some(s => s.id === openStudent)) return studentPage(v, r.find(s => s.id === openStudent));
        if (!r.length) { v.innerHTML = `<div class="card"><h3>${L('Hozircha talabalar yoʻq', 'Пока нет студентов', 'No students yet')}</h3><p class="muted" style="margin-top:8px">${L('Talabalarni Netlify’da taklif qiling va ularga “student” hamda darajasini (b1, b2 yoki c1) bering.', 'Пригласите студентов в Netlify и дайте им роль «student» и уровень (b1, b2 или c1).', 'Invite students in Netlify and give them the “student” role and a level (b1, b2 or c1).')}</p></div>`; return; }
        let q = '', lv = 'all';
        const rows = () => r.filter(s => (lv === 'all' || s.level === lv) && ((s.name + ' ' + s.email).toLowerCase().includes(q))).map(s => `<tr class="click" data-open="${esc(s.id)}" tabindex="0">
          <td><div class="person"><span class="avatar sm">${esc(initials(s.name || s.email))}</span><div><b>${esc(s.name || '—')}</b><span>${esc(s.email)}</span></div></div></td>
          <td>${s.level ? `<span class="tag rose">${s.level.toUpperCase()}</span>` : '<span class="tag grey">—</span>'}</td>
          <td>${s.confirmed ? `<span class="tag">${L('Faol', 'Активен', 'Active')}</span>` : `<span class="tag warn">${L('Taklif yuborilgan', 'Приглашён', 'Invited')}</span>`}</td>
          <td class="go">${I('arrow')}</td></tr>`).join('') || `<tr><td colspan="4" class="muted">${L('Hech kim topilmadi.', 'Никого не найдено.', 'No students match.')}</td></tr>`;
        v.innerHTML = `<div class="toolbar"><div class="chipset">${['all', 'b1', 'b2', 'c1'].map(x => `<button type="button" data-f="${x}" aria-pressed="${x === lv}">${x === 'all' ? L('Hammasi', 'Все', 'All') : x.toUpperCase()}</button>`).join('')}</div>
          <label class="search">${I('search')}<input type="search" aria-label="Search"></label></div>
          <div class="card" style="padding:8px 12px"><div class="tbl-wrap"><table class="tbl"><thead><tr><th>${L('Talaba', 'Студент', 'Student')}</th><th>${L('Daraja', 'Уровень', 'Level')}</th><th>${L('Holat', 'Статус', 'Status')}</th><th></th></tr></thead><tbody id="st-body">${rows()}</tbody></table></div></div>`;
        const bind = () => v.querySelectorAll('[data-open]').forEach(tr => { const go = () => { openStudent = tr.dataset.open; studentPage(v, r.find(s => s.id === openStudent)); }; tr.addEventListener('click', go); tr.addEventListener('keydown', e => { if (e.key === 'Enter') go(); }); });
        const inp = v.querySelector('.search input');
        inp.placeholder = { uz: 'Ism yoki email', ru: 'Имя или email', en: 'Name or email' }[doc.lang] || 'Name or email';
        inp.addEventListener('input', () => { q = inp.value.trim().toLowerCase(); v.querySelector('#st-body').innerHTML = rows(); bind(); });
        v.querySelectorAll('[data-f]').forEach(b => b.addEventListener('click', () => { lv = b.dataset.f; v.querySelectorAll('[data-f]').forEach(x => x.setAttribute('aria-pressed', x === b)); v.querySelector('#st-body').innerHTML = rows(); bind(); }));
        bind();
      };

      async function studentPage(v, s) {
        v.innerHTML = loading;
        let S; try { S = await api('student', { params: { id: s.id } }); } catch (e) { v.innerHTML = failed(e); return; }
        let tab = studentPage.tab || 'lessons';
        const draw = () => {
          studentPage.tab = tab;
          const tabs = [['lessons', L('Darslar', 'Занятия', 'Lessons')], ['homework', L('Uy vazifasi', 'Домашка', 'Homework')], ['speaking', L('Nutq', 'Разговор', 'Speaking')]].concat(isAdmin ? [['payments', L('Toʻlovlar', 'Оплаты', 'Payments')]] : []);
          let body = '';
          if (tab === 'speaking') {
            if (!S.speak) { body = loading; speakApi('list', { params: { student: s.id } }).then(r => { S.speak = r; }, e => { S.speak = { error: e }; }).then(() => { if (studentPage.tab === 'speaking' && v.isConnected) draw(); }); }
            else if (S.speak.error) body = failed(S.speak.error);
            else {
              const SC = S.speak.scenarios, scOf = id => SC.find(x => x.id === id), done = S.speak.sessions.filter(x => x.ended);
              const scored = done.filter(x => x.eval), avg = scored.length ? (scored.slice(0, 5).reduce((a, x) => a + x.eval.overall, 0) / Math.min(5, scored.length)).toFixed(1) : '—';
              body = `<div class="grid g21"><div class="card"><div class="card-h"><h3>${L('Mashgʻulotlar', 'Практики', 'Sessions')}</h3><span class="muted" style="font-size:.9rem">${done.length}</span></div>
                ${done.length ? `<ul class="list">${done.map(x => { const d = new Date(x.started), sc = scOf(x.scenario); return `<li>${dateBlock(d)}<div class="what"><b>${sc ? tr(sc.title) : esc(x.scenario)}</b><span>${dayFmt(d)} · ${x.level.toUpperCase()} · ${x.turns} ${L('javob', 'ответов', 'replies')}${x.eval ? ' · ' + CRIT.map(([k]) => x.eval.scores[k]).join('/') : ''}</span></div>${x.eval ? `<button type="button" class="btn btn-s btn-sm" data-sp="${esc(x.id)}"><b>${x.eval.overall}/10</b></button>` : `<button type="button" class="btn btn-s btn-sm" data-sp="${esc(x.id)}">${L('Matn', 'Текст', 'Transcript')}</button>`}</li>`; }).join('')}</ul>`
                  : `<p class="muted">${L('Talaba hali nutq mashqini qilmagan.', 'Студент ещё не проходил разговорную практику.', 'This student hasn’t done any speaking practice yet.')}</p>`}</div>
                <div class="card"><div class="card-h"><h3>${L('Rivojlanish', 'Прогресс', 'Progress')}</h3><span class="avg"><b>${avg}</b>/10</span></div>${scoreChart(S.speak.sessions)}</div></div>`;
            }
          }
          if (tab === 'lessons') {
            const { next, past } = splitLessons(S.schedule);
            const actions = l => `<div class="row-act"><button type="button" class="icon-btn" data-edit-lesson="${esc(l.id)}" aria-label="Edit">${I('edit')}</button><button type="button" class="icon-btn" data-del-lesson="${esc(l.id)}" aria-label="Delete">${I('x')}</button></div>`;
            body = `<div class="card"><div class="card-h"><h3>${L('Keyingi darslar', 'Ближайшие занятия', 'Upcoming lessons')}</h3><button type="button" class="btn btn-p btn-sm" data-add-lesson>${I('calendar')}${L('Dars qoʻshish', 'Добавить занятие', 'Add a lesson')}</button></div>
              ${next.length ? `<ul class="list">${next.map(l => lessonItem(l, actions(l))).join('')}</ul>` : `<p class="muted">${L('Rejalashtirilgan dars yoʻq.', 'Нет запланированных занятий.', 'No lessons planned.')}</p>`}</div>
              ${past.length ? `<div class="card" style="margin-top:18px"><div class="card-h"><h3>${L('Oʻtgan darslar', 'Прошедшие занятия', 'Past lessons')}</h3></div><ul class="list">${past.slice(0, 12).map(l => lessonItem(l, actions(l))).join('')}</ul></div>` : ''}`;
          }
          if (tab === 'homework') {
            const card = h => { const st = hwState(h); return `<div class="hwi hw-card"><span class="ico">${I(st === 'reviewed' ? 'check' : 'edit')}</span>
              <div><b>${esc(h.title)}</b><span class="meta">${dueText(h)}</span></div>
              <div class="hw-act">${HWTAG[st]}${st !== 'todo' ? `<button type="button" class="btn ${st === 'in' ? 'btn-p' : 'btn-s'} btn-sm" data-rv-hw="${esc(h.id)}">${st === 'in' ? L('Tekshirish', 'Проверить', 'Review') : L('Izohni oʻzgartirish', 'Изменить отзыв', 'Edit feedback')}</button>` : ''}<button type="button" class="icon-btn" data-edit-hw="${esc(h.id)}" aria-label="Edit">${I('edit')}</button><button type="button" class="icon-btn" data-del-hw="${esc(h.id)}" aria-label="Delete">${I('x')}</button></div>
              ${h.text ? `<div class="task">${pre(h.text)}</div>` : ''}${answerHtml(h)}${reviewHtml(h)}</div>`; };
            body = `<div class="toolbar"><p class="muted" style="align-self:center">${L('Vazifa ixtiyoriy: kerak boʻlsa qoʻshing.', 'Задание необязательно: добавьте, если нужно.', 'Homework is optional: add it when you need it.')}</p><button type="button" class="btn btn-p btn-sm" data-add-hw>${I('edit')}${L('Vazifa qoʻshish', 'Добавить задание', 'Add homework')}</button></div>
              <div class="hw">${S.homework.map(card).join('') || `<div class="card muted">${L('Bu talabaga hali vazifa berilmagan.', 'Этому студенту ещё не задано заданий.', 'No homework set for this student yet.')}</div>`}</div>`;
          }
          if (tab === 'payments') {
            const PT = { paid: `<span class="tag">${I('check')}${L('Toʻlangan', 'Оплачено', 'Paid')}</span>`, due: `<span class="tag warn">${L('Kutilmoqda', 'Ожидается', 'Due')}</span>`, overdue: `<span class="tag bad">${L('Muddati oʻtgan', 'Просрочено', 'Overdue')}</span>` };
            body = `<div class="card"><div class="card-h"><h3>${L('Toʻlovlar', 'Оплаты', 'Payments')}</h3><button type="button" class="btn btn-p btn-sm" data-add-pay>${I('wallet')}${L('Oy qoʻshish', 'Добавить месяц', 'Add a month')}</button></div>
              ${(S.payments || []).length ? `<div class="tbl-wrap"><table class="tbl"><thead><tr><th>${L('Oy', 'Месяц', 'Month')}</th><th>${L('Summa', 'Сумма', 'Amount')}</th><th>${L('Holat', 'Статус', 'Status')}</th><th></th></tr></thead><tbody>${S.payments.map(p => `<tr><td><b>${monthFmt(p.month)}</b>${p.note ? `<br><span class="muted" style="font-size:.85rem">${esc(p.note)}</span>` : ''}</td><td>${p.amount ? money(p.amount) : '—'}</td><td>${PT[p.status]}</td><td><div class="row-act"><button type="button" class="icon-btn" data-edit-pay="${esc(p.id)}" aria-label="Edit">${I('edit')}</button><button type="button" class="icon-btn" data-del-pay="${esc(p.id)}" aria-label="Delete">${I('x')}</button></div></td></tr>`).join('')}</tbody></table></div>`
                : `<p class="muted">${L('Hali toʻlov kiritilmagan.', 'Оплаты ещё не внесены.', 'No payments recorded yet.')}</p>`}
              <p class="note">${L('Bu boʻlimni faqat siz (administrator) koʻrasiz. Talaba oʻz toʻlovlarini koʻradi.', 'Этот раздел видите только вы (администратор). Студент видит свои оплаты.', 'Only you (admin) see this section. The student sees their own payments.')}</p></div>`;
          }
          v.innerHTML = `<button type="button" class="link back" data-back>${I('arrowl')}${L('Barcha talabalar', 'Все студенты', 'All students')}</button>
            <div class="card st-head"><div class="person"><span class="avatar">${esc(initials(s.name || s.email))}</span><div><b>${esc(s.name || s.email)}</b><span>${esc(s.email)}</span></div></div>${s.level ? `<span class="tag rose">Medical English · ${s.level.toUpperCase()}</span>` : ''}</div>
            <div class="mini-tabs" role="tablist">${tabs.map(([k, t]) => `<button type="button" role="tab" data-tab="${k}" aria-selected="${k === tab}">${t}</button>`).join('')}</div>
            <div id="st-tab">${body}</div>`;
          v.querySelector('[data-back]').addEventListener('click', () => { openStudent = null; RENDER.students(v); });
          v.querySelectorAll('[data-tab]').forEach(b => b.addEventListener('click', () => { tab = b.dataset.tab; draw(); }));
          bindTab();
          hydrateFiles(v, s.id);
        };
        const openSpeak = async id => {
          try {
            const r = await speakApi('session', { params: { student: s.id, id } }), sc = S.speak.scenarios.find(x => x.id === r.session.scenario);
            const p = openDrawer(`${dHead(sc ? tr(sc.title) : '', esc(s.name || s.email) + ' · ' + dayFmt(new Date(r.session.started)))}${resultHtml(r.session, sc)}<details class="tx" open><summary>${L('Suhbat matni', 'Текст разговора', 'Transcript')}</summary>${transcriptHtml(r.session)}</details>`);
            p.classList.add('wide');
          } catch (e) { toast(errMsg(e)); }
        };
        const saved = (k, list) => { S[k] = list; board = null; getBoard(true).then(setCounts).catch(() => {}); draw(); };
        const formMsg = (p, err) => { const m = p.querySelector('.form-msg'); m.innerHTML = errMsg(err); m.className = 'form-msg err'; };
        const two = n => String(n).padStart(2, '0');
        function bindTab() {
          /* lessons */
          const lessonForm = l => {
            const d = l ? new Date(l.start) : new Date(Date.now() + 864e5);
            const p = openDrawer(`${dHead(l ? L('Darsni oʻzgartirish', 'Изменить занятие', 'Edit lesson') : L('Yangi dars', 'Новое занятие', 'New lesson'), esc(s.name || s.email))}
              <form id="lesson-form">
                <div class="row2"><label>${L('Sana', 'Дата', 'Date')}<input type="date" name="date" required value="${d.getFullYear()}-${two(d.getMonth() + 1)}-${two(d.getDate())}"></label>
                <label>${L('Vaqt', 'Время', 'Time')}<input type="time" name="time" required value="${l ? two(d.getHours()) + ':' + two(d.getMinutes()) : '18:00'}"></label></div>
                <label>${L('Davomiyligi', 'Длительность', 'Length')}<select name="minutes">${[30, 45, 60, 90, 120].map(m => `<option value="${m}"${(l ? l.minutes : 60) === m ? ' selected' : ''}>${m} ${L('daqiqa', 'минут', 'minutes')}</option>`).join('')}</select></label>
                <label>${L('Mavzu', 'Тема', 'Topic')}<input name="title" maxlength="140" value="${esc(l ? l.title : '')}" placeholder="${{ uz: 'Masalan: 5-hafta, 2-dars', ru: 'Например: Неделя 5, урок 2', en: 'e.g. Week 5, lesson 2' }[doc.lang] || ''}"></label>
                <label>${L('Dars havolasi', 'Ссылка на урок', 'Lesson link')}<input name="link" type="url" inputmode="url" value="${esc(l ? l.link : '')}" placeholder="https://"></label>
                <label>${L('Izoh (ixtiyoriy)', 'Заметка (необязательно)', 'Note (optional)')}<input name="note" maxlength="500" value="${esc(l ? l.note : '')}"></label>
                <p class="form-msg"></p>
                <button class="btn btn-p" type="submit">${I('check')}${L('Saqlash', 'Сохранить', 'Save')}</button>
              </form>`);
            p.querySelector('form').addEventListener('submit', async e => {
              e.preventDefault(); const f = e.target, btn = f.querySelector('[type=submit]');
              const start = new Date(`${f.date.value}T${f.time.value}`);
              if (isNaN(start)) return formMsg(p, {});
              btn.disabled = true;
              try { const r = await api('lesson-save', { body: { student: s.id, lesson: { id: l && l.id, start: start.toISOString(), minutes: +f.minutes.value, title: f.title.value, link: f.link.value.trim(), note: f.note.value } } }); closeDrawer(); saved('schedule', r.schedule); toast(L('Dars saqlandi.', 'Занятие сохранено.', 'Lesson saved.')); }
              catch (err) { formMsg(p, err); btn.disabled = false; }
            });
          };
          const q = sel => v.querySelectorAll(sel);
          q('[data-add-lesson]').forEach(b => b.addEventListener('click', () => lessonForm(null)));
          q('[data-edit-lesson]').forEach(b => b.addEventListener('click', () => lessonForm(S.schedule.find(x => x.id === b.dataset.editLesson))));
          q('[data-del-lesson]').forEach(b => b.addEventListener('click', async () => {
            if (!confirmTwice(b)) return;
            try { const r = await api('lesson-delete', { body: { student: s.id, id: b.dataset.delLesson } }); saved('schedule', r.schedule); } catch (e) { toast(errMsg(e)); }
          }));
          /* homework */
          const hwForm = h => {
            const p = openDrawer(`${dHead(h ? L('Vazifani oʻzgartirish', 'Изменить задание', 'Edit homework') : L('Yangi vazifa', 'Новое задание', 'New homework'), esc(s.name || s.email))}
              <form id="hw-form">
                <label>${L('Sarlavha', 'Название', 'Title')}<input name="title" required maxlength="140" value="${esc(h ? h.title : '')}"></label>
                <label>${L('Vazifa matni', 'Текст задания', 'Instructions')}<textarea name="text" maxlength="6000">${esc(h ? h.text : '')}</textarea></label>
                <label>${L('Muddat (ixtiyoriy)', 'Срок (необязательно)', 'Due date (optional)')}<input type="date" name="due" value="${esc(h ? h.due : '')}"></label>
                <p class="form-msg"></p>
                <button class="btn btn-p" type="submit">${I('check')}${L('Saqlash', 'Сохранить', 'Save')}</button>
              </form>`);
            p.querySelector('form').addEventListener('submit', async e => {
              e.preventDefault(); const f = e.target, btn = f.querySelector('[type=submit]');
              if (!f.title.value.trim()) { f.title.focus(); return; }
              btn.disabled = true;
              try { const r = await api('hw-save', { body: { student: s.id, homework: { id: h && h.id, title: f.title.value, text: f.text.value, due: f.due.value } } }); closeDrawer(); saved('homework', r.homework); toast(L('Vazifa saqlandi. Talaba uni koʻradi.', 'Задание сохранено. Студент его увидит.', 'Homework saved. The student can see it now.')); }
              catch (err) { formMsg(p, err); btn.disabled = false; }
            });
          };
          q('[data-add-hw]').forEach(b => b.addEventListener('click', () => hwForm(null)));
          q('[data-edit-hw]').forEach(b => b.addEventListener('click', () => hwForm(S.homework.find(x => x.id === b.dataset.editHw))));
          q('[data-del-hw]').forEach(b => b.addEventListener('click', async () => {
            if (!confirmTwice(b)) return;
            try { const r = await api('hw-delete', { body: { student: s.id, id: b.dataset.delHw } }); saved('homework', r.homework); } catch (e) { toast(errMsg(e)); }
          }));
          q('[data-rv-hw]').forEach(b => b.addEventListener('click', () => reviewDrawer(s.id, S.homework.find(x => x.id === b.dataset.rvHw), list => saved('homework', list))));
          q('[data-sp]').forEach(b => b.addEventListener('click', () => openSpeak(b.dataset.sp)));
          /* payments (admin) */
          const payForm = pm => {
            const now = new Date();
            const p = openDrawer(`${dHead(pm ? L('Toʻlovni oʻzgartirish', 'Изменить оплату', 'Edit payment') : L('Yangi oy', 'Новый месяц', 'New month'), esc(s.name || s.email))}
              <form id="pay-form">
                <div class="row2"><label>${L('Oy', 'Месяц', 'Month')}<input type="month" name="month" required value="${esc(pm ? pm.month : now.getFullYear() + '-' + two(now.getMonth() + 1))}"></label>
                <label>${L('Summa (USD)', 'Сумма (USD)', 'Amount (USD)')}<input type="number" name="amount" min="0" step="0.01" value="${pm ? pm.amount : ''}"></label></div>
                <label>${L('Holat', 'Статус', 'Status')}<select name="status">${[['paid', L('Toʻlangan', 'Оплачено', 'Paid')], ['due', L('Kutilmoqda', 'Ожидается', 'Due')], ['overdue', L('Muddati oʻtgan', 'Просрочено', 'Overdue')]].map(([k]) => `<option value="${k}"${(pm ? pm.status : 'due') === k ? ' selected' : ''}>${{ paid: { uz: 'Toʻlangan', ru: 'Оплачено', en: 'Paid' }, due: { uz: 'Kutilmoqda', ru: 'Ожидается', en: 'Due' }, overdue: { uz: 'Muddati oʻtgan', ru: 'Просрочено', en: 'Overdue' } }[k][doc.lang] || k}</option>`).join('')}</select></label>
                <label>${L('Izoh (ixtiyoriy)', 'Заметка (необязательно)', 'Note (optional)')}<input name="note" maxlength="300" value="${esc(pm ? pm.note : '')}"></label>
                <p class="form-msg"></p>
                <button class="btn btn-p" type="submit">${I('check')}${L('Saqlash', 'Сохранить', 'Save')}</button>
              </form>`);
            p.querySelector('form').addEventListener('submit', async e => {
              e.preventDefault(); const f = e.target, btn = f.querySelector('[type=submit]'); btn.disabled = true;
              try { const r = await api('pay-save', { body: { student: s.id, payment: { id: pm && pm.id, month: f.month.value, amount: f.amount.value, status: f.status.value, note: f.note.value } } }); closeDrawer(); saved('payments', r.payments); toast(L('Toʻlov saqlandi.', 'Оплата сохранена.', 'Payment saved.')); }
              catch (err) { formMsg(p, err); btn.disabled = false; }
            });
          };
          q('[data-add-pay]').forEach(b => b.addEventListener('click', () => payForm(null)));
          q('[data-edit-pay]').forEach(b => b.addEventListener('click', () => payForm(S.payments.find(x => x.id === b.dataset.editPay))));
          q('[data-del-pay]').forEach(b => b.addEventListener('click', async () => {
            if (!confirmTwice(b)) return;
            try { const r = await api('pay-delete', { body: { student: s.id, id: b.dataset.delPay } }); saved('payments', r.payments); } catch (e) { toast(errMsg(e)); }
          }));
        }
        draw();
      }
      /* delete needs a second tap: no browser pop-ups */
      function confirmTwice(b) {
        if (b.dataset.sure) return true;
        b.dataset.sure = '1'; b.classList.add('sure'); b.innerHTML = `${I('x')}<span>${L('Oʻchirish?', 'Удалить?', 'Delete?')}</span>`;
        setTimeout(() => { if (b.isConnected) { delete b.dataset.sure; b.classList.remove('sure'); b.innerHTML = I('x'); } }, 3500);
        return false;
      }

      RENDER.course = v => renderCourse(v, { level: (last && last.level) || level || 'b1', edition: (last && last.edition) || 'teacher' });
    }

    /* ---------------- CLINIC BOOKINGS (admin / clinic) ---------------- */
    if (page === 'teacher' && isClinic) {
      const clinicApi = (action, o = {}) => api(action, { ...o, path: '/api/clinic' });
      const CN = { whatsapp: 'WhatsApp', telegram: 'Telegram', zoom: 'Zoom', teams: 'Teams' };
      const COND = { t1: L('1-tip diabet', 'Диабет 1 типа', 'Type 1'), t2: L('2-tip diabet', 'Диабет 2 типа', 'Type 2'), pre: L('Prediabet', 'Преддиабет', 'Prediabetes'), preg: L('Homiladorlikda', 'При беременности', 'In pregnancy'), unsure: L('Bilmaydi', 'Не знает', 'Not sure') };
      const ST = { booked: `<span class="tag warn">${L('Yangi', 'Новая', 'New')}</span>`, confirmed: `<span class="tag">${I('check')}${L('Tasdiqlangan', 'Подтверждена', 'Confirmed')}</span>`, done: `<span class="tag grey">${L('Oʻtkazildi', 'Проведена', 'Done')}</span>`, cancelled: `<span class="tag bad">${L('Bekor qilindi', 'Отменена', 'Cancelled')}</span>` };
      const myTz = (() => { try { return Intl.DateTimeFormat().resolvedOptions().timeZone; } catch (e) { return ''; } })();
      let B = null, SET = null, tab = 'upcoming';
      const contactLink = b => {
        const d = (b.contactDetail || '').trim(), num = (d.replace(/\D/g, '').length >= 7 ? d : b.phone).replace(/\D/g, '');
        if (b.contact === 'whatsapp') return `https://wa.me/${num}`;
        if (b.contact === 'telegram') return /^@?[A-Za-z][\w]{3,}$/.test(d) ? `https://t.me/${d.replace(/^@/, '')}` : `https://t.me/+${num}`;
        return d ? `mailto:${d}` : `tel:${b.phone}`;
      };
      const setCount = () => document.querySelectorAll('[data-book-count]').forEach(c => { const n = B ? B.filter(b => b.status === 'booked' && Date.parse(b.start) > Date.now()).length : 0; c.textContent = n; c.hidden = !n; });
      const loadB = async () => { const r = await clinicApi('bookings'); B = r.bookings; setCount(); return B; };
      loadB().catch(() => {});
      const tTime = (s, tz) => new Date(s).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', hourCycle: 'h23', ...(tz ? { timeZone: tz } : {}) });
      const two = n => String(n).padStart(2, '0');

      function detail(b, v) {
        const d = new Date(b.start);
        const p = openDrawer(`${dHead(esc(b.name), `${dayFmt(d)} · ${tTime(b.start)}${SET && myTz !== SET.tz ? ` (${L('Toshkent', 'Ташкент', 'Tashkent')} ${tTime(b.start, SET.tz)})` : ''}`)}
          <div class="bk-d">
            <p>${ST[b.status]}</p>
            <dl class="kv">
              <dt>${L('Telefon', 'Телефон', 'Phone')}</dt><dd><a class="link" href="tel:${esc(b.phone)}">${esc(b.phone)}</a></dd>
              <dt>${L('Aloqa', 'Связь', 'Contact via')}</dt><dd><a class="btn btn-s btn-sm" href="${esc(contactLink(b))}" target="_blank" rel="noopener">${I('chat')}${CN[b.contact]}${b.contactDetail ? ' · ' + esc(b.contactDetail) : ''}</a></dd>
              <dt>${L('Kim uchun', 'Для кого', 'For')}</dt><dd>${b.forWhom === 'family' ? L('Oila aʼzosi', 'Член семьи', 'A family member') : L('Oʻzi', 'Для себя', 'Themselves')}</dd>
              <dt>${L('Holat', 'Ситуация', 'Situation')}</dt><dd>${COND[b.condition] || '—'}</dd>
              <dt>${L('Til', 'Язык', 'Language')}</dt><dd>${esc((b.lang || '').toUpperCase())}</dd>
              <dt>${L('Yozildi', 'Записан', 'Booked')}</dt><dd>${dayFmt(new Date(b.created))}</dd>
            </dl>
            ${b.note ? `<p class="lbl">${L('Bemor izohi', 'Комментарий пациента', 'Patient’s note')}</p><div class="task">${pre(b.note)}</div>` : ''}
            <div class="bk-act">
              ${b.status === 'booked' ? `<button type="button" class="btn btn-p btn-sm" data-st="confirmed">${I('check')}${L('Tasdiqlash', 'Подтвердить', 'Confirm')}</button>` : ''}
              ${['booked', 'confirmed'].includes(b.status) ? `<button type="button" class="btn btn-s btn-sm" data-st="done">${L('Oʻtkazildi', 'Проведена', 'Mark done')}</button><button type="button" class="btn btn-s btn-sm" data-move>${I('calendar')}${L('Koʻchirish', 'Перенести', 'Move')}</button><button type="button" class="btn btn-s btn-sm danger" data-st="cancelled">${I('x')}${L('Bekor qilish', 'Отменить', 'Cancel')}</button>` : ''}
              ${b.status === 'cancelled' ? `<button type="button" class="btn btn-s btn-sm" data-st="booked">${L('Tiklash', 'Восстановить', 'Restore')}</button>` : ''}
            </div>
            <form id="move-form" hidden><div class="row2"><label>${L('Yangi sana', 'Новая дата', 'New date')}<input type="date" name="date" required value="${d.getFullYear()}-${two(d.getMonth() + 1)}-${two(d.getDate())}"></label><label>${L('Vaqt (sizning vaqtingiz)', 'Время (ваше)', 'Time (your time)')}<input type="time" name="time" required value="${two(d.getHours())}:${two(d.getMinutes())}"></label></div><button class="btn btn-p btn-sm" type="submit">${L('Koʻchirish', 'Перенести', 'Move')}</button></form>
            <form id="note-form"><label>${L('Ichki izoh (bemor koʻrmaydi)', 'Внутренняя заметка (пациент не видит)', 'Staff note (patient doesn’t see it)')}<textarea name="note" maxlength="2000">${esc(b.staffNote || '')}</textarea></label><button class="btn btn-s btn-sm" type="submit">${L('Saqlash', 'Сохранить', 'Save note')}</button></form>
            <p class="form-msg" id="bk-msg"></p>
          </div>`);
        const m = p.querySelector('#bk-msg'), sayE = e => { m.innerHTML = e && e.code === 'slot_gone' ? L('Bu vaqt band.', 'Это время занято.', 'That time is taken.') : errMsg(e); m.className = 'form-msg err'; };
        const upd = async body => { const r = await clinicApi('update', { body: { id: b.id, ...body } }); const i = B.findIndex(x => x.id === b.id); B[i] = r.booking; setCount(); rendered.bookings = false; RENDER.bookings(v); return r.booking; };
        p.querySelectorAll('[data-st]').forEach(x => x.addEventListener('click', async () => {
          if (x.dataset.st === 'cancelled' && !x.dataset.sure) { x.dataset.sure = 1; x.innerHTML = `${I('x')}${L('Ha, bekor qilish', 'Да, отменить', 'Yes, cancel')}`; return; }
          try { const nb = await upd({ status: x.dataset.st }); detail(nb, v); toast(L('Saqlandi.', 'Сохранено.', 'Saved.')); } catch (e) { sayE(e); }
        }));
        const mf = p.querySelector('#move-form');
        p.querySelectorAll('[data-move]').forEach(x => x.addEventListener('click', () => { mf.hidden = false; mf.date.focus(); }));
        mf.addEventListener('submit', async e => { e.preventDefault(); const t = new Date(`${mf.date.value}T${mf.time.value}`); if (isNaN(t)) return; try { const nb = await upd({ start: t.toISOString() }); detail(nb, v); toast(L('Koʻchirildi. Bemorga xabar bering.', 'Перенесено. Сообщите пациенту.', 'Moved. Let the patient know.')); } catch (err) { sayE(err); } });
        p.querySelector('#note-form').addEventListener('submit', async e => { e.preventDefault(); try { await upd({ staffNote: e.target.note.value }); toast(L('Izoh saqlandi.', 'Заметка сохранена.', 'Note saved.')); } catch (err) { sayE(err); } });
      }

      RENDER.bookings = async v => {
        v.innerHTML = loading;
        try { await Promise.all([loadB(), clinicApi('settings').then(r => { SET = r.settings; })]); } catch (e) { v.innerHTML = failed(e); return; }
        const now = Date.now(), up = B.filter(b => Date.parse(b.start) + b.minutes * 60000 > now && b.status !== 'cancelled'), past = B.filter(b => !up.includes(b)).reverse();
        const today = new Date().toDateString(), weekEnd = now + 7 * 864e5;
        const row = b => { const d = new Date(b.start); return `<li class="click" data-bk="${esc(b.id)}" tabindex="0">${dateBlock(d)}<div class="what"><b>${tTime(b.start)} · ${esc(b.name)}</b><span>${CN[b.contact]} · ${esc(b.phone)}${b.forWhom === 'family' ? ' · ' + L('oila aʼzosi', 'член семьи', 'family member') : ''}${b.condition ? ' · ' + (COND[b.condition] || '') : ''}</span></div>${ST[b.status]}</li>`; };
        const tabs = [['upcoming', L('Kelgusi', 'Предстоящие', 'Upcoming') + ` · ${up.length}`], ['past', L('Oʻtgan va bekor qilingan', 'Прошедшие и отменённые', 'Past and cancelled')], ['hours', L('Ish vaqti', 'Часы работы', 'Working hours')]];
        let body = '';
        if (tab === 'upcoming') body = up.length ? `<div class="card"><ul class="list">${up.map(row).join('')}</ul></div>` : `<div class="card"><h3>${L('Hozircha yozilishlar yoʻq', 'Пока нет записей', 'No bookings yet')}</h3><p class="muted" style="margin-top:8px">${L('Bemorlar “Konsultatsiyaga yozilish” sahifasida vaqt tanlaganda shu yerda koʻrinadi.', 'Записи появятся здесь, когда пациенты выберут время на странице записи.', 'Bookings appear here when patients pick a time on the booking page.')} <a class="link" href="book.html" target="_blank">book.html</a></p></div>`;
        if (tab === 'past') body = past.length ? `<div class="card"><ul class="list">${past.slice(0, 100).map(row).join('')}</ul></div>` : `<div class="card muted">${L('Hali yoʻq.', 'Пока нет.', 'Nothing yet.')}</div>`;
        if (tab === 'hours') {
          const DN = [[1, L('Dushanba', 'Понедельник', 'Monday')], [2, L('Seshanba', 'Вторник', 'Tuesday')], [3, L('Chorshanba', 'Среда', 'Wednesday')], [4, L('Payshanba', 'Четверг', 'Thursday')], [5, L('Juma', 'Пятница', 'Friday')], [6, L('Shanba', 'Суббота', 'Saturday')], [7, L('Yakshanba', 'Воскресенье', 'Sunday')]];
          body = `<form class="card hours" id="hours-form">
            <p class="muted">${L(`Barcha vaqtlar ${esc(SET.tz)} boʻyicha.`, `Всё время указано по ${esc(SET.tz)}.`, `All times are ${esc(SET.tz)} time.`)}</p>
            <div class="hours-grid">${DN.map(([n, t]) => { const r = (SET.week[n] || [])[0]; return `<div class="hrow"><label class="check"><input type="checkbox" name="on${n}" ${r ? 'checked' : ''}><span>${t}</span></label><input type="time" name="from${n}" value="${r ? r[0] : '10:00'}"><span class="muted">–</span><input type="time" name="to${n}" value="${r ? r[1] : '17:00'}"></div>`; }).join('')}</div>
            <div class="row2"><label>${L('Konsultatsiya davomiyligi', 'Длительность консультации', 'Consultation length')}<select name="minutes">${[30, 45, 60, 90].map(m => `<option value="${m}"${SET.minutes === m ? ' selected' : ''}>${m} min</option>`).join('')}</select></label>
            <label>${L('Oraliq tanaffus', 'Перерыв между', 'Break between')}<select name="gap">${[0, 5, 10, 15, 30].map(m => `<option value="${m}"${SET.gap === m ? ' selected' : ''}>${m} min</option>`).join('')}</select></label></div>
            <div class="row2"><label>${L('Kamida necha soat oldin yozilish', 'Запись минимум за (часов)', 'Book at least (hours ahead)')}<input type="number" name="notice" min="0" max="72" value="${SET.noticeHours}"></label>
            <label>${L('Necha kun oldinga koʻrsatish', 'Показывать дней вперёд', 'Show days ahead')}<input type="number" name="horizon" min="7" max="60" value="${SET.horizonDays}"></label></div>
            <div><p class="lbl">${L('Dam olish kunlari', 'Выходные дни', 'Days off')}</p><div class="offs" id="offs">${SET.off.filter(d => d >= new Date().toISOString().slice(0, 10)).map(d => `<span class="tag grey" data-off="${d}">${d} <button type="button" aria-label="Remove">${I('x')}</button></span>`).join('')}</div>
              <div class="off-add"><input type="date" id="off-new"><button type="button" class="btn btn-s btn-sm" id="off-add">${L('Qoʻshish', 'Добавить', 'Add day off')}</button></div></div>
            <p class="form-msg" id="hours-msg"></p>
            <button class="btn btn-p" type="submit">${I('check')}${L('Saqlash', 'Сохранить', 'Save hours')}</button>
          </form>`;
        }
        const nb = up.filter(b => b.status === 'booked').length, td = up.filter(b => new Date(b.start).toDateString() === today).length, wk = up.filter(b => Date.parse(b.start) < weekEnd).length;
        v.innerHTML = `<div class="grid g3"><div class="card kpi"><p class="k">${I('alert')}${L('Yangi (tasdiqlanmagan)', 'Новые (не подтверждены)', 'New, to confirm')}</p><b>${nb}</b></div><div class="card kpi"><p class="k">${I('clock')}${L('Bugun', 'Сегодня', 'Today')}</p><b>${td}</b></div><div class="card kpi"><p class="k">${I('calendar')}${L('7 kun ichida', 'За 7 дней', 'Next 7 days')}</p><b>${wk}</b></div></div>
          <div class="mini-tabs" role="tablist" style="margin-top:18px">${tabs.map(([k, t]) => `<button type="button" role="tab" data-btab="${k}" aria-selected="${k === tab}">${t}</button>`).join('')}</div>
          <div id="bk-body">${body}</div>`;
        v.querySelectorAll('[data-btab]').forEach(x => x.addEventListener('click', () => { tab = x.dataset.btab; RENDER.bookings(v); }));
        v.querySelectorAll('[data-bk]').forEach(li => { const go = () => detail(B.find(b => b.id === li.dataset.bk), v); li.addEventListener('click', go); li.addEventListener('keydown', e => { if (e.key === 'Enter') go(); }); });
        const hf = v.querySelector('#hours-form');
        if (hf) {
          const offs = new Set(SET.off);
          const drawOff = () => { v.querySelector('#offs').innerHTML = [...offs].filter(d => d >= new Date().toISOString().slice(0, 10)).sort().map(d => `<span class="tag grey" data-off="${d}">${d} <button type="button" aria-label="Remove">${I('x')}</button></span>`).join(''); v.querySelectorAll('[data-off] button').forEach(b => b.addEventListener('click', () => { offs.delete(b.parentElement.dataset.off); drawOff(); })); };
          drawOff();
          v.querySelector('#off-add').addEventListener('click', () => { const d = v.querySelector('#off-new').value; if (d) { offs.add(d); drawOff(); } });
          hf.addEventListener('submit', async e => {
            e.preventDefault(); const f = e.target, week = {};
            for (let n = 1; n <= 7; n++) week[n] = f['on' + n].checked ? [[f['from' + n].value, f['to' + n].value]] : [];
            try { const r = await clinicApi('settings', { body: { settings: { ...SET, week, minutes: +f.minutes.value, gap: +f.gap.value, noticeHours: +f.notice.value, horizonDays: +f.horizon.value, off: [...offs] } } }); SET = r.settings; toast(L('Ish vaqti saqlandi. Bron sahifasi yangilandi.', 'Часы сохранены. Страница записи обновлена.', 'Hours saved. The booking page now uses them.')); }
            catch (err) { const m = v.querySelector('#hours-msg'); m.innerHTML = errMsg(err); m.className = 'form-msg err'; }
          });
        }
      };
    }

    window.addEventListener('hashchange', route);
    route();
  })();
})();
