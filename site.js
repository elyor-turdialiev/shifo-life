/* Shifo Life site script.
   Fill in CONFIG before going live. Empty values are hidden on the page. */
const CONFIG = {
  phone: "",      // e.g. "+998 90 123 45 67"
  telegram: "",   // username without @, e.g. "shifolife"
  instagram: "",  // username without @
  email: "",      // e.g. "hello@shifolife.com"
  youtube: "",    // full URL of the Shifo Media channel
  podcast: ""     // full URL of the podcast (Spotify, Apple Podcasts…)
};

(function () {
  const doc = document.documentElement;
  const LANGS = ['uz', 'ru', 'en'];

  /* ---------- Language ---------- */
  function setLang(l) {
    if (!LANGS.includes(l)) l = 'uz';
    doc.lang = l;
    try { localStorage.setItem('shifo-lang', l); } catch (e) {}
    document.querySelectorAll('[data-lang]').forEach(b => b.setAttribute('aria-pressed', b.dataset.lang === l));
    document.querySelectorAll('[data-langs] .cur').forEach(c => c.textContent = l.toUpperCase());
    // Attributes and option labels that can't be hidden with CSS
    document.querySelectorAll('[data-uz]').forEach(el => {
      const v = el.getAttribute('data-' + l);
      if (v == null) return;
      if (el.tagName === 'OPTION' || el.hasAttribute('data-text')) el.textContent = v;
      else if ('placeholder' in el && el.tagName !== 'BUTTON') el.placeholder = v;
      else el.setAttribute('aria-label', v);
    });
    const t = document.body.getAttribute('data-title-' + l);
    if (t) document.title = t;
    const m = document.querySelector('.menu-btn');
    if (m) m.setAttribute('aria-label', { uz: 'Menyu', ru: 'Меню', en: 'Menu' }[l]);
  }
  document.querySelectorAll('[data-lang]').forEach(b => b.addEventListener('click', () => {
    setLang(b.dataset.lang);
    document.querySelectorAll('[data-langs]').forEach(d => { d.classList.remove('open'); d.querySelector('button').setAttribute('aria-expanded', false); });
  }));
  document.querySelectorAll('[data-langs] > button').forEach(t => t.addEventListener('click', e => {
    e.stopPropagation();
    const d = t.parentElement, open = d.classList.toggle('open');
    t.setAttribute('aria-expanded', open);
  }));
  document.addEventListener('click', e => {
    document.querySelectorAll('[data-langs].open').forEach(d => { if (!d.contains(e.target)) { d.classList.remove('open'); d.querySelector('button').setAttribute('aria-expanded', false); } });
  });
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape') document.querySelectorAll('[data-langs].open').forEach(d => { d.classList.remove('open'); d.querySelector('button').setAttribute('aria-expanded', false); d.querySelector('button').focus(); });
  });
  setLang(doc.lang);

  /* ---------- Mobile menu ---------- */
  const btn = document.querySelector('.menu-btn'), nav = document.getElementById('nav');
  if (btn && nav) {
    btn.addEventListener('click', () => {
      const open = nav.classList.toggle('open');
      btn.setAttribute('aria-expanded', open);
    });
    nav.querySelectorAll('a').forEach(a => a.addEventListener('click', () => {
      nav.classList.remove('open'); btn.setAttribute('aria-expanded', false);
    }));
  }

  /* ---------- Tabs ---------- */
  document.querySelectorAll('[role="tablist"]').forEach(list => {
    const tabs = [...list.querySelectorAll('[role="tab"]')];
    const select = (tab, focus) => {
      tabs.forEach(t => {
        const on = t === tab;
        t.setAttribute('aria-selected', on);
        t.tabIndex = on ? 0 : -1;
        const p = document.getElementById(t.getAttribute('aria-controls'));
        if (p) p.hidden = !on;
      });
      if (focus) tab.focus();
      list.dispatchEvent(new CustomEvent('tabchange', { detail: tabs.indexOf(tab) }));
    };
    tabs.forEach((t, i) => {
      t.addEventListener('click', () => select(t));
      t.addEventListener('keydown', e => {
        const dir = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 }[e.key];
        if (dir) { e.preventDefault(); select(tabs[(i + dir + tabs.length) % tabs.length], true); }
      });
    });
    list._select = i => select(tabs[i]);
  });

  /* ---------- Stepper (tabs with Back / Next) ---------- */
  document.querySelectorAll('.stepper').forEach(st => {
    const list = st.querySelector('[role="tablist"]');
    const tabs = [...list.querySelectorAll('[role="tab"]')];
    let cur = 0;
    const update = i => {
      cur = i;
      tabs.forEach((t, k) => t.classList.toggle('done', k < i));
      st.querySelectorAll('[data-step="prev"]').forEach(b => b.disabled = i === 0);
      st.querySelectorAll('[data-step="next"]').forEach(b => b.disabled = i === tabs.length - 1);
    };
    list.addEventListener('tabchange', e => update(e.detail));
    st.querySelectorAll('[data-step]').forEach(b => b.addEventListener('click', () => {
      const n = cur + (b.dataset.step === 'next' ? 1 : -1);
      if (n >= 0 && n < tabs.length) list._select(n);
    }));
    update(0);
  });

  /* ---------- Chapter bar: highlight the chapter in view ---------- */
  const bar = document.querySelector('.chapters');
  if (bar) {
    const links = [...bar.querySelectorAll('a[href^="#"]')];
    const secs = links.map(a => document.getElementById(a.getAttribute('href').slice(1)));
    let current = -1, ticking = false;
    const spy = () => {
      ticking = false;
      let idx = -1;
      secs.forEach((s, i) => { if (s && s.getBoundingClientRect().top <= 170) idx = i; });
      if (idx === current) return;
      current = idx;
      links.forEach((a, i) => a.classList.toggle('active', i === idx));
      if (idx >= 0) {
        const a = links[idx], w = bar.querySelector('.wrap');
        w.scrollTo({ left: a.offsetLeft - w.clientWidth / 2 + a.offsetWidth / 2, behavior: 'smooth' });
      }
    };
    window.addEventListener('scroll', () => { if (!ticking) { ticking = true; requestAnimationFrame(spy); } }, { passive: true });
    spy();
  }

  /* ---------- Channels from CONFIG ---------- */
  const T = {
    phone: { uz: 'Telefon', ru: 'Телефон', en: 'Phone' },
    email: { uz: 'Email', ru: 'Email', en: 'Email' }
  };
  document.querySelectorAll('[data-channels]').forEach(ul => {
    const add = (label, text, href) => {
      const li = document.createElement('li');
      const b = document.createElement('b');
      if (typeof label === 'string') b.textContent = label;
      else LANGS.forEach(l => { const s = document.createElement('span'); s.dataset.l = l; s.textContent = label[l]; b.appendChild(s); });
      const a = document.createElement('a');
      a.textContent = text; a.href = href; a.target = '_blank'; a.rel = 'noopener';
      li.append(b, a); ul.appendChild(li);
    };
    if (CONFIG.phone) add(T.phone, CONFIG.phone, 'tel:' + CONFIG.phone.replace(/\s/g, ''));
    if (CONFIG.telegram) add('Telegram', '@' + CONFIG.telegram, 'https://t.me/' + CONFIG.telegram);
    if (CONFIG.instagram) add('Instagram', '@' + CONFIG.instagram, 'https://instagram.com/' + CONFIG.instagram);
    if (CONFIG.email) add(T.email, CONFIG.email, 'mailto:' + CONFIG.email);
    if (!ul.children.length) ul.hidden = true;
  });
  document.querySelectorAll('[data-media-links]').forEach(box => {
    const link = (label, href) => {
      const a = document.createElement('a');
      a.className = 'btn btn-w'; a.href = href; a.target = '_blank'; a.rel = 'noopener';
      LANGS.forEach(l => { const s = document.createElement('span'); s.dataset.l = l; s.textContent = label[l]; a.appendChild(s); });
      box.appendChild(a);
    };
    if (CONFIG.youtube) link({ uz: 'YouTube’da koʻrish', ru: 'Смотреть на YouTube', en: 'Watch on YouTube' }, CONFIG.youtube);
    if (CONFIG.podcast) link({ uz: 'Podkastni tinglash', ru: 'Слушать подкаст', en: 'Listen to the podcast' }, CONFIG.podcast);
    if (CONFIG.telegram) link({ uz: 'Telegram kanal', ru: 'Telegram-канал', en: 'Telegram channel' }, 'https://t.me/' + CONFIG.telegram);
    if (!box.children.length) box.hidden = true;
    else document.querySelectorAll('[data-media-empty]').forEach(e => e.hidden = true);
  });

  /* ---------- Contact form ---------- */
  const form = document.getElementById('contact-form');
  if (form) {
    const sel = form.querySelector('[name="interest"]');
    const fromHash = () => {
      const h = location.hash.slice(1);
      if (h && sel.querySelector('option[value="' + h + '"]')) sel.value = h;
    };
    fromHash();
    window.addEventListener('hashchange', fromHash);

    const msg = document.getElementById('form-msg');
    const M = {
      need: { uz: 'Siz bilan bogʻlanishimiz uchun ismingiz va telefon raqamingiz yoki Telegram’ingizni yozing.', ru: 'Укажите имя и номер телефона или Telegram, чтобы мы могли с вами связаться.', en: 'Add your name and a phone number or Telegram so we can contact you.' },
      ok: { uz: 'Soʻrovingiz yuborildi. Tez orada siz bilan bogʻlanamiz.', ru: 'Заявка отправлена. Мы скоро с вами свяжемся.', en: 'Request sent. We will contact you soon.' },
      err: { uz: 'Soʻrov yuborilmadi. Internetni tekshirib, qayta urinib koʻring.', ru: 'Заявка не отправлена. Проверьте интернет и попробуйте ещё раз.', en: 'Your request was not sent. Check your connection and try again.' },
      sending: { uz: 'Yuborilmoqda…', ru: 'Отправляем…', en: 'Sending…' }
    };
    const show = (k, cls) => { msg.textContent = M[k][doc.lang]; msg.className = 'form-msg ' + cls; };
    form.addEventListener('submit', async e => {
      e.preventDefault();
      if (!form.elements.name.value.trim() || !form.elements.phone.value.trim()) return show('need', 'err');
      const submit = form.querySelector('button[type="submit"]');
      submit.disabled = true; msg.className = 'form-msg';
      try {
        const res = await fetch('/', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams(new FormData(form)).toString() });
        if (!res.ok) throw new Error(res.status);
        form.reset(); show('ok', 'ok');
      } catch (err) { show('err', 'err'); }
      finally { submit.disabled = false; }
    });
  }

  const y = document.getElementById('year');
  if (y) y.textContent = new Date().getFullYear();
})();
