/* Shifo Life site script.
   Fill in CONFIG before going live. Empty values are hidden on the page. */
const CONFIG = {
  phone: "",      // e.g. "+998 90 123 45 67"
  telegram: "",   // username without @, e.g. "shifolife"
  instagram: "shifolifetv",  // username without @ (Shifo Life TV)
  email: "shifolifeus@gmail.com",
  youtube: "https://www.youtube.com/@shifolifeuz",    // full URL of the Shifo Media channel
  podcast: ""     // full URL of the podcast (Spotify, Apple Podcasts…)
};

(function () {
  /* Links from Netlify Identity emails land on any page: send them to the login page */
  if (/(invite_token|recovery_token|confirmation_token)=/.test(location.hash) && !/\/login(\.html)?$/.test(location.pathname)) {
    location.replace('login.html' + location.hash); return;
  }
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
    if (CONFIG.instagram) link({ uz: 'Shifo Life TV · Instagram', ru: 'Shifo Life TV · Instagram', en: 'Shifo Life TV on Instagram' }, 'https://instagram.com/' + CONFIG.instagram);
    if (!box.children.length) box.hidden = true;
    else document.querySelectorAll('[data-media-empty]').forEach(e => e.hidden = true);
  });

  /* ---------- YouTube: show a picture first, load the player only when pressed ---------- */
  document.querySelectorAll('[data-yt]').forEach(box => {
    const b = box.querySelector('.yt-play'); if (!b) return;
    b.addEventListener('click', () => {
      const f = document.createElement('iframe');
      f.src = 'https://www.youtube-nocookie.com/embed/' + box.dataset.yt + '?autoplay=1&rel=0';
      f.title = b.getAttribute('aria-label') || 'YouTube'; f.allow = 'autoplay; encrypted-media; picture-in-picture; fullscreen'; f.allowFullscreen = true;
      b.replaceWith(f);
    });
  });

  /* ---------- Academy: published student reviews (the section stays hidden until there are some) ---------- */
  document.querySelectorAll('[data-reviews]').forEach(sec => {
    fetch('/api/academy?action=reviews').then(r => r.ok ? r.json() : null).then(d => {
      const list = d && d.reviews || [];
      if (!list.length) return;
      const esc = t => String(t).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
      const stars = n => '<span class="stars" aria-label="' + n + '/5">' + [1, 2, 3, 4, 5].map(i => '<i class="' + (i <= n ? 'on' : '') + '">★</i>').join('') + '</span>';
      const avg = list.reduce((a, r) => a + r.stars, 0) / list.length;
      sec.querySelector('[data-rv-sum]').innerHTML = '<b>' + avg.toFixed(1) + '</b>' + stars(Math.round(avg)) + '<span>' + list.length + '</span>';
      // a photo shows when photos/review-<name>.jpg exists (e.g. review-madina-k.jpg); otherwise the initials
      const slug = n => String(n).toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
      const ini = n => String(n).split(/\s+/).filter(Boolean).slice(0, 2).map(w => w[0]).join('').toUpperCase();
      sec.querySelector('[data-rv-list]').innerHTML = list.slice(0, 9).map(r => '<figure class="rv">' + stars(r.stars) + '<blockquote>' + esc(r.text) + '</blockquote><figcaption><span class="rv-av" aria-hidden="true">' + esc(ini(r.name)) + '<img src="photos/review-' + slug(r.name) + '.jpg" alt="" loading="lazy" onerror="this.remove()"></span><span><b>' + esc(r.name) + '</b>' + (r.level ? '<small>Medical English · ' + esc(r.level) + '</small>' : '') + '</span></figcaption></figure>').join('');
      sec.hidden = false;
    }).catch(() => {});
  });

  /* ---------- Application forms (Academy, Abroad, Contact) ---------- */
  // Old links (Instagram, bookmarks) pointed every field at contact.html#<field>; send them to the field's own form.
  if (document.querySelector('form[name="contact"]')) {
    const h = location.hash.slice(1);
    const go = h === 'clinic' ? 'book.html' : h === 'abroad' ? 'abroad.html#apply'
      : h === 'academy' ? 'academy.html#apply' : /^academy-/.test(h) ? 'academy.html#apply-' + h.slice(8) : '';
    if (go) { location.replace(go); return; }
  }
  const pick = (form, name, value) => {
    const sel = form.querySelector('select[name="' + name + '"]');
    if (sel) { const ok = [...sel.options].some(o => o.value === value); if (ok || value === '') sel.value = value; return ok; }
    const r = form.querySelector('input[type="radio"][name="' + name + '"][value="' + value + '"]');
    if (r) r.checked = true;
    return !!r;
  };
  const fromHash = () => {
    const h = location.hash.slice(1);
    const apply = document.getElementById('apply');
    const m = h.match(/^apply-(.+)$/);
    if (m && apply) {
      const f = apply.querySelector('form.lead-form');
      if (f && pick(f, 'plan', m[1])) apply.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
    const c = document.querySelector('form[name="contact"]');
    if (c) pick(c, 'topic', { media: 'media', 'media-guest': 'guest', other: 'other' }[h] || '');
  };
  fromHash();
  window.addEventListener('hashchange', fromHash);
  // A plan's button opens a booking sheet right there: the Apply form moves into it with that plan chosen,
  // and goes back to its place on the page when the sheet closes. Without <dialog> the link scrolls to the form.
  const sheet = document.getElementById('apply-sheet');
  const home = document.querySelector('#apply .formcard');
  const aform = home && home.querySelector('form.lead-form');
  if (sheet && aform && typeof sheet.showModal === 'function') {
    const slot = sheet.querySelector('[data-sheet-slot]');
    const openSheet = a => {
      const card = a.closest('.plan');   // the phone bar has no plan: the sheet then shows the plan choice
      if (card) pick(aform, 'plan', a.dataset.plan);
      sheet.querySelector('[data-sheet-name]').textContent = card ? card.querySelector('h3').textContent : 'Shifo Academy';
      sheet.querySelector('[data-sheet-price]').textContent = card ? card.querySelector('.price').innerText.replace(/\s+/g, ' ').trim() : '';
      sheet.querySelector('[data-sheet-change]').hidden = !card;
      aform.querySelector('.form-msg').className = 'form-msg';
      aform.classList.toggle('in-sheet', !!card); aform.classList.add('sheeted'); slot.appendChild(aform);
      sheet.showModal(); document.documentElement.classList.add('sheet-open');
      setTimeout(() => aform.elements.first.focus({ preventScroll: true }), 60);
    };
    sheet.addEventListener('close', () => { aform.classList.remove('in-sheet', 'sheeted'); home.appendChild(aform); document.documentElement.classList.remove('sheet-open'); });
    sheet.addEventListener('click', e => { if (e.target === sheet) sheet.close(); });
    sheet.querySelector('[data-sheet-close]').addEventListener('click', () => sheet.close());
    sheet.querySelector('[data-sheet-change]').addEventListener('click', () => {
      pick(aform, 'plan', ''); sheet.close();
      document.getElementById('apply').scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
    document.querySelectorAll('a[data-plan]').forEach(a => a.addEventListener('click', e => { e.preventDefault(); openSheet(a); }));
    // Phone: a small "Free trial" bar once the plans are on screen, hidden again at the form itself
    const bar = document.querySelector('[data-mbar]'), plans = document.getElementById('plans'), apply = document.getElementById('apply');
    if (bar && plans && 'IntersectionObserver' in window) {
      let past = false, atForm = false;
      const sync = () => { bar.hidden = !(past && !atForm); };
      new IntersectionObserver(([e]) => { past = e.isIntersecting || e.boundingClientRect.top < 0; sync(); }).observe(plans);
      new IntersectionObserver(([e]) => { atForm = e.isIntersecting; sync(); }).observe(apply);
    }
  } else {
    document.querySelectorAll('a[href^="#apply-"]').forEach(a => a.addEventListener('click', e => {
      if (location.hash === a.getAttribute('href')) { e.preventDefault(); fromHash(); }
    }));
  }

  const M = {
    need: { uz: 'Toʻldiring: ', ru: 'Заполните: ', en: 'Please add: ' },
    ok: { uz: 'Arizangiz yuborildi. Tez orada siz bilan bogʻlanamiz.', ru: 'Заявка отправлена. Мы скоро с вами свяжемся.', en: 'Sent. We will contact you soon.' },
    err: { uz: 'Yuborilmadi. Internetni tekshirib, qayta urinib koʻring.', ru: 'Не отправлено. Проверьте интернет и попробуйте ещё раз.', en: 'Not sent. Check your connection and try again.' }
  };
  const FIELD = {
    first: { uz: 'ism', ru: 'имя', en: 'first name' },
    last: { uz: 'familiya', ru: 'фамилию', en: 'last name' },
    email: { uz: 'toʻgʻri email', ru: 'правильный email', en: 'a valid email' },
    phone: { uz: 'telefon raqami (kod bilan, masalan +998)', ru: 'номер телефона (с кодом, например +998)', en: 'a phone number with its country code (e.g. +998)' },
    contact: { uz: 'bogʻlanish usuli', ru: 'способ связи', en: 'how we should contact you' },
    plan: { uz: 'tarif', ru: 'тариф', en: 'a plan' }
  };
  const EMAIL = /^[^\s@]+@[^\s@.]+(\.[^\s@.]+)+$/;
  document.querySelectorAll('form.lead-form').forEach(form => {
    const msg = form.querySelector('.form-msg'), el = form.elements;
    const say = (text, cls) => { msg.textContent = text; msg.className = 'form-msg ' + cls; };
    const show = (k, cls) => say(M[k][doc.lang] || M[k].en, cls);
    // Telegram chosen: offer the (optional) username field
    const tg = form.querySelector('.tg-user');
    const syncTg = () => { if (tg) tg.hidden = !(el.contact && el.contact.value === 'telegram'); };
    form.addEventListener('change', e => { if (e.target.name === 'contact') { syncTg(); e.target.closest('fieldset').classList.remove('bad'); } });
    form.addEventListener('change', e => { if (e.target.tagName === 'SELECT' && e.target.classList.contains('bad')) { e.target.classList.remove('bad'); e.target.removeAttribute('aria-invalid'); } });
    form.addEventListener('input', e => { if (e.target.classList.contains('bad')) { e.target.classList.remove('bad'); e.target.removeAttribute('aria-invalid'); } });
    syncTg();
    const problems = () => {
      const out = [], v = k => (el[k] ? el[k].value : '').trim();
      const phone = v('phone'), digits = phone.replace(/\D/g, ''), how = el.contact ? el.contact.value : '';
      if (!v('first')) out.push('first');
      if (!v('last')) out.push('last');
      if (!EMAIL.test(v('email'))) out.push('email');
      if ((el.phone.required || phone || how === 'call' || how === 'whatsapp') && (digits.length < 8 || digits.length > 15)) out.push('phone');
      if (el.contact && !how) out.push('contact');
      if (el.plan && el.plan.required && !el.plan.value) out.push('plan');
      return out;
    };
    form.addEventListener('submit', async e => {
      e.preventDefault();
      form.querySelectorAll('.bad').forEach(x => { x.classList.remove('bad'); x.removeAttribute('aria-invalid'); });
      const bad = problems();
      if (bad.length) {
        bad.forEach(k => { const f = k === 'contact' ? form.querySelector('[data-f="contact"]') : el[k]; f.classList.add('bad'); if (k !== 'contact') f.setAttribute('aria-invalid', 'true'); });
        if (bad.includes('plan') && form.classList.contains('in-sheet')) form.classList.remove('in-sheet');
        say((M.need[doc.lang] || M.need.en) + bad.map(k => FIELD[k][doc.lang] || FIELD[k].en).join(', ') + '.', 'err');
        const first = bad[0] === 'contact' ? form.querySelector('[data-f="contact"] input') : el[bad[0]];
        first.focus();
        return;
      }
      const submit = form.querySelector('button[type="submit"]');
      submit.disabled = true; msg.className = 'form-msg';
      try {
        form.querySelector('input[name="name"]').value = el.first.value.trim() + ' ' + el.last.value.trim();   // full name, for the email Netlify sends the team
        const fd = new FormData(form);
        const res = await fetch('/', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams(fd).toString() });
        if (!res.ok) throw new Error(res.status);
        // keep the chosen options visible; clear only what was typed
        form.querySelectorAll('input:not([type="radio"]):not([type="hidden"]), textarea').forEach(x => { x.value = ''; });
        show('ok', 'ok');
      } catch (err) { show('err', 'err'); }
      finally { submit.disabled = false; }
    });
  });

  /* ---------- Photos that cross-fade; the About story swaps its photo as you read ---------- */
  const still = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const ROTS = new Set();
  const step = r => {
    const imgs = [...r.querySelectorAll(':scope > img')], dots = [...r.querySelectorAll('.rot-dots i')];
    if (imgs.length < 2) return;
    const i = imgs.findIndex(x => x.classList.contains('on')), n = (i + 1) % imgs.length;
    imgs[i].classList.remove('on'); imgs[n].classList.add('on');
    dots.forEach((d, k) => d.classList.toggle('on', k === n));
    const cap = r.querySelector('.rot-cap');
    if (cap) { cap.classList.add('swap'); setTimeout(() => { cap.textContent = imgs[n].dataset.cap || ''; cap.classList.remove('swap'); }, 400); }
    const after = imgs[(n + 1) % imgs.length]; if (after.loading === 'lazy') after.loading = 'eager';   // load the next one early
  };
  document.querySelectorAll('[data-rot]').forEach(r => { const d = r.querySelector('.rot-dots i'); if (d) d.classList.add('on'); });
  if ('IntersectionObserver' in window) {
    const seen = new IntersectionObserver(es => es.forEach(e => e.isIntersecting ? ROTS.add(e.target) : ROTS.delete(e.target)), { threshold: .3 });
    document.querySelectorAll('[data-rot]').forEach(r => seen.observe(r));
    // the sticky frame is hidden to the observer's eyes (aria only), so track the shown one directly
    if (!still) setInterval(() => {
      if (document.hidden) return;
      ROTS.forEach(r => { if (!r.closest('.story-frame') || r.classList.contains('show')) step(r); });
    }, 3600);
  }

  /* About story: the chapter nearest the middle of the screen is the one shown in the photo */
  const story = document.querySelector('.story');
  if (story) {
    const shots = story.querySelectorAll('.story-frame > .rot'), chs = [...story.querySelectorAll('.story-ch')];
    let cur = -1;
    const show = n => {
      if (n === cur) return; cur = n;
      chs.forEach((c, k) => c.classList.toggle('on', k === n));
      shots.forEach((r, k) => { r.classList.toggle('show', k === n); if (Math.abs(k - n) <= 1) r.querySelectorAll('img').forEach(im => { im.loading = 'eager'; }); });
    };
    const at = () => {
      const mid = innerHeight / 2;
      let best = 0, d = Infinity;
      chs.forEach((c, k) => { const r = c.getBoundingClientRect(), x = Math.abs(r.top + r.height / 2 - mid); if (x < d) { d = x; best = k; } });
      show(best);
    };
    let tick = false;
    addEventListener('scroll', () => { if (!tick) { tick = true; requestAnimationFrame(() => { tick = false; at(); }); } }, { passive: true });
    addEventListener('resize', at); at();
  }

  /* How-it-works steps: the line draws across and the steps appear one by one */
  const stepLists = document.querySelectorAll('.steps');
  if (stepLists.length && 'IntersectionObserver' in window && !still) {
    doc.classList.add('anim-steps');
    const so = new IntersectionObserver(es => es.forEach(e => { if (e.isIntersecting) { e.target.classList.add('in'); so.unobserve(e.target); } }), { threshold: .35 });
    stepLists.forEach(l => so.observe(l));
  }

  const y = document.getElementById('year');
  if (y) y.textContent = new Date().getFullYear();
})();
