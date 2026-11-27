/* Shifo Life — slider, header, reveal and counters */
(function () {
  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* Header turns solid after scrolling (home) */
  const top = document.querySelector('body.home .top');
  if (top) {
    const onScroll = () => top.classList.toggle('scrolled', window.scrollY > 40);
    window.addEventListener('scroll', onScroll, { passive: true });
    onScroll();
    const nav = document.getElementById('nav');
    document.querySelector('.menu-btn')?.addEventListener('click', () => setTimeout(() => top.classList.toggle('scrolled', nav.classList.contains('open') || window.scrollY > 40), 0));
  }

  /* Split slider headlines into words for the reveal */
  document.querySelectorAll('.s-copy .h1 [data-l]').forEach(span => {
    const words = span.textContent.trim().split(/\s+/);
    span.innerHTML = words.map((w, i) => `<span class="w"><span style="--d:${i}">${w}</span></span>`).join(' ');
  });

  /* Slider */
  const slider = document.querySelector('[data-slider]');
  if (slider) {
    const slides = [...slider.querySelectorAll('.slide')];
    const tabs = [...slider.querySelectorAll('.s-tabs button')];
    const DUR = 7000;
    let i = 0, timer = null, paused = false;
    slider.style.setProperty('--dur', DUR + 'ms');
    const go = n => {
      i = (n + slides.length) % slides.length;
      slides.forEach((s, k) => { s.classList.toggle('is-on', k === i); s.setAttribute('aria-hidden', k !== i); s.inert = k !== i; });
      tabs.forEach((t, k) => {
        t.setAttribute('aria-selected', k === i);
        const bar = t.querySelector('.track i'); // restart progress animation
        if (bar) { bar.style.animation = 'none'; void bar.offsetWidth; bar.style.animation = ''; }
      });
      schedule();
    };
    const schedule = () => { clearTimeout(timer); if (!paused && !reduce) timer = setTimeout(() => go(i + 1), DUR); };
    const pause = p => { paused = p; slider.classList.toggle('paused', p); if (p) clearTimeout(timer); else schedule(); };
    tabs.forEach((t, k) => t.addEventListener('click', () => go(k)));
    slider.querySelector('[data-prev]')?.addEventListener('click', () => go(i - 1));
    slider.querySelector('[data-next]')?.addEventListener('click', () => go(i + 1));
    slider.addEventListener('mouseenter', () => pause(true));
    slider.addEventListener('mouseleave', () => pause(false));
    slider.addEventListener('focusin', () => pause(true));
    slider.addEventListener('focusout', e => { if (!slider.contains(e.relatedTarget)) pause(false); });
    slider.addEventListener('keydown', e => { if (e.key === 'ArrowRight') go(i + 1); if (e.key === 'ArrowLeft') go(i - 1); });
    let x0 = null;
    slider.addEventListener('touchstart', e => { x0 = e.touches[0].clientX; }, { passive: true });
    slider.addEventListener('touchend', e => {
      if (x0 === null) return;
      const dx = e.changedTouches[0].clientX - x0; x0 = null;
      if (Math.abs(dx) > 50) go(i + (dx < 0 ? 1 : -1));
    });
    document.addEventListener('visibilitychange', () => document.hidden ? clearTimeout(timer) : schedule());
    go(0);
  }

  /* Give section content a staggered reveal */
  const AUTO = '.sec .head, .rows > li, .steps > li, .plans > .plan, .inc > li, .faq > details, .goals > .goal, .topicgrid > .topic, .formats > .format, .journey > .jcard, .founders > *, .word, .stepper, .split > *, .disclaimer, .tabs';
  document.querySelectorAll(AUTO).forEach(el => {
    if (el.closest('[data-reveal]') || el.hasAttribute('data-reveal')) return;
    el.setAttribute('data-reveal', '');
    const sibs = [...el.parentElement.children].filter(s => s.matches(AUTO));
    el.style.setProperty('--rd', Math.min(sibs.indexOf(el), 6));
  });

  /* News ticker: official travel and health updates */
  const tick = document.querySelector('[data-news]');
  if (tick) {
    const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    const render = items => {
      if (!items || !items.length) return;
      const MON = {
        uz: ['yan', 'fev', 'mar', 'apr', 'may', 'iyun', 'iyul', 'avg', 'sen', 'okt', 'noy', 'dek'],
        ru: ['янв', 'фев', 'мар', 'апр', 'мая', 'июн', 'июл', 'авг', 'сен', 'окт', 'ноя', 'дек'],
        en: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
      };
      const html = items.map(n => {
        const d = n.date ? new Date(n.date) : null;
        const ds = d && !isNaN(d) ? ['uz', 'ru', 'en'].map(l => `<span data-l="${l}">${d.getUTCDate()} ${MON[l][d.getUTCMonth()]}</span>`).join('') : '';
        const icon = n.kind === 'health' ? 'heart' : 'plane';
        return `<a class="t-item" href="${esc(n.link)}" target="_blank" rel="noopener"><span class="t-ic"><svg class="ic" aria-hidden="true"><use href="#i-${icon}"/></svg></span><span class="t-src">${esc(n.src)}</span>${ds ? `<span class="t-date">${ds}</span>` : ''}<span class="t-title">${esc(n.title)}</span>${n.level ? `<span class="t-lvl l${n.level}">L${n.level}</span>` : ''}</a>`;
      }).join('');
      const track = tick.querySelector('.t-track');
      track.innerHTML = html + html.replace(/<a /g, '<a tabindex="-1" aria-hidden="true" ');
      tick.hidden = false;
      requestAnimationFrame(() => track.style.setProperty('--tdur', Math.max(40, track.scrollWidth / 2 / 70) + 's'));
    };
    fetch('/.netlify/functions/news').then(r => r.ok ? r.json() : Promise.reject())
      .then(d => render(d.items))
      .catch(() => { if (window.SHIFO_NEWS_SAMPLE) render(window.SHIFO_NEWS_SAMPLE.items); });
  }

  /* Reveal on scroll + counters */
  const count = el => {
    const end = parseFloat(el.dataset.count), suf = el.dataset.suffix || '', t0 = performance.now(), d = 1400;
    if (reduce) { el.textContent = end + suf; return; }
    const step = t => { const p = Math.min(1, (t - t0) / d); el.textContent = Math.round(end * (1 - Math.pow(1 - p, 3))) + suf; if (p < 1) requestAnimationFrame(step); };
    requestAnimationFrame(step);
  };
  const items = document.querySelectorAll('[data-reveal], [data-count]');
  if (!('IntersectionObserver' in window)) { items.forEach(el => { el.classList.add('in'); if (el.dataset.count) count(el); }); return; }
  const io = new IntersectionObserver(entries => entries.forEach(en => {
    if (!en.isIntersecting) return;
    en.target.classList.add('in');
    if (en.target.dataset.count) count(en.target);
    io.unobserve(en.target);
  }), { rootMargin: '0px 0px -10% 0px', threshold: 0.12 });
  items.forEach(el => io.observe(el));
  /* A link to a section (#faq, academy#plans…) shows everything up to and around it at once,
     so nothing above the landing point is left invisible while the page jumps */
  const showTo = () => {
    let t = null; try { t = location.hash && document.getElementById(decodeURIComponent(location.hash.slice(1))); } catch (e) {}
    if (!t) return;
    const lim = t.getBoundingClientRect().bottom + innerHeight;
    items.forEach(el => { if (!el.classList.contains('in') && el.getBoundingClientRect().top < lim) { el.classList.add('in'); io.unobserve(el); if (el.dataset.count) count(el); } });
  };
  showTo();
  addEventListener('hashchange', showTo);
})();
