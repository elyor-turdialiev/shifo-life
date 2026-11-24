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
  const T = (uz, ru, en) => ({ uz, ru, en })[document.documentElement.lang] || en;   // plain text, for <option>
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
  const homeFor = u => rolesOf(u).some(r => ['teacher', 'admin', 'ceo', 'manager', 'clinic'].includes(r)) ? 'teacher.html' : 'student.html';
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

  /* the book's lessons (homework, grammar, check questions) and the signed-in student's check results */
  const BOOKL = {};
  const bookLessons = (level, student) => {
    const k = level + '|' + (student || '');
    if (!BOOKL[k]) BOOKL[k] = api('lessons', { params: { level, ...(student ? { student } : {}) } }).catch(e => { delete BOOKL[k]; throw e; });
    return BOOKL[k];
  };
  /* one lesson check in the side panel: answer, mark on the server, see what was right */
  function runCheck(level, l, done) {
    const kind = q => q.k === 'gap' ? L('Gapni toʻldiring', 'Заполните пропуск', 'Complete the sentence') : q.k === 'def' ? L('Qaysi soʻz shu maʼnoni bildiradi?', 'Какое слово это означает?', 'Which word or phrase means this?') : `${L('Grammatika', 'Грамматика', 'Grammar')} · ${L(`${q.unit}-boʻlim`, `Раздел ${q.unit}`, `Unit ${q.unit}`)}`;
    const gapHtml = t => esc(t).replace('_____', '<span class="gap">_____</span>');
    const qHtml = (q, i) => `<fieldset class="ck-q" data-i="${i}"><legend><span class="ck-k">${i + 1} · ${kind(q)}</span><span class="ck-p">${q.k === 'def' ? `“${esc(q.p)}”` : gapHtml(q.p)}</span></legend>
      ${q.k === 'gram' ? `<input name="q${i}" autocomplete="off" autocapitalize="off" spellcheck="false" maxlength="80" aria-label="Answer ${i + 1}">`
        : `<div class="ck-o">${q.o.map((o, j) => `<label><input type="radio" name="q${i}" value="${j}"><span>${esc(o)}</span></label>`).join('')}</div>`}</fieldset>`;
    const p = openDrawer(`${dHead(esc(l.title), `${L(`${l.n}-dars`, `Урок ${l.n}`, `Lesson ${l.n}`)} · ${level.toUpperCase()} · ${l.review ? L('takrorlash', 'повторение', 'review') : L('tekshiruv', 'проверка', 'check')}`)}
      <form class="ck" novalidate>${l.q.map(qHtml).join('')}<p class="form-msg"></p><div class="ck-end"><button class="btn btn-p" type="submit">${I('check')}${L('Javoblarni tekshirish', 'Проверить ответы', 'Check my answers')}</button></div></form>`);
    p.classList.add('wide');
    const f = p.querySelector('form');
    f.addEventListener('submit', async e => {
      e.preventDefault();
      const answers = l.q.map((q, i) => q.k === 'gram' ? (f[`q${i}`].value || '').trim() : (f.querySelector(`[name=q${i}]:checked`) || {}).value);
      const miss = l.q.findIndex((q, i) => q.k !== 'gram' && answers[i] == null);
      const msg = f.querySelector('.form-msg');
      if (miss >= 0) { msg.innerHTML = L('Har bir savolga javob bering.', 'Ответьте на каждый вопрос.', 'Please answer every question.'); msg.className = 'form-msg err'; f.querySelectorAll('.ck-q')[miss].scrollIntoView({ behavior: 'smooth', block: 'center' }); return; }
      const btn = f.querySelector('[type=submit]'); btn.disabled = true; msg.innerHTML = ''; msg.className = 'form-msg';
      let r; try { r = await api('check', { body: { level, n: l.n, answers: answers.map((a, i) => l.q[i].k === 'gram' ? a : +a) } }); } catch (err) { msg.innerHTML = errMsg(err); msg.className = 'form-msg err'; btn.disabled = false; return; }
      f.querySelectorAll('input').forEach(x => { x.disabled = true; });
      l.q.forEach((q, i) => {
        const fs = f.querySelector(`.ck-q[data-i="${i}"]`); fs.classList.add(r.right[i] ? 'ok' : 'bad');
        if (q.k === 'gram') { if (!r.right[i]) fs.insertAdjacentHTML('beforeend', `<p class="ck-ans">${L('Toʻgʻri javob', 'Правильный ответ', 'Answer')}: <b>${esc(r.key[i].join(' / '))}</b></p>`); }
        else fs.querySelectorAll('.ck-o label').forEach((lb, j) => { if (j === r.key[i]) lb.classList.add('right'); else if (lb.querySelector('input').checked) lb.classList.add('wrong'); });
      });
      const pct = r.score / r.total, word = pct === 1 ? L('Aʼlo! Hammasi toʻgʻri.', 'Отлично! Всё верно.', 'Excellent, all correct!') : pct >= .7 ? L('Yaxshi natija.', 'Хороший результат.', 'Good work.') : L('Xatolarni koʻrib chiqing va qayta urinib koʻring.', 'Посмотрите ошибки и попробуйте ещё раз.', 'Look at the corrections, then try again.');
      f.insertAdjacentHTML('afterbegin', `<div class="ck-score top"><b>${r.score}/${r.total}</b><span>${word}</span></div>`);
      f.querySelector('.ck-end').innerHTML = `<div class="ck-score"><b>${r.score}/${r.total}</b><span>${word}${r.result && r.result.tries > 1 ? ` ${L('Eng yaxshi natija', 'Лучший результат', 'Best so far')}: ${r.result.best}/${r.total}.` : ''}${isTeacherPage ? ` <span class="muted">${L('(Oʻqituvchi sinovi saqlanmaydi.)', '(Попытка преподавателя не сохраняется.)', '(Teacher tries are not saved.)')}</span>` : ''}</span></div>
        <button type="button" class="btn btn-s" data-again>${L('Qayta urinish', 'Ещё раз', 'Try again')}</button>`;
      f.querySelector('[data-again]').addEventListener('click', () => runCheck(level, l, done));
      p.scrollTop = 0;
      done(r.result);
    });
  }
  const isTeacherPage = page === 'teacher';
  /* reviews: stars, the student's form, and the admin's list */
  const starsHtml = n => `<span class="stars" aria-label="${n}/5">${[1, 2, 3, 4, 5].map(i => `<i class="${i <= n ? 'on' : ''}">★</i>`).join('')}</span>`;
  function reviewForm(cur, name, done) {
    const p = openDrawer(`${dHead(cur ? L('Fikringizni tahrirlash', 'Изменить отзыв', 'Edit your review') : L('Fikr qoldirish', 'Оставить отзыв', 'Write a review'), 'Shifo Academy')}
      <form id="rv-form" novalidate>
        <fieldset class="rv-stars"><legend>${L('Bahoingiz', 'Ваша оценка', 'Your rating')}</legend><div>${[5, 4, 3, 2, 1].map(i => `<input type="radio" name="stars" id="st${i}" value="${i}"${(cur ? cur.stars : 0) === i ? ' checked' : ''}><label for="st${i}" title="${i}">★</label>`).join('')}</div></fieldset>
        <label>${L('Kurs haqida fikringiz', 'Ваш отзыв о курсе', 'What would you tell a friend about the course?')}<textarea name="text" rows="5" maxlength="800" required minlength="20">${esc(cur ? cur.text : '')}</textarea></label>
        <label>${L('Ismingiz qanday koʻrsatilsin?', 'Как показать ваше имя?', 'How should your name appear?')}<select name="show"><option value="full"${cur && cur.show === 'first' ? '' : ' selected'}>${esc(name || '')}</option><option value="first"${cur && cur.show === 'first' ? ' selected' : ''}>${esc((name || '').split(/\s+/)[0] + ((name || '').split(/\s+/)[1] ? ' ' + name.split(/\s+/)[1][0] + '.' : ''))}</option></select></label>
        <p class="muted" style="font-size:.88rem">${L('Fikringiz tekshirilgandan soʻng Academy sahifasida chiqadi.', 'Отзыв появится на странице Academy после проверки.', 'Your review appears on the Academy page after we approve it.')}</p>
        <p class="form-msg"></p>
        <button class="btn btn-p" type="submit">${I('check')}${L('Yuborish', 'Отправить', 'Send review')}</button>
      </form>`);
    p.querySelector('form').addEventListener('submit', async e => {
      e.preventDefault(); const f = e.target, m = f.querySelector('.form-msg');
      const stars = (f.querySelector('[name=stars]:checked') || {}).value, text = f.text.value.trim();
      if (!stars || text.length < 20) { m.innerHTML = L('Baho tanlang va kamida 20 belgi yozing.', 'Выберите оценку и напишите хотя бы 20 символов.', 'Choose a rating and write at least 20 characters.'); m.className = 'form-msg err'; return; }
      f.querySelector('[type=submit]').disabled = true;
      try { const r = await api('review-save', { body: { stars: +stars, text, show: f.show.value } }); closeDrawer(); toast(L('Rahmat! Fikringiz yuborildi.', 'Спасибо! Отзыв отправлен.', 'Thank you! Your review was sent.')); done(r.review); }
      catch (err) { m.innerHTML = errMsg(err); m.className = 'form-msg err'; f.querySelector('[type=submit]').disabled = false; }
    });
  }

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
      const lab = s => s.id === 'intro' ? L('Kirish', 'Введение', 'Introduction') : s.id === 'progress' ? L('Natijalarim', 'Мой прогресс', 'My progress') : s.id === 'grammar' ? L('Grammatika qoʻllanmasi', 'Грамматика', 'Grammar Handbook') : s.id === 'vocab' ? L('Lugʻat kitobi', 'Словарь', 'Vocabulary Book') : esc(s.title);
      const ico = { intro: 'book', progress: 'chart', grammar: 'cap', vocab: 'chat' };
      const items = list.sections.map(s => `<li${s.id === 'grammar' ? ' class="wl-sep"' : ''}><button type="button" data-sec="${esc(s.id)}" aria-current="${s.id === sel}"><span class="n">${s.week || I(ico[s.id] || 'book')}</span><span class="t">${lab(s)}</span></button></li>`).join('');
      v.innerHTML = `${tools}<div class="grid g12" style="align-items:start">
        <div class="card"><div class="card-h"><h3>Medical English · ${level.toUpperCase()}</h3><span class="tag rose">${edition === 'teacher' ? L('Oʻqituvchi', 'Преподаватель', 'Teacher') : L('Talaba', 'Студент', 'Student')}</span></div><ul class="weeklist">${items}</ul></div>
        <div id="sec-body">${loading}</div></div>`;
      const open = async (id, anchor) => {
        sel = id; try { localStorage.setItem(lastKey, id); localStorage.setItem('shifo-last-' + page, JSON.stringify({ level, edition, id })); } catch (e) {}
        v.querySelectorAll('[data-sec]').forEach(b => b.setAttribute('aria-current', b.dataset.sec === id));
        const box = v.querySelector('#sec-body'); box.innerHTML = loading;
        try {
          const r = await fn('course', { level, edition, section: id });
          const s = r.section;
          box.innerHTML = `<article class="card book"><p class="muted" style="font-size:.88rem;font-weight:600">${s.week ? L(s.week + '-hafta', 'Неделя ' + s.week, 'Week ' + s.week) + ' · ' + L(`${s.week * 3 - 2}–${s.week * 3}-darslar`, `Уроки ${s.week * 3 - 2}–${s.week * 3}`, `Lessons ${s.week * 3 - 2}–${s.week * 3}`) : 'Medical English · ' + level.toUpperCase()}</p><h2>${esc(s.title)}</h2>${s.html}</article>`;
          box.querySelectorAll('li.todo').forEach((li, i) => {   // "This week I can" lists: real tick boxes, remembered on this device
            const key = `shifo-todo-${level}-${edition}-${id}-${i}`; let on = false; try { on = localStorage.getItem(key) === '1'; } catch (e) {}
            li.innerHTML = `<label class="todo-l"><input type="checkbox"${on ? ' checked' : ''}><span>${li.innerHTML.replace(/^\s*☐\s*/, '')}</span></label>`;
            li.querySelector('input').addEventListener('change', e => { try { localStorage.setItem(key, e.target.checked ? '1' : '0'); } catch (err) {} });
          });
          if (s.week) lessonTasks(box, s.week);
          const target = anchor && box.querySelector('#' + anchor);
          if (target) { target.scrollIntoView({ behavior: 'smooth', block: 'start' }); target.classList.add('flash'); setTimeout(() => target.classList.remove('flash'), 1600); }
          else if (window.innerWidth < 900) box.scrollIntoView({ behavior: 'smooth' });
        } catch (e) { box.innerHTML = failed(e); }
      };
      /* tasks for the week's 3 lessons: homework from the book, grammar links and the auto-marked check */
      const lessonTasks = async (box, week) => {
        const wrap = document.createElement('section'); wrap.className = 'ltasks'; wrap.id = 'tasks';
        wrap.innerHTML = `<h3>${L('Dars vazifalari', 'Задания к урокам', 'Lesson tasks')}</h3>${loading}`;
        box.appendChild(wrap);
        const head = box.querySelector('article.book > p.muted');
        if (head) head.insertAdjacentHTML('beforeend', ` · <a class="link" href="#tasks" data-jump>${L('Vazifalarga oʻtish', 'К заданиям', 'Go to the tasks')} ↓</a>`);
        box.querySelectorAll('[data-jump]').forEach(a => a.addEventListener('click', e => { e.preventDefault(); wrap.scrollIntoView({ behavior: 'smooth', block: 'start' }); }));
        let B; try { B = await bookLessons(level); } catch (e) { wrap.innerHTML = failed(e); return; }
        const ls = B.lessons.filter(l => l.week === week);
        const badge = l => { const c = B.checks[`${B.level}-${l.n}`]; return c ? `<span class="tag ${c.best === c.total ? '' : 'grey'}" title="${c.tries}">${I('star')}${c.best}/${c.total}</span>` : ''; };
        const card = l => `<article class="lt">
            <p class="lt-n">${L(`${l.n}-dars`, `Урок ${l.n}`, `Lesson ${l.n}`)} · ${esc(l.type)}</p>
            <h4>${esc(l.title)}</h4>
            ${l.cando ? `<p class="lt-can">${L('Bu darsdan keyin:', 'После урока я могу:', 'After this lesson I can:')} ${esc(l.cando)}</p>` : ''}
            <div class="lt-hw"><b>${I('edit')}${L('Uy vazifasi', 'Домашнее задание', 'Homework')}</b><p>${esc(l.hw)}</p></div>
            ${l.units.length ? `<div class="lt-gram"><span class="lt-gl">${I('cap')}${L('Grammatika', 'Грамматика', 'Grammar')}</span>${l.units.map(u => `<button type="button" class="lt-chip" data-unit="${u.n}" title="${esc(u.title)}"><span>${u.n} · ${esc(u.title.replace(/\s*\(.*\)$/, ''))}</span></button>`).join('')}</div>` : ''}
            <div class="lt-row"><button type="button" class="btn btn-p btn-sm" data-check="${l.n}">${I('check')}${l.review ? L('Takrorlash testi', 'Повторение', 'Review check') : L('Oʻzimni tekshirish', 'Проверить себя', 'Check yourself')} · ${l.q.length}</button><span data-badge="${l.n}">${badge(l)}</span></div>
          </article>`;
        wrap.innerHTML = `<h3>${L('Dars vazifalari', 'Задания к урокам', 'Lesson tasks')}</h3><p class="muted">${isT ? L('Talabalar har darsdan keyin qisqa testni bajaradi; natija sizga koʻrinadi.', 'После каждого урока студенты проходят короткую проверку; результат виден вам.', 'After each lesson students take a short check; you see their results.') : L('Har darsdan keyin: uy vazifasini bajaring va qisqa testni toping. Eng yaxshi natijangiz saqlanadi.', 'После каждого урока: сделайте домашнее задание и пройдите короткую проверку. Лучший результат сохраняется.', 'After each lesson: do the homework and take the short check. Your best score is saved.')}</p><div class="lt-grid">${ls.map(card).join('')}</div>`;
        wrap.querySelectorAll('[data-unit]').forEach(b => b.addEventListener('click', () => open('grammar', 'unit-' + b.dataset.unit)));
        wrap.querySelectorAll('[data-check]').forEach(b => b.addEventListener('click', () => {
          const l = ls.find(x => x.n === +b.dataset.check);
          runCheck(B.level, l, res => { if (res) { B.checks[`${B.level}-${l.n}`] = res; const el = wrap.querySelector(`[data-badge="${l.n}"]`); if (el) el.innerHTML = badge(l); } });
        }));
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
  const fmt = (d, o) => L(...['uz', 'ru', 'en'].map(l => { if (l === 'uz') return esc(uzDate(d, o)); try { return esc(d.toLocaleString(LOC[l], o)); } catch (e) { return esc(d.toLocaleString('en-GB', o)); } }));
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
    review: L('Baho tanlang va kamida 20 belgi yozing.', 'Выберите оценку и напишите хотя бы 20 символов.', 'Choose a rating and write at least 20 characters.'),
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
    const kind = l.kind && l.kind !== 'teach' ? ' · ' + KIND[l.kind] : '';
    const t = l.teacher && l.teacher.name && page === 'teacher' ? ' · ' + esc(l.teacher.name) : '';
    return `<li>${dateBlock(d)}<div class="what"><b>${esc(l.title || L('Dars', 'Урок', 'Lesson'))}</b><span>${dayFmt(d)} · ${timeFmt(d)} · ${l.minutes || 60} ${L('daq', 'мин', 'min')}${kind}${l.who ? ' · ' + esc(l.who) : ''}${t}</span>${l.note ? `<span class="lnote">${esc(l.note)}</span>` : ''}${l.status && l.status !== 'planned' ? `<span class="lstat">${STAT[l.status]}</span>` : ''}</div>${extra || joinBtn(l)}</li>`;
  };
  /* CRM: lesson types, lesson outcomes, package usage */
  const KIND = { teach: L('Dars', 'Урок', 'Teaching'), speak: L('Nutq', 'Разговор', 'Speaking'), mentor: L('Mentorlik', 'Менторство', 'Mentoring') };
  const KT = { get teach() { return T('Dars', 'Урок', 'Teaching'); }, get speak() { return T('Nutq', 'Разговор', 'Speaking'); }, get mentor() { return T('Mentorlik', 'Менторство', 'Mentoring'); } };
  const UT = k => k === 'mentor' ? T('uchrashuv', 'встр.', 'sessions') : T('soat', 'ч', 'h');
  const UNIT = (k, n) => k === 'mentor' ? (n === 1 ? L('uchrashuv', 'встреча', 'session') : L('uchrashuv', 'встр.', 'sessions')) : L('soat', 'ч', 'h');
  const num = n => String(Math.round(n * 100) / 100);
  const STAT = {
    taught: `<span class="tag">${I('check')}${L('Oʻtildi', 'Проведено', 'Taught')}</span>`,
    late: `<span class="tag warn">${L('Kech bekor / kelmadi', 'Поздняя отмена / неявка', 'Late cancel / no-show')}</span>`,
    cancelled: `<span class="tag grey">${L('Oldindan bekor qilindi', 'Отменено заранее', 'Cancelled in time')}</span>`
  };
  const payTags = () => ({ paid: `<span class="tag">${I('check')}${L('Toʻlangan', 'Оплачено', 'Paid')}</span>`, partial: `<span class="tag warn">${L('Qisman', 'Частично', 'Partly paid')}</span>`, due: `<span class="tag warn">${L('Kutilmoqda', 'Ожидается', 'Due')}</span>`, overdue: `<span class="tag bad">${L('Muddati oʻtgan', 'Просрочено', 'Overdue')}</span>` });
  const markBtns = l => `<span class="mark" role="group" aria-label="Mark"><button type="button" class="btn btn-p btn-xs" data-mark="${esc(l.id)}|taught" title="${T('Dars oʻtildi', 'Занятие проведено', 'Lesson taught')}">${I('check')}${L('Oʻtildi', 'Проведено', 'Taught')}</button><button type="button" class="btn btn-s btn-xs" data-mark="${esc(l.id)}|late" title="${T('24 soatdan kam vaqt qolganda bekor qilindi yoki kelmadi: hisoblanadi', 'Отмена менее чем за 24 ч или неявка: засчитывается', 'Cancelled under 24h or no-show: counts as used')}">${L('Kech / kelmadi', 'Поздно / неявка', 'Late / no-show')}</button><button type="button" class="btn btn-s btn-xs" data-mark="${esc(l.id)}|cancelled" title="${T('24+ soat oldin bekor qilindi: hisoblanmaydi', 'Отменено за 24+ ч: не засчитывается', 'Cancelled 24h+ before: not counted')}">${L('Bekor', 'Отмена', 'Cancelled')}</button></span>`;
  const isPast = l => Date.parse(l.start) + (l.minutes || 60) * 60000 <= Date.now();
  const unmarked = l => isPast(l) && (!l.status || l.status === 'planned');
  const partBar = (k, p) => {
    const total = p.own + p.carry, used = p.used, pct = total ? Math.min(100, used / total * 100) : (used ? 100 : 0);
    return `<div class="pbar${p.over ? ' over' : ''}"><div class="pbar-h"><b>${KIND[k]}</b><span>${num(Math.min(used, total || used))} / ${num(total)} ${UNIT(k, total)}</span></div>
      <div class="pbar-t"><i style="width:${pct}%"></i></div>
      <small>${p.over ? L(`${num(p.over)} ${UNIT(k, p.over)} paketdan tashqari`, `${num(p.over)} ${UNIT(k, p.over)} сверх пакета`, `${num(p.over)} ${UNIT(k, p.over)} over the package`) : L(`${num(p.left)} ${UNIT(k, p.left)} qoldi`, `Осталось ${num(p.left)} ${UNIT(k, p.left)}`, `${num(p.left)} ${UNIT(k, p.left)} left`)}${p.carry ? ` · ${L(`${num(p.carry)} oʻtgan oydan`, `${num(p.carry)} с прошлого месяца`, `${num(p.carry)} carried over`)}` : ''}</small></div>`;
  };
  const curMonth = () => new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Tashkent' }).slice(0, 7);
  const packageCard = (bal, title) => {
    const m = (bal || []).find(x => x.month === curMonth());
    if (!m) return `<div class="card pkg"><div class="card-h"><h3>${title}</h3></div><p class="muted">${L('Bu oy uchun paket yoʻq.', 'На этот месяц пакета нет.', 'No package for this month.')}</p></div>`;
    return `<div class="card pkg"><div class="card-h"><h3>${title}</h3><span class="tag rose">${m.name ? esc(m.name) : L('Paketsiz', 'Без пакета', 'No package')} · ${monthFmt(m.month)}</span></div>
      <div class="pbars">${['teach', 'speak', 'mentor'].map(k => partBar(k, m.parts[k])).join('')}</div></div>`;
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
    const roles = rolesOf(USER), isCeo = roles.includes('ceo'), isManager = roles.includes('manager');
    const isAdmin = roles.includes('admin') || isCeo, isMoney = isAdmin || isManager;        // isAdmin: admin or CEO (everything)
    const isTeacher = isMoney || roles.includes('teacher'), isLimited = isTeacher && !isMoney;  // isTeacher: any staff; isLimited: a teacher only
    const isClinic = isAdmin || roles.includes('clinic');
    if (page === 'teacher' && !isTeacher && !isClinic) { location.replace('student.html'); return; }
    if (page === 'student' && (isTeacher || isClinic)) { location.replace('teacher.html'); return; }
    if (page === 'teacher') {   /* show only the screens this account may use */
      const can = k => k === 'bookings' ? isClinic : isTeacher;
      ALLOWED = views.map(x => x.id.slice(5)).filter(can);
      navLinks.forEach(a => { if (!can(a.dataset.view)) a.hidden = true; });
    }
    const name = nameOf(USER), level = ['b1', 'b2', 'c1'].find(l => roles.includes(l));
    document.getElementById('me').innerHTML = `<span class="avatar${isTeacher ? ' c3' : ''}">${esc(initials(name))}</span><div><b>${esc(name)}</b><span>${isTeacher || isClinic ? (isCeo ? 'CEO' : isAdmin ? L('Administrator', 'Администратор', 'Admin') : isManager ? L('Hisob menejeri', 'Аккаунт-менеджер', 'Account manager') : isTeacher ? L('Oʻqituvchi', 'Преподаватель', 'Teacher') : L('Klinika', 'Клиника', 'Clinic')) : 'Medical English' + (level ? ' · ' + level.toUpperCase() : '')}</span></div><a href="login.html" data-logout aria-label="Log out">${I('logout')}</a>`;
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
        <div style="margin-top:18px">${packageCard(D.balance, L('Mening paketim', 'Мой пакет', 'My package'))}</div>
        <div class="grid g2" style="margin-top:18px">
          <div class="card"><div class="card-h"><h3>${L('Keyingi darslar', 'Ближайшие занятия', 'Next lessons')}</h3><a class="link" href="#schedule">${L('Hammasi', 'Все', 'See all')}${I('arrow')}</a></div>
            ${next.length ? `<ul class="list">${next.slice(0, 3).map(l => lessonItem(l)).join('')}</ul>` : `<p class="muted">${L('Hozircha rejalashtirilgan dars yoʻq.', 'Пока нет запланированных занятий.', 'No lessons planned yet.')}</p>`}</div>
          <div class="card"><div class="card-h"><h3>${L('Uy vazifasi', 'Домашнее задание', 'Homework')}</h3><a class="link" href="#homework">${L('Hammasi', 'Все', 'See all')}${I('arrow')}</a></div>
            ${todo.length ? todo.slice(0, 3).map(h => `<div class="hwi slim"><span class="ico">${I('edit')}</span><div><b>${esc(h.title)}</b><span class="meta">${dueText(h)}</span></div>${HWTAG.todo}</div>`).join('') : `<p class="muted">${L('Topshirilmagan vazifa yoʻq.', 'Несданных заданий нет.', 'Nothing to hand in.')}</p>`}
            ${fb ? `<p style="margin:18px 0 8px;font-weight:600;color:var(--ink);font-size:.95rem">${L('Oxirgi izoh', 'Последний отзыв', 'Latest feedback')}</p><div class="hwi slim"><span class="ico">${I('check')}</span><div><b>${esc(fb.title)}</b><span class="meta">${esc((fb.review.feedback || '').slice(0, 140))}</span></div>${fb.review.score ? `<span class="score">${fb.review.score}/10</span>` : ''}</div>` : ''}</div>
        </div>
        <div class="card rv-card" style="margin-top:18px" id="my-rv">${loading}</div>`;
        const box = v.querySelector('#my-rv');
        const paint = (r, nm) => {
          box.innerHTML = r ? `<div class="card-h"><h3>${L('Sizning fikringiz', 'Ваш отзыв', 'Your review')}</h3><span class="tag ${r.ok ? '' : 'warn'}">${r.ok ? L('Chop etilgan', 'Опубликован', 'Published') : L('Tekshirilmoqda', 'На проверке', 'Waiting for approval')}</span></div>
              ${starsHtml(r.stars)}<p class="rv-text">${pre(r.text)}</p><button type="button" class="btn btn-s btn-sm" data-rv-edit>${I('edit')}${L('Tahrirlash', 'Изменить', 'Edit')}</button>`
            : `<div class="rv-empty"><span class="fi">${I('star')}</span><div><h3>${L('Kurs sizga yoqyaptimi?', 'Как вам курс?', 'How is your course going?')}</h3><p class="muted">${L('Fikringiz boshqa talabalarga tanlashda yordam beradi.', 'Ваш отзыв поможет другим студентам сделать выбор.', 'A short review helps other students decide.')}</p></div><button type="button" class="btn btn-p btn-sm" data-rv-edit>${I('star')}${L('Fikr qoldirish', 'Оставить отзыв', 'Write a review')}</button></div>`;
          box.querySelector('[data-rv-edit]').addEventListener('click', () => reviewForm(r, nm || name, nr => paint(nr, nm)));
        };
        api('my-review').then(r => paint(r.review, r.name || name), () => { box.remove(); });
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
        const P = D.payments || [], B = D.balance || [];
        const PT = payTags();
        const hist = B.map(m => `<tr><td><b>${monthFmt(m.month)}</b><br><span class="muted" style="font-size:.85rem">${m.name ? esc(m.name) : L('Paketsiz', 'Без пакета', 'No package')}</span></td>${['teach', 'speak', 'mentor'].map(k => { const p = m.parts[k]; return `<td>${num(p.used)} / ${num(p.own + p.carry)}${p.over ? ` <span class="tag bad">+${num(p.over)}</span>` : ''}</td>`; }).join('')}<td>${(P.find(x => x.month === m.month) || {}).status ? PT[P.find(x => x.month === m.month).status] : ''}</td></tr>`).join('');
        v.innerHTML = `${packageCard(B, L('Shu oy', 'Этот месяц', 'This month'))}
          <div class="card" style="margin-top:18px"><div class="card-h"><h3>${L('Oylar boʻyicha', 'По месяцам', 'Month by month')}</h3><span class="muted" style="font-size:.9rem">${L('ishlatildi / jami', 'использовано / всего', 'used / total')}</span></div>
            ${B.length ? `<div class="tbl-wrap"><table class="tbl"><thead><tr><th>${L('Oy', 'Месяц', 'Month')}</th><th>${KIND.teach}, ${UNIT('teach')}</th><th>${KIND.speak}, ${UNIT('speak')}</th><th>${KIND.mentor}</th><th>${L('Toʻlov', 'Оплата', 'Payment')}</th></tr></thead><tbody>${hist}</tbody></table></div>`
              : `<p class="muted">${L('Hozircha maʼlumot yoʻq.', 'Пока нет данных.', 'Nothing here yet.')}</p>`}
            <p class="note">${L('Oyning oxirida ishlatilmagan soatlar keyingi oyga bir marta oʻtadi. 24 soatdan kam vaqt qolganda bekor qilingan yoki qoldirilgan dars hisoblanadi.', 'Неиспользованные часы переходят на следующий месяц один раз. Занятие, отменённое менее чем за 24 часа, или пропущенное, засчитывается.', 'Unused hours move to the next month once. A lesson cancelled less than 24 hours before, or missed, counts as used.')}</p></div>
          ${P.length ? `<div class="card" style="margin-top:18px"><div class="card-h"><h3>${L('Toʻlovlar', 'Оплаты', 'Payments')}</h3><span class="muted" style="font-size:.9rem">USD</span></div><div class="months">${P.map(p => `<div class="month ${p.status}"><b>${monthFmt(p.month)}</b><span>${p.amount ? money(p.amount) : ''}</span><div>${PT[p.status]}</div>${p.note ? `<span class="pnote">${esc(p.note)}</span>` : ''}</div>`).join('')}</div>
            <p class="note">${L('Toʻlov boʻyicha savollar boʻlsa, bizga yozing.', 'Вопросы по оплате? Напишите нам.', 'Questions about a payment? Write to us.')} <a class="link" href="contact.html#academy">${L('Bogʻlanish', 'Связаться', 'Contact us')}</a></p></div>` : ''}`;
      };
    }

    /* ---------------- TEACHER / ADMIN ---------------- */
    if (page === 'teacher' && isTeacher) {
      let roster = null, board = null, staffList = [], crmHidden = null;
      const getRoster = async () => {
        if (roster) return roster;
        const [r, c] = await Promise.all([fn('students'), isLimited ? api('crm') : null]);
        staffList = r.staff || [];
        crmHidden = c ? c.hidden || [] : [];
        return (roster = r.students.filter(x => !crmHidden.includes(x.id)));   // a teacher sees their own and unassigned students
      };
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
        /* lessons that ended and still need marking: taught, late cancel / no-show, cancelled in time */
        const tm = board.toMark || [];
        if (tm.length) {
          v.insertAdjacentHTML('afterbegin', `<div class="card tomark" style="margin-bottom:18px"><div class="card-h"><h3>${L('Darslarni belgilang', 'Отметьте занятия', 'Mark your lessons')}</h3><span class="tag warn">${tm.length}</span></div>
            <p class="muted" style="margin:-4px 0 10px;font-size:.9rem">${L('Paket hisobi shundan olinadi.', 'Из этого считается пакет студента.', 'This is what counts the student’s package.')}</p>
            <ul class="list">${tm.slice(0, 8).map(l => lessonItem({ ...l, who: who(l.student) }, `<div class="row-act">${markBtns(l)}</div>`)).join('')}</ul></div>`);
          v.querySelectorAll('.tomark [data-mark]').forEach(b => b.addEventListener('click', async () => {
            const [id, status] = b.dataset.mark.split('|'), l = tm.find(x => x.id === id); b.disabled = true;
            try { await api('lesson-mark', { body: { student: l.student, id, status } }); crmCache = {}; board = null; rerender('overview'); toast(L('Belgilandi.', 'Отмечено.', 'Marked.')); }
            catch (e) { b.disabled = false; toast(errMsg(e)); }
          }));
        }
        if (isAdmin) {
          v.insertAdjacentHTML('beforeend', `<div class="card" style="margin-top:18px" id="rv-admin">${loading}</div>`);
          const box = v.querySelector('#rv-admin');
          const paint = list => {
            const wait = list.filter(r => !r.ok).length;
            box.innerHTML = `<div class="card-h"><h3>${L('Talabalar fikrlari', 'Отзывы студентов', 'Student reviews')}</h3>${wait ? `<span class="tag warn">${wait} ${L('kutmoqda', 'ждут', 'waiting')}</span>` : ''}</div>
              <p class="muted" style="margin:-4px 0 12px;font-size:.9rem">${L('Chop etilgan fikrlar Academy sahifasida koʻrinadi.', 'Опубликованные отзывы видны на странице Academy.', 'Published reviews show on the Academy page.')}</p>
              ${list.length ? list.map(r => `<div class="rv-row"><div>${starsHtml(r.stars)}<b>${esc(r.name)}</b> <span class="muted">· ${esc(r.level || '')} · ${dayFmt(new Date(r.at))}</span><p class="rv-text">${pre(r.text)}</p></div>
                <div class="rv-act"><span class="tag ${r.ok ? '' : 'warn'}">${r.ok ? L('Chop etilgan', 'Опубликован', 'Published') : L('Kutmoqda', 'Ждёт', 'Waiting')}</span>
                <button type="button" class="btn ${r.ok ? 'btn-s' : 'btn-p'} btn-sm" data-rv-ok="${esc(r.id)}" data-v="${r.ok ? '' : '1'}">${r.ok ? L('Yashirish', 'Скрыть', 'Hide') : L('Chop etish', 'Опубликовать', 'Publish')}</button>
                <button type="button" class="btn btn-s btn-sm" data-rv-del="${esc(r.id)}">${L('Oʻchirish', 'Удалить', 'Delete')}</button></div></div>`).join('')
                : `<p class="muted">${L('Hozircha fikrlar yoʻq. Talabalar oʻz sahifasida fikr qoldirishi mumkin.', 'Отзывов пока нет. Студенты оставляют их на своей странице.', 'No reviews yet. Students can write one from their overview page.')}</p>`}`;
            box.querySelectorAll('[data-rv-ok]').forEach(b => b.addEventListener('click', async () => { b.disabled = true; try { paint((await api('review-mod', { body: { id: b.dataset.rvOk, ok: !!b.dataset.v } })).reviews); } catch (e) { toast(errMsg(e)); b.disabled = false; } }));
            box.querySelectorAll('[data-rv-del]').forEach(b => b.addEventListener('click', async () => {
              if (!b.dataset.sure) { b.dataset.sure = '1'; b.innerHTML = L('Ishonchingiz komilmi?', 'Точно удалить?', 'Sure? Tap again'); return; }
              b.disabled = true; try { paint((await api('review-mod', { body: { id: b.dataset.rvDel, remove: true } })).reviews); } catch (e) { toast(errMsg(e)); b.disabled = false; }
            }));
          };
          api('reviews-all').then(r => paint(r.reviews), e => { box.innerHTML = failed(e); });
        }
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
      /* ---------------- CRM ---------------- */
      let crmCache = {}, crmMonth = curMonth(), crmTab = 'students';
      const getCrm = async m => crmCache[m] || (crmCache[m] = await api('crm', { params: { month: m } }));
      const shiftMonth = (m, d) => { const [y, mo] = m.split('-').map(Number), x = new Date(Date.UTC(y, mo - 1 + d, 15)); return x.toISOString().slice(0, 7); };
      RENDER.crm = async v => {
        v.innerHTML = loading;
        let C; try { await getRoster(); C = await getCrm(crmMonth); } catch (e) { v.innerHTML = failed(e); return; }
        const PT = payTags(), pk = id => (C.packages.find(p => p.id === id) || {}).name || '';
        const people = roster.map(st => ({ st, row: C.rows[st.id] || { teacher: null, month: null, toMark: 0 } }));
        const active = people.filter(x => x.row.month && x.row.month.pkg);
        const taught = C.teachers.reduce((a, t) => a + t.lessons, 0), toMark = people.reduce((a, x) => a + (x.row.toMark || 0), 0);
        const low = x => { const m = x.row.month; return m && m.pkg && (m.parts.teach.left <= 2 || Object.values(m.parts).some(p => p.over)); };
        const left = (m, k) => m ? `<span class="${m.parts[k].over ? 'neg' : m.parts[k].left <= (k === 'mentor' ? 0 : 2) && m.pkg ? 'lowv' : ''}">${m.parts[k].over ? '−' + num(m.parts[k].over) : num(m.parts[k].left)}</span><small> / ${num(m.parts[k].own + m.parts[k].carry)}</small>` : '<span class="muted">—</span>';
        const tabs = [['students', L('Talabalar', 'Студенты', 'Students')]].concat(isAdmin || isLimited ? [['teachers', isLimited ? L('Mening soatlarim', 'Мои часы', 'My hours') : L('Oʻqituvchilar', 'Преподаватели', 'Teachers')]] : []).concat(isMoney ? [['money', L('Toʻlovlar', 'Оплаты', 'Payments')]] : []).concat([['packages', L('Paketlar', 'Пакеты', 'Packages')]]);
        if (!tabs.some(t => t[0] === crmTab)) crmTab = 'students';
        let body = '';
        if (crmTab === 'students') {
          body = `<div class="card" style="padding:8px 12px"><div class="tbl-wrap"><table class="tbl crm"><thead><tr><th>${L('Talaba', 'Студент', 'Student')}</th><th>${L('Oʻqituvchi', 'Преподаватель', 'Teacher')}</th><th>${L('Paket', 'Пакет', 'Package')}</th><th>${KIND.teach}<small> ${L('qoldi, soat', 'осталось, ч', 'left, h')}</small></th><th>${KIND.speak}<small> ${L('qoldi, soat', 'осталось, ч', 'left, h')}</small></th><th>${KIND.mentor}<small> ${L('qoldi', 'осталось', 'left')}</small></th>${isMoney ? `<th>${L('Toʻlov', 'Оплата', 'Payment')}</th>` : ''}<th></th></tr></thead><tbody>
            ${people.map(x => { const m = x.row.month; return `<tr class="click" data-crm-open="${esc(x.st.id)}" tabindex="0"><td><b>${esc(x.st.name || x.st.email)}</b>${x.st.level ? ` <span class="tag rose">${x.st.level.toUpperCase()}</span>` : ''}${x.row.toMark ? `<br><span class="tag warn">${x.row.toMark} ${L('belgilanmagan', 'не отмечено', 'to mark')}</span>` : ''}</td>
              <td>${x.row.teacher ? esc(x.row.teacher.name) : '<span class="muted">—</span>'}</td><td>${m && m.pkg ? esc(pk(m.pkg) || m.name) : `<span class="tag grey">${L('Paketsiz', 'Без пакета', 'No package')}</span>`}</td>
              <td>${left(m, 'teach')}</td><td>${left(m, 'speak')}</td><td>${left(m, 'mentor')}</td>${isMoney ? `<td>${x.row.pay ? PT[x.row.pay.status] : '<span class="muted">—</span>'}</td>` : ''}<td class="go">${I('arrow')}</td></tr>`; }).join('') || `<tr><td colspan="8" class="muted">${L('Talabalar yoʻq.', 'Студентов нет.', 'No students.')}</td></tr>`}
            </tbody></table></div></div>
            <p class="note">${L('Qizil: paketdan ortiq ishlatilgan. Toʻq sariq: 2 soat yoki kamroq qoldi. Bosib talaba sahifasini oching.', 'Красный: использовано сверх пакета. Оранжевый: осталось 2 ч или меньше. Нажмите, чтобы открыть студента.', 'Red: used beyond the package. Amber: 2 hours or less left. Click a row to open the student.')}</p>`;
        }
        if (crmTab === 'teachers') {
          body = C.teachers.length ? `<div class="card" style="padding:8px 12px"><div class="tbl-wrap"><table class="tbl"><thead><tr><th>${L('Oʻqituvchi', 'Преподаватель', 'Teacher')}</th><th>${L('Darslar', 'Занятия', 'Lessons')}</th><th>${KIND.teach}, ${UNIT('teach')}</th><th>${KIND.speak}, ${UNIT('speak')}</th><th>${KIND.mentor}</th><th>${L('Jami soat', 'Всего часов', 'Total hours')}</th><th>${L('Kech / kelmadi', 'Поздно / неявка', 'Late / no-show')}</th><th>${L('Talabalar', 'Студенты', 'Students')}</th></tr></thead><tbody>
            ${C.teachers.sort((a, b) => b.lessons - a.lessons).map(t => `<tr><td><b>${esc(t.name || '—')}</b></td><td>${t.lessons}</td><td>${num(t.teach)}</td><td>${num(t.speak)}</td><td>${num(t.mentor)}</td><td><b>${num(t.teach + t.speak)}</b></td><td>${t.late}</td><td>${t.students.length}</td></tr>`).join('')}</tbody></table></div></div>
            <p class="note">${L('Oʻtilgan va kech bekor qilingan darslar hisoblanadi (oʻqituvchiga toʻlanadi). Oyni yuqoridan tanlang.', 'Считаются проведённые и поздно отменённые занятия (оплачиваются преподавателю). Месяц выбирается сверху.', 'Counts taught lessons and late cancels (paid to the teacher). Pick the month above.')}</p>`
            : `<div class="card muted">${L('Bu oyda belgilangan dars yoʻq.', 'В этом месяце нет отмеченных занятий.', 'No marked lessons this month.')}</div>`;
        }
        if (crmTab === 'money') {
          const T0 = C.totals || {};
          const rows = people.filter(x => x.row.pay);
          body = `<div class="grid g3"><div class="card kpi"><p class="k">${I('check')}${L('Toʻlangan', 'Оплачено', 'Paid')}</p><b>${money(T0.paid || 0)}</b></div>
            <div class="card kpi"><p class="k">${I('clock')}${L('Kutilmoqda va qisman', 'Ожидается и частично', 'Due and partly paid')}</p><b>${money((T0.due || 0) + (T0.partial || 0))}</b></div>
            <div class="card kpi"><p class="k">${I('alert')}${L('Muddati oʻtgan', 'Просрочено', 'Overdue')}</p><b>${money(T0.overdue || 0)}</b></div></div>
            <div class="card" style="margin-top:18px;padding:8px 12px"><div class="tbl-wrap"><table class="tbl"><thead><tr><th>${L('Talaba', 'Студент', 'Student')}</th><th>${L('Paket', 'Пакет', 'Package')}</th><th>${L('Summa', 'Сумма', 'Amount')}</th><th>${L('Holat', 'Статус', 'Status')}</th></tr></thead><tbody>
            ${rows.map(x => `<tr class="click" data-crm-open="${esc(x.st.id)}"><td><b>${esc(x.st.name || x.st.email)}</b></td><td>${esc(pk(x.row.pay.pkg)) || '—'}</td><td>${money(x.row.pay.amount || 0)}</td><td>${PT[x.row.pay.status]}</td></tr>`).join('') || `<tr><td colspan="4" class="muted">${L('Bu oy uchun toʻlov kiritilmagan.', 'За этот месяц оплат нет.', 'No payments recorded for this month.')}</td></tr>`}
            </tbody></table></div></div>
            ${people.filter(x => !x.row.pay).length ? `<p class="note">${L('Bu oy toʻlovi kiritilmaganlar', 'Без оплаты в этом месяце', 'No payment this month')}: ${people.filter(x => !x.row.pay).map(x => esc(x.st.name || x.st.email)).join(', ')}</p>` : ''}`;
        }
        if (crmTab === 'packages') {
          body = `<form id="pkg-form"><div class="grid g3">${C.packages.map((p, i) => `<div class="card pkgedit"><input type="hidden" name="id${i}" value="${esc(p.id)}">
              ${isAdmin ? `<label>${L('Nomi', 'Название', 'Name')}<input name="name${i}" value="${esc(p.name)}" maxlength="80"></label>` : `<h3>${esc(p.name)}</h3>`}
              ${isMoney ? (isAdmin ? `<label>${L('Narx (USD / oy)', 'Цена (USD / мес)', 'Price (USD / month)')}<input type="number" step="0.01" min="0" name="price${i}" value="${p.price}"></label>` : `<p class="price-ro">${money(p.price)} <small>/ ${L('oy', 'мес', 'month')}</small></p>`) : ''}
              ${['teach', 'speak', 'mentor'].map(k => isAdmin ? `<label><span>${KIND[k]}, ${UNIT(k)} / ${L('oy', 'мес', 'month')}</span><input type="number" step="0.25" min="0" name="${k}${i}" value="${p.parts[k]}"></label>` : `<p class="row-ro"><span>${KIND[k]}</span><b>${num(p.parts[k])} ${UNIT(k)}</b></p>`).join('')}
            </div>`).join('')}</div>
            ${isAdmin ? `<p class="form-msg" id="pkg-msg"></p><button class="btn btn-p" type="submit" style="margin-top:14px">${I('check')}${L('Paketlarni saqlash', 'Сохранить пакеты', 'Save packages')}</button>` : ''}</form>
            <p class="note">${L('Har oy uchun. Ishlatilmagan soatlar keyingi oyga bir marta oʻtadi.', 'На месяц. Неиспользованные часы переходят на следующий месяц один раз.', 'Per month. Unused hours carry over to the next month once.')}</p>`;
        }
        v.innerHTML = `<div class="toolbar crm-bar"><div class="monthpick"><button type="button" class="icon-btn" data-mshift="-1" aria-label="Previous month">${I('arrowl')}</button><b>${monthFmt(crmMonth)}</b><button type="button" class="icon-btn" data-mshift="1" aria-label="Next month">${I('arrow')}</button></div></div>
          <div class="grid g4 crm-kpi">
            <div class="card kpi"><p class="k">${I('users')}${L('Paketli talabalar', 'Студенты с пакетом', 'Students with a package')}</p><b>${active.length}<small>/${people.length}</small></b></div>
            <div class="card kpi"><p class="k">${I('check')}${L('Oʻtilgan darslar', 'Проведено занятий', 'Lessons taught')}</p><b>${taught}</b></div>
            <div class="card kpi"><p class="k">${I('alert')}${L('Kam qolgan', 'Заканчивается', 'Running low')}</p><b>${people.filter(low).length}</b></div>
            <div class="card kpi"><p class="k">${I('clock')}${L('Belgilanmagan', 'Не отмечено', 'To mark')}</p><b>${toMark}</b></div>
          </div>
          <div class="mini-tabs" role="tablist" style="margin-top:18px">${tabs.map(([k, t]) => `<button type="button" role="tab" data-crm-tab="${k}" aria-selected="${k === crmTab}">${t}</button>`).join('')}</div>
          ${body}`;
        v.querySelectorAll('[data-mshift]').forEach(b => b.addEventListener('click', () => { crmMonth = shiftMonth(crmMonth, +b.dataset.mshift); RENDER.crm(v); }));
        v.querySelectorAll('[data-crm-tab]').forEach(b => b.addEventListener('click', () => { crmTab = b.dataset.crmTab; RENDER.crm(v); }));
        v.querySelectorAll('[data-crm-open]').forEach(tr => { const go = () => { openStudent = tr.dataset.crmOpen; studentPage.tab = 'payments'; rendered.students = false; location.hash = 'students'; }; tr.addEventListener('click', go); tr.addEventListener('keydown', e => { if (e.key === 'Enter') go(); }); });
        const pf = v.querySelector('#pkg-form');
        if (pf && isAdmin) pf.addEventListener('submit', async e => {
          e.preventDefault(); const f = e.target, btn = f.querySelector('[type=submit]'); btn.disabled = true;
          const packages = C.packages.map((p, i) => ({ id: f['id' + i].value, name: f['name' + i].value, price: +f['price' + i].value, parts: { teach: +f['teach' + i].value, speak: +f['speak' + i].value, mentor: +f['mentor' + i].value } }));
          try { await api('packages-save', { body: { packages } }); crmCache = {}; toast(L('Paketlar saqlandi.', 'Пакеты сохранены.', 'Packages saved.')); RENDER.crm(v); }
          catch (err) { const m = v.querySelector('#pkg-msg'); m.innerHTML = errMsg(err); m.className = 'form-msg err'; btn.disabled = false; }
        });
      };

      let openStudent = null;
      /* the Students item in the menu always leads back to the list */
      document.querySelectorAll('a[data-view="students"]').forEach(a => a.addEventListener('click', () => {
        if (!openStudent) return;
        openStudent = null;
        if (location.hash === '#students') rerender('students'); else rendered.students = false;
      }));
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
          const tabs = [['lessons', L('Darslar', 'Занятия', 'Lessons')], ['homework', L('Uy vazifasi', 'Домашка', 'Homework')], ['checks', L('Testlar', 'Проверки', 'Checks')], ['speaking', L('Nutq', 'Разговор', 'Speaking')]].concat([['payments', isMoney ? L('Paket va toʻlov', 'Пакет и оплата', 'Package & payments') : L('Paket', 'Пакет', 'Package')]]);
          let body = '';
          const slv = s.level || 'b1';
          if (tab === 'checks') {
            if (!S.book) { body = loading; bookLessons(slv).then(r => { S.book = r; }, e => { S.book = { error: e }; }).then(() => { if (studentPage.tab === 'checks' && v.isConnected) draw(); }); }
            else if (S.book.error) body = failed(S.book.error);
            else {
              const C = S.checks || {}, done = S.book.lessons.filter(l => C[`${slv}-${l.n}`]);
              const avg = done.length ? Math.round(done.reduce((a, l) => { const c = C[`${slv}-${l.n}`]; return a + c.best / c.total; }, 0) / done.length * 100) : null;
              const row = l => { const c = C[`${slv}-${l.n}`]; return `<tr><td><b>${l.n}</b></td><td>${esc(l.title)}<br><span class="muted" style="font-size:.85rem">${L(`${l.week}-hafta`, `Неделя ${l.week}`, `Week ${l.week}`)} · ${esc(l.type)}</span></td><td>${c ? `<span class="tag ${c.best === c.total ? '' : c.best / c.total >= .7 ? 'grey' : 'warn'}">${c.best}/${c.total}</span>` : '<span class="muted">—</span>'}</td><td>${c ? c.tries : ''}</td><td>${c ? dayFmt(new Date(c.at)) : ''}</td></tr>`; };
              body = `<div class="grid g3"><div class="card kpi"><p class="k">${I('check')}${L('Bajarilgan testlar', 'Пройдено проверок', 'Checks done')}</p><b>${done.length}<small>/${S.book.lessons.length}</small></b></div>
                <div class="card kpi"><p class="k">${I('star')}${L('Oʻrtacha natija', 'Средний результат', 'Average best score')}</p><b>${avg == null ? '—' : avg + '%'}</b></div>
                <div class="card kpi"><p class="k">${I('book')}${L('Daraja', 'Уровень', 'Level')}</p><b>${slv.toUpperCase()}</b></div></div>
                <div class="card" style="margin-top:18px;padding:8px 12px"><div class="tbl-wrap"><table class="tbl"><thead><tr><th>#</th><th>${L('Dars', 'Урок', 'Lesson')}</th><th>${L('Eng yaxshi', 'Лучший', 'Best')}</th><th>${L('Urinish', 'Попыток', 'Tries')}</th><th>${L('Oxirgi', 'Последняя', 'Last')}</th></tr></thead><tbody>${S.book.lessons.map(row).join('')}</tbody></table></div></div>`;
            }
          }
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
            const actions = l => `<div class="row-act">${unmarked(l) ? markBtns(l) : ''}<button type="button" class="icon-btn" data-edit-lesson="${esc(l.id)}" aria-label="Edit">${I('edit')}</button><button type="button" class="icon-btn" data-del-lesson="${esc(l.id)}" aria-label="Delete">${I('x')}</button></div>`;
            const toMark = S.schedule.filter(unmarked).length;
            body = `<div class="card"><div class="card-h"><h3>${L('Keyingi darslar', 'Ближайшие занятия', 'Upcoming lessons')}</h3><button type="button" class="btn btn-p btn-sm" data-add-lesson>${I('calendar')}${L('Dars qoʻshish', 'Добавить занятие', 'Add a lesson')}</button></div>
              ${next.length ? `<ul class="list">${next.map(l => lessonItem(l, actions(l))).join('')}</ul>` : `<p class="muted">${L('Rejalashtirilgan dars yoʻq.', 'Нет запланированных занятий.', 'No lessons planned.')}</p>`}</div>
              ${past.length ? `<div class="card" style="margin-top:18px"><div class="card-h"><h3>${L('Oʻtgan darslar', 'Прошедшие занятия', 'Past lessons')}</h3>${toMark ? `<span class="tag warn">${toMark} ${L('belgilanmagan', 'не отмечено', 'to mark')}</span>` : ''}</div><ul class="list lessons-past">${past.slice(0, 30).map(l => lessonItem(l, actions(l))).join('')}</ul></div>` : ''}`;
          }
          if (tab === 'homework') {
            const card = h => { const st = hwState(h); return `<div class="hwi hw-card"><span class="ico">${I(st === 'reviewed' ? 'check' : 'edit')}</span>
              <div><b>${esc(h.title)}</b><span class="meta">${dueText(h)}</span></div>
              <div class="hw-act">${HWTAG[st]}${st !== 'todo' ? `<button type="button" class="btn ${st === 'in' ? 'btn-p' : 'btn-s'} btn-sm" data-rv-hw="${esc(h.id)}">${st === 'in' ? L('Tekshirish', 'Проверить', 'Review') : L('Izohni oʻzgartirish', 'Изменить отзыв', 'Edit feedback')}</button>` : ''}<button type="button" class="icon-btn" data-edit-hw="${esc(h.id)}" aria-label="Edit">${I('edit')}</button><button type="button" class="icon-btn" data-del-hw="${esc(h.id)}" aria-label="Delete">${I('x')}</button></div>
              ${h.text ? `<div class="task">${pre(h.text)}</div>` : ''}${answerHtml(h)}${reviewHtml(h)}</div>`; };
            body = `<div class="toolbar"><p class="muted" style="align-self:center">${L('Vazifa ixtiyoriy: kerak boʻlsa qoʻshing.', 'Задание необязательно: добавьте, если нужно.', 'Homework is optional: add it when you need it.')}</p><div class="btn-row"><button type="button" class="btn btn-p btn-sm" data-book-hw>${I('book')}${L('Kitobdan', 'Из книги', 'From the book')}</button><button type="button" class="btn btn-s btn-sm" data-add-hw>${I('edit')}${L('Oʻz vazifangiz', 'Своё задание', 'Write your own')}</button></div></div>
              <div class="hw">${S.homework.map(card).join('') || `<div class="card muted">${L('Bu talabaga hali vazifa berilmagan.', 'Этому студенту ещё не задано заданий.', 'No homework set for this student yet.')}</div>`}</div>`;
          }
          if (tab === 'payments') {
            const PT = payTags(), P = S.payments || [], B = S.balance || [];
            const months = [...new Set(B.map(m => m.month).concat(P.map(p => p.month)))].sort().reverse();
            const TT = S.teacher;
            const tBox = isMoney
              ? `<label class="assign">${L('Oʻqituvchi', 'Преподаватель', 'Teacher')}<select data-assign-t><option value="">${T('— Tanlanmagan', '— Не назначен', '— Not assigned')}</option>${staffList.map(t => `<option value="${esc(t.id)}"${TT && TT.id === t.id ? ' selected' : ''}>${esc(t.name || t.email)}</option>`).join('')}${TT && !staffList.some(t => t.id === TT.id) ? `<option value="${esc(TT.id)}" selected>${esc(TT.name)}</option>` : ''}</select></label>`
              : `<p class="assign-ro">${L('Oʻqituvchi', 'Преподаватель', 'Teacher')}: <b>${TT ? esc(TT.name) : '—'}</b></p>`;
            const row = m => {
              const b = B.find(x => x.month === m), p = P.find(x => x.month === m && x.pkg) || P.find(x => x.month === m);
              const cell = k => { const x = b && b.parts[k]; return x ? `${num(x.used)} / ${num(x.own + x.carry)}${x.over ? ` <span class="tag bad">+${num(x.over)}</span>` : ''}` : '—'; };
              return `<tr><td><b>${monthFmt(m)}</b><br><span class="muted" style="font-size:.85rem">${b && b.name ? esc(b.name) : (p && p.pkg ? '' : L('Paketsiz', 'Без пакета', 'No package'))}</span></td><td>${cell('teach')}</td><td>${cell('speak')}</td><td>${cell('mentor')}</td>
                ${isMoney ? `<td>${p ? (p.amount ? money(p.amount) + ' ' : '') + PT[p.status] : ''}${p && p.note ? `<br><span class="muted" style="font-size:.85rem">${esc(p.note)}</span>` : ''}</td><td>${p ? `<div class="row-act"><button type="button" class="icon-btn" data-edit-pay="${esc(p.id)}" aria-label="Edit">${I('edit')}</button><button type="button" class="icon-btn" data-del-pay="${esc(p.id)}" aria-label="Delete">${I('x')}</button></div>` : ''}</td>` : ''}</tr>`;
            };
            body = `<div class="card assign-card">${tBox}</div>
              <div style="margin-top:18px">${packageCard(B, L('Shu oy', 'Этот месяц', 'This month'))}</div>
              <div class="card" style="margin-top:18px"><div class="card-h"><h3>${L('Oylar', 'Месяцы', 'Months')}</h3>${isMoney ? `<button type="button" class="btn btn-p btn-sm" data-add-pay>${I('wallet')}${L('Oy qoʻshish', 'Добавить месяц', 'Add a month')}</button>` : `<span class="muted" style="font-size:.9rem">${L('ishlatildi / jami', 'использовано / всего', 'used / total')}</span>`}</div>
                ${months.length ? `<div class="tbl-wrap"><table class="tbl"><thead><tr><th>${L('Oy', 'Месяц', 'Month')}</th><th>${KIND.teach}, ${UNIT('teach')}</th><th>${KIND.speak}, ${UNIT('speak')}</th><th>${KIND.mentor}</th>${isMoney ? `<th>${L('Toʻlov', 'Оплата', 'Payment')}</th><th></th>` : ''}</tr></thead><tbody>${months.map(row).join('')}</tbody></table></div>`
                  : `<p class="muted">${isMoney ? L('Oy qoʻshing: paket va toʻlovni tanlang.', 'Добавьте месяц: выберите пакет и оплату.', 'Add a month: choose the package and the payment.') : L('Hali paket yoʻq.', 'Пакета пока нет.', 'No package yet.')}</p>`}
                ${isMoney ? `<p class="note">${L('Talaba oʻz paketini va toʻlovlarini koʻradi. Oʻqituvchilar summalarni koʻrmaydi.', 'Студент видит свой пакет и оплаты. Преподаватели суммы не видят.', 'The student sees their package and payments. Teachers don’t see amounts.')}</p>` : ''}</div>`;
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
                <div class="row2"><label>${L('Turi', 'Тип', 'Type')}<select name="kind">${['teach', 'speak', 'mentor'].map(k => `<option value="${k}"${(l ? l.kind || 'teach' : 'teach') === k ? ' selected' : ''}>${KT[k]}</option>`).join('')}</select></label>
                <label>${L('Davomiyligi', 'Длительность', 'Length')}<select name="minutes">${[30, 45, 60, 90, 120].map(m => `<option value="${m}"${(l ? l.minutes : 60) === m ? ' selected' : ''}>${m} ${T('daqiqa', 'минут', 'minutes')}</option>`).join('')}</select></label></div>
                ${isLimited ? '' : `<label>${L('Oʻqituvchi', 'Преподаватель', 'Teacher')}<select name="teacher"><option value="">${T('— Talabaning oʻqituvchisi', '— Преподаватель студента', '— The student’s teacher')}</option>${staffList.map(t => `<option value="${esc(t.id)}"${l && l.teacher && l.teacher.id === t.id ? ' selected' : ''}>${esc(t.name || t.email)}</option>`).join('')}</select></label>`}
                ${l ? `<label>${L('Natija', 'Итог', 'Outcome')}<select name="status">${[['planned', T('Rejada', 'Запланировано', 'Planned')], ['taught', T('Oʻtildi', 'Проведено', 'Taught')], ['late', T('Kech bekor / kelmadi (hisoblanadi)', 'Поздняя отмена / неявка (засчитывается)', 'Late cancel / no-show (counts)')], ['cancelled', T('24+ soat oldin bekor (hisoblanmaydi)', 'Отмена за 24+ ч (не засчитывается)', 'Cancelled 24h+ before (not counted)')]].map(([k, t]) => `<option value="${k}"${(l.status || 'planned') === k ? ' selected' : ''}>${t}</option>`).join('')}</select></label>` : ''}
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
              try { const r = await api('lesson-save', { body: { student: s.id, lesson: { id: l && l.id, start: start.toISOString(), minutes: +f.minutes.value, kind: f.kind.value, ...(f.status ? { status: f.status.value } : {}), ...(f.teacher && f.teacher.value ? { teacher: (t => ({ id: t.id, name: t.name || t.email }))(staffList.find(t => t.id === f.teacher.value)) } : {}), title: f.title.value, link: f.link.value.trim(), note: f.note.value } } }); closeDrawer(); saved('schedule', r.schedule); toast(L('Dars saqlandi.', 'Занятие сохранено.', 'Lesson saved.')); }
              catch (err) { formMsg(p, err); btn.disabled = false; }
            });
          };
          const q = sel => v.querySelectorAll(sel);
          q('[data-add-lesson]').forEach(b => b.addEventListener('click', () => lessonForm(null)));
          q('[data-edit-lesson]').forEach(b => b.addEventListener('click', () => lessonForm(S.schedule.find(x => x.id === b.dataset.editLesson))));
          q('[data-mark]').forEach(b => b.addEventListener('click', async () => {
            const [id, status] = b.dataset.mark.split('|'); b.disabled = true;
            try { const r = await api('lesson-mark', { body: { student: s.id, id, status } }); S.balance = (await api('student', { params: { id: s.id } })).balance; saved('schedule', r.schedule); }
            catch (e) { b.disabled = false; toast(errMsg(e)); }
          }));
          q('[data-assign-t]').forEach(sel => sel.addEventListener('change', async () => {
            const t = staffList.find(x => x.id === sel.value);
            try { const r = await api('assign', { body: { student: s.id, teacher: t ? { id: t.id, name: t.name || t.email } : null } }); S.teacher = r.teacher; crmCache = {}; toast(t ? L('Oʻqituvchi tayinlandi.', 'Преподаватель назначен.', 'Teacher assigned.') : L('Oʻqituvchi olib tashlandi.', 'Преподаватель снят.', 'Teacher removed.')); }
            catch (e) { toast(errMsg(e)); }
          }));
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
          /* one-click homework from the book: the lesson's task, plus a reminder to take its check */
          q('[data-book-hw]').forEach(b => b.addEventListener('click', async () => {
            const slv = s.level || 'b1';
            let B; try { B = S.book && !S.book.error ? S.book : (S.book = await bookLessons(slv)); } catch (e) { toast(errMsg(e)); return; }
            const has = n => S.homework.some(h => h.book === `${slv}-${n}`);
            const item = l => `<li class="bk-l"><div><b>${L(`${l.n}-dars`, `Урок ${l.n}`, `Lesson ${l.n}`)} · ${esc(l.title)}</b><span>${esc(l.hw)}</span></div>
              <button type="button" class="btn ${has(l.n) ? 'btn-s' : 'btn-p'} btn-sm" data-assign="${l.n}"${has(l.n) ? ' disabled' : ''}>${has(l.n) ? I('check') + L('Berilgan', 'Задано', 'Set') : L('Berish', 'Задать', 'Set')}</button></li>`;
            const weeks = [...new Set(B.lessons.map(l => l.week))];
            const p = openDrawer(`${dHead(L('Kitobdan vazifa', 'Задание из книги', 'Homework from the book'), esc(s.name || s.email) + ' · ' + slv.toUpperCase())}
              <p class="muted" style="margin-bottom:14px">${L('Har bir dars uchun kitobdagi vazifa. “Berish” bosilsa, talaba uni darhol koʻradi.', 'Задание из книги для каждого урока. Нажмите «Задать», и студент сразу его увидит.', 'The book’s homework for every lesson. Press “Set” and the student sees it straight away.')}</p>
              ${weeks.map(w => `<h4 class="bk-w">${L(`${w}-hafta`, `Неделя ${w}`, `Week ${w}`)}</h4><ul class="bk-list">${B.lessons.filter(l => l.week === w).map(item).join('')}</ul>`).join('')}`);
            p.classList.add('wide');
            const next = B.lessons.find(l => !has(l.n)); const nb = next && p.querySelector(`[data-assign="${next.n}"]`); if (nb) setTimeout(() => nb.scrollIntoView({ block: 'center' }), 50);
            p.querySelectorAll('[data-assign]').forEach(btn => btn.addEventListener('click', async () => {
              const l = B.lessons.find(x => x.n === +btn.dataset.assign); btn.disabled = true;
              const lines = [l.hw];
              if (l.units.length) lines.push('Grammar: ' + l.units.map(u => `Unit ${u.n} · ${u.title}`).join('; ') + ' (Grammar Handbook).');
              lines.push(`Then take the Lesson ${l.n} check on your Course page (${l.q.length} questions).`);
              try { const r = await api('hw-save', { body: { student: s.id, homework: { title: `Lesson ${l.n} · ${l.title}`, text: lines.join('\n\n'), due: '', book: `${slv}-${l.n}` } } });
                S.homework = r.homework; btn.className = 'btn btn-s btn-sm'; btn.innerHTML = I('check') + L('Berilgan', 'Задано', 'Set'); board = null; draw(); toast(L('Vazifa berildi.', 'Задание отправлено.', 'Homework set.')); }
              catch (e) { btn.disabled = false; toast(errMsg(e)); }
            }));
          }));
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
                <label>${L('Paket', 'Пакет', 'Package')}<select name="pkg"><option value="">${T('— Paketsiz (faqat toʻlov)', '— Без пакета (только оплата)', '— No package (payment only)')}</option>${(S.packages || []).map(x => `<option value="${esc(x.id)}" data-price="${x.price || ''}"${pm ? (pm.pkg === x.id ? ' selected' : '') : ''}>${esc(x.name)}${x.price ? ' · ' + money(x.price) : ''} · ${num(x.parts.teach)} ${UT('teach')} + ${num(x.parts.speak)} ${UT('speak')} + ${num(x.parts.mentor)}</option>`).join('')}</select></label>
                <div class="row2"><label>${L('Oy', 'Месяц', 'Month')}<input type="month" name="month" required value="${esc(pm ? pm.month : now.getFullYear() + '-' + two(now.getMonth() + 1))}"></label>
                <label>${L('Summa (USD)', 'Сумма (USD)', 'Amount (USD)')}<input type="number" name="amount" min="0" step="0.01" value="${pm ? pm.amount : ''}"></label></div>
                <label>${L('Holat', 'Статус', 'Status')}<select name="status">${[['paid', T('Toʻlangan', 'Оплачено', 'Paid')], ['partial', T('Qisman toʻlangan', 'Оплачено частично', 'Partly paid')], ['due', T('Kutilmoqda', 'Ожидается', 'Due')], ['overdue', T('Muddati oʻtgan', 'Просрочено', 'Overdue')]].map(([k, t]) => `<option value="${k}"${(pm ? pm.status : 'due') === k ? ' selected' : ''}>${t}</option>`).join('')}</select></label>
                <label>${L('Izoh (ixtiyoriy)', 'Заметка (необязательно)', 'Note (optional)')}<input name="note" maxlength="300" value="${esc(pm ? pm.note : '')}"></label>
                <p class="form-msg"></p>
                <button class="btn btn-p" type="submit">${I('check')}${L('Saqlash', 'Сохранить', 'Save')}</button>
              </form>`);
            const pf = p.querySelector('form');
            pf.pkg.addEventListener('change', () => { const o = pf.pkg.selectedOptions[0]; if (o && o.dataset.price && !pf.amount.value) pf.amount.value = o.dataset.price; });
            pf.addEventListener('submit', async e => {
              e.preventDefault(); const f = e.target, btn = f.querySelector('[type=submit]'); btn.disabled = true;
              try { const r = await api('pay-save', { body: { student: s.id, payment: { id: pm && pm.id, pkg: f.pkg.value, month: f.month.value, amount: f.amount.value, status: f.status.value, note: f.note.value } } }); S.balance = (await api('student', { params: { id: s.id } })).balance; crmCache = {}; closeDrawer(); saved('payments', r.payments); toast(L('Toʻlov saqlandi.', 'Оплата сохранена.', 'Payment saved.')); }
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
              ${b.forWhom === 'family' ? `<dt>${L('Kim uchun', 'Для кого', 'For')}</dt><dd>${L('Oila aʼzosi', 'Член семьи', 'A family member')}</dd>` : ''}
              ${b.condition ? `<dt>${L('Holat', 'Ситуация', 'Situation')}</dt><dd>${COND[b.condition] || '—'}</dd>` : ''}
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
          const hhmm = cur => { const o = []; for (let m = 0; m < 1440; m += 30) o.push(`${String(m / 60 | 0).padStart(2, '0')}:${m % 60 ? '30' : '00'}`); if (!o.includes(cur)) o.push(cur); return o.sort().map(t => `<option${t === cur ? ' selected' : ''}>${t}</option>`).join(''); };
          const DN = [[1, L('Dushanba', 'Понедельник', 'Monday')], [2, L('Seshanba', 'Вторник', 'Tuesday')], [3, L('Chorshanba', 'Среда', 'Wednesday')], [4, L('Payshanba', 'Четверг', 'Thursday')], [5, L('Juma', 'Пятница', 'Friday')], [6, L('Shanba', 'Суббота', 'Saturday')], [7, L('Yakshanba', 'Воскресенье', 'Sunday')]];
          body = `<form class="card hours" id="hours-form">
            <p class="muted">${L(`Barcha vaqtlar ${esc(SET.tz)} boʻyicha.`, `Всё время указано по ${esc(SET.tz)}.`, `All times are ${esc(SET.tz)} time.`)}</p>
            <div class="hours-grid">${DN.map(([n, t]) => { const r = (SET.week[n] || [])[0]; return `<div class="hrow"><label class="check"><input type="checkbox" name="on${n}" ${r ? 'checked' : ''}><span>${t}</span></label><select name="from${n}" aria-label="From">${hhmm(r ? r[0] : '10:00')}</select><span class="muted">–</span><select name="to${n}" aria-label="To">${hhmm(r ? r[1] : '17:00')}</select></div>`; }).join('')}</div>
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
            if (Object.values(week).some(r => r.length && r[0][0] >= r[0][1])) { const m = v.querySelector('#hours-msg'); m.innerHTML = L('Tugash vaqti boshlanishdan keyin boʻlishi kerak.', 'Время окончания должно быть позже начала.', 'The end time must be after the start time.'); m.className = 'form-msg err'; return; }
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
