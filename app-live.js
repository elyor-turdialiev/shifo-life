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
  const homeFor = u => rolesOf(u).includes('teacher') ? 'teacher.html' : 'student.html';
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
  let USER = null;

  function route() {
    const name = (location.hash || '#overview').slice(1);
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

  (async function start() {
    USER = await auth.user();
    if (!USER) { location.replace('login.html'); return; }
    const roles = rolesOf(USER), isTeacher = roles.includes('teacher');
    if (page === 'teacher' && !isTeacher) { location.replace('student.html'); return; }
    if (page === 'student' && isTeacher) { location.replace('teacher.html'); return; }
    const name = nameOf(USER), level = ['b1', 'b2', 'c1'].find(l => roles.includes(l));
    document.getElementById('me').innerHTML = `<span class="avatar${isTeacher ? ' c3' : ''}">${esc(initials(name))}</span><div><b>${esc(name)}</b><span>${isTeacher ? L('Oʻqituvchi', 'Преподаватель', 'Teacher') : 'Medical English' + (level ? ' · ' + level.toUpperCase() : '')}</span></div><a href="login.html" data-logout aria-label="Log out">${I('logout')}</a>`;
    document.querySelectorAll('#me [data-logout]').forEach(a => a.addEventListener('click', async e => { e.preventDefault(); await auth.logout(); location.replace('login.html'); }));
    const last = (() => { try { return JSON.parse(localStorage.getItem('shifo-last-' + page) || 'null'); } catch (e) { return null; } })();

    if (page === 'student') {
      RENDER.overview = v => {
        v.innerHTML = `<div class="grid g21">
          <div class="card hello"><svg class="bg" viewBox="28 14 340 358"><use href="#mark-light"/></svg>
            <h2>${L('Salom', 'Здравствуйте', 'Hello')}, ${esc(name.split(' ')[0])}!</h2>
            <p>${level ? L(`Sizning darajangiz: ${level.toUpperCase()}`, `Ваш уровень: ${level.toUpperCase()}`, `Your level: ${level.toUpperCase()}`) : L('Darajangiz tez orada biriktiriladi.', 'Уровень скоро будет назначен.', 'Your level will be set soon.')}</p>
            <div class="actions"><a class="btn btn-w" href="#course">${I('book')}${last ? L('Davom ettirish', 'Продолжить', 'Continue where you left off') : L('Kursni ochish', 'Открыть курс', 'Open my course')}</a></div></div>
          <div class="card kpi"><p class="k">${I('book')}${L('Daraja', 'Уровень', 'Level')}</p><b>${level ? level.toUpperCase() : '—'}</b><small>${{ b1: L('Asos', 'Основа', 'Foundation'), b2: L('Klinik', 'Клинический', 'Clinical'), c1: L('Professional', 'Профессиональный', 'Professional') }[level] || ''}</small></div>
        </div>
        <div class="grid g3" style="margin-top:18px">
          <div class="card kpi"><p class="k">${I('calendar')}${L('Tuzilma', 'Структура', 'Structure')}</p><b>12</b><small>${L('hafta, haftasiga 3 dars', 'недель, 3 урока в неделю', 'weeks, 3 lessons a week')}</small></div>
          <div class="card kpi"><p class="k">${I('mic')}${L('Har hafta', 'Каждую неделю', 'Every week')}</p><b>1</b><small>${L('ovozli xabar oʻqituvchingizga', 'голосовое сообщение преподавателю', 'voice note to your teacher')}</small></div>
          <div class="card"><h3 style="margin-bottom:8px">${L('Savollar bormi?', 'Есть вопросы?', 'Questions?')}</h3><p class="muted" style="font-size:.95rem">${L('Dars, jadval yoki toʻlov boʻyicha bizga yozing.', 'Пишите нам по урокам, расписанию или оплате.', 'Write to us about lessons, your schedule or payments.')}</p><a class="link" style="margin-top:12px" href="contact.html#academy">${L('Bogʻlanish', 'Связаться', 'Contact us')}${I('arrow')}</a></div>
        </div>`;
      };
      RENDER.course = v => renderCourse(v, { level, edition: 'student' });
    }

    if (page === 'teacher') {
      let roster = null;
      const getRoster = async () => roster || (roster = (await fn('students')).students);
      RENDER.overview = async v => {
        v.innerHTML = `<div class="grid g21">
          <div class="card hello"><svg class="bg" viewBox="28 14 340 358"><use href="#mark-light"/></svg>
            <h2>${L('Xayrli kun', 'Добрый день', 'Good day')}, ${esc(name.split(' ')[0])}!</h2>
            <p>${L('Kurs materiallari va talabalaringiz shu yerda.', 'Здесь материалы курса и ваши студенты.', 'Your course materials and your students are here.')}</p>
            <div class="actions"><a class="btn btn-w" href="#course">${I('book')}${L('Oʻqituvchi kitobi', 'Книга преподавателя', 'Teacher Edition')}</a><a class="btn btn-ghost" href="#students">${I('users')}${L('Talabalar', 'Студенты', 'Students')}</a></div></div>
          <div class="card kpi"><p class="k">${I('users')}${L('Talabalar', 'Студенты', 'Students')}</p><b data-n="all">…</b><small>${L('akkauntlar', 'аккаунтов', 'accounts')}</small></div>
        </div>
        <div class="grid g3" style="margin-top:18px">${['b1', 'b2', 'c1'].map(l => `<div class="card kpi"><p class="k">${I('cap')}${l.toUpperCase()}</p><b data-n="${l}">…</b><small>${L('talaba', 'студентов', 'students')}</small></div>`).join('')}</div>`;
        try {
          const r = await getRoster();
          v.querySelector('[data-n="all"]').textContent = r.length;
          ['b1', 'b2', 'c1'].forEach(l => v.querySelector(`[data-n="${l}"]`).textContent = r.filter(s => s.level === l).length);
        } catch (e) { v.querySelectorAll('[data-n]').forEach(b => b.textContent = '—'); }
      };
      RENDER.students = async v => {
        v.innerHTML = loading;
        let r; try { r = await getRoster(); } catch (e) { v.innerHTML = failed(e); return; }
        if (!r.length) { v.innerHTML = `<div class="card"><h3>${L('Hozircha talabalar yoʻq', 'Пока нет студентов', 'No students yet')}</h3><p class="muted" style="margin-top:8px">${L('Talabalarni Netlify’da taklif qiling va ularga “student” va daraja (b1, b2 yoki c1) rollarini bering.', 'Пригласите студентов в Netlify и дайте им роли «student» и уровень (b1, b2 или c1).', 'Invite students in Netlify and give them the roles “student” and their level (b1, b2 or c1).')}</p></div>`; return; }
        let q = '', lv = 'all';
        const rows = () => r.filter(s => (lv === 'all' || s.level === lv) && ((s.name + ' ' + s.email).toLowerCase().includes(q))).map(s => `<tr>
          <td><div class="person"><span class="avatar sm">${esc(initials(s.name || s.email))}</span><div><b>${esc(s.name || '—')}</b><span>${esc(s.email)}</span></div></div></td>
          <td>${s.level ? `<span class="tag rose">${s.level.toUpperCase()}</span>` : '<span class="tag grey">—</span>'}</td>
          <td>${s.confirmed ? `<span class="tag">${L('Faol', 'Активен', 'Active')}</span>` : `<span class="tag warn">${L('Taklif yuborilgan', 'Приглашён', 'Invited')}</span>`}</td>
          <td class="muted">${s.lastLogin ? new Date(s.lastLogin).toLocaleDateString() : '—'}</td></tr>`).join('') || `<tr><td colspan="4" class="muted">${L('Hech kim topilmadi.', 'Никого не найдено.', 'No students match.')}</td></tr>`;
        v.innerHTML = `<div class="toolbar"><div class="chipset">${['all', 'b1', 'b2', 'c1'].map(x => `<button type="button" data-f="${x}" aria-pressed="${x === 'all'}">${x === 'all' ? L('Hammasi', 'Все', 'All') : x.toUpperCase()}</button>`).join('')}</div>
          <label class="search">${I('search')}<input type="search" aria-label="Search"></label></div>
          <div class="card" style="padding:8px 12px"><div class="tbl-wrap"><table class="tbl"><thead><tr><th>${L('Talaba', 'Студент', 'Student')}</th><th>${L('Daraja', 'Уровень', 'Level')}</th><th>${L('Holat', 'Статус', 'Status')}</th><th>${L('Oxirgi kirish', 'Последний вход', 'Last log in')}</th></tr></thead><tbody id="st-body">${rows()}</tbody></table></div></div>`;
        const inp = v.querySelector('.search input');
        inp.placeholder = { uz: 'Ism yoki email', ru: 'Имя или email', en: 'Name or email' }[doc.lang];
        inp.addEventListener('input', () => { q = inp.value.trim().toLowerCase(); v.querySelector('#st-body').innerHTML = rows(); });
        v.querySelectorAll('[data-f]').forEach(b => b.addEventListener('click', () => { lv = b.dataset.f; v.querySelectorAll('[data-f]').forEach(x => x.setAttribute('aria-pressed', x === b)); v.querySelector('#st-body').innerHTML = rows(); }));
      };
      RENDER.course = v => renderCourse(v, { level: (last && last.level) || level || 'b1', edition: (last && last.edition) || 'teacher' });
    }

    window.addEventListener('hashchange', route);
    route();
  })();
})();
