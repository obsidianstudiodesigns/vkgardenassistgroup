(() => {
  const root = document.documentElement;
  root.classList.add('js');
  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const finePointer = window.matchMedia('(hover: hover) and (pointer: fine)').matches;

  document.getElementById('yr').textContent = new Date().getFullYear();

  /* ---------- Theme toggle ---------- */
  const themeBtn = document.getElementById('themeToggle');
  const storedTheme = (() => { try { return localStorage.getItem('vk-theme'); } catch { return null; } })();
  if (storedTheme) root.dataset.theme = storedTheme;
  themeBtn.addEventListener('click', () => {
    const isDark = root.dataset.theme
      ? root.dataset.theme === 'dark'
      : window.matchMedia('(prefers-color-scheme: dark)').matches;
    root.dataset.theme = isDark ? 'light' : 'dark';
    try { localStorage.setItem('vk-theme', root.dataset.theme); } catch {}
    window.dispatchEvent(new CustomEvent('vk-theme'));
  });

  /* ---------- Service tabs ---------- */
  const tabs = [...document.querySelectorAll('.svc-tabs [role="tab"]')];
  const selectTab = (tab, focus) => {
    tabs.forEach(t => {
      const on = t === tab;
      t.setAttribute('aria-selected', on);
      t.tabIndex = on ? 0 : -1;
      const panel = document.getElementById(t.getAttribute('aria-controls'));
      panel.hidden = !on;
      if (on) {
        panel.querySelectorAll('li').forEach((li, i) => li.style.setProperty('--i', i));
        panel.classList.remove('is-entering');
        void panel.offsetWidth;
        panel.classList.add('is-entering');
      }
    });
    if (focus) tab.focus();
  };
  tabs.forEach((tab, i) => {
    tab.addEventListener('click', () => selectTab(tab));
    tab.addEventListener('keydown', e => {
      const dir = e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : 0;
      if (dir) { e.preventDefault(); selectTab(tabs[(i + dir + tabs.length) % tabs.length], true); }
    });
  });

  /* ---------- 3D tilt on photos and products ---------- */
  if (finePointer && !reduce) {
    document.querySelectorAll('.tilt').forEach(el => {
      el.addEventListener('pointermove', e => {
        const r = el.getBoundingClientRect();
        const x = (e.clientX - r.left) / r.width - .5;
        const y = (e.clientY - r.top) / r.height - .5;
        el.style.transform = `perspective(900px) rotateY(${x * 8}deg) rotateX(${-y * 8}deg) translateZ(6px)`;
      });
      el.addEventListener('pointerleave', () => { el.style.transform = ''; });
    });

    document.querySelectorAll('.magnetic').forEach(el => {
      el.addEventListener('pointermove', e => {
        const r = el.getBoundingClientRect();
        el.style.transform = `translate(${(e.clientX - r.left - r.width / 2) * .18}px, ${(e.clientY - r.top - r.height / 2) * .25}px)`;
      });
      el.addEventListener('pointerleave', () => { el.style.transform = ''; });
    });
  }

  /* ---------- Reveal on enter ---------- */
  const io = new IntersectionObserver(entries => {
    entries.forEach(en => {
      if (en.isIntersecting) { en.target.classList.add('is-in'); io.unobserve(en.target); }
    });
  }, { threshold: .2 });
  document.querySelectorAll('.reveal').forEach((el, i) => {
    el.style.transitionDelay = el.closest('.steps') ? `${(i % 3) * 90}ms` : '';
    io.observe(el);
  });

  /* ---------- Quote form: builds a WhatsApp message ---------- */
  const form = document.getElementById('quoteForm');
  form.addEventListener('submit', e => {
    e.preventDefault();
    const name = form.name.value.trim();
    const area = form.area.value.trim();
    const msg = form.msg.value.trim();
    const svcs = [...form.querySelectorAll('input[name="svc"]:checked')].map(i => i.value);
    const nameErr = document.getElementById('qNameErr');
    const svcErr = document.getElementById('qSvcErr');
    nameErr.hidden = !!name;
    form.name.setAttribute('aria-invalid', !name);
    svcErr.hidden = !!(svcs.length || msg);
    if (!name) { form.name.focus(); return; }
    if (!svcs.length && !msg) return;

    const lines = [`Hi VK Garden Assist, my name is ${name}.`];
    if (svcs.length) lines.push(`I'd like a quote for: ${svcs.join(', ')}.`);
    if (area) lines.push(`Location: ${area}.`);
    if (msg) lines.push(msg);
    window.open(`https://wa.me/27676332338?text=${encodeURIComponent(lines.join('\n'))}`, '_blank', 'noopener');
  });

  /* ---------- GSAP choreography ---------- */
  const startGsap = () => {
    const { gsap, ScrollTrigger } = window;
    if (!gsap || !ScrollTrigger) { document.querySelector('.shop').classList.add('is-static'); return; }
    gsap.registerPlugin(ScrollTrigger);

    // Nav hides when scrolling down, returns when scrolling up
    const nav = document.getElementById('nav');
    ScrollTrigger.create({
      start: 120,
      onUpdate: self => nav.classList.toggle('is-hidden', self.direction === 1 && self.scroll() > 400),
    });

    if (reduce) { document.querySelector('.shop').classList.add('is-static'); return; }

    // Hero load: one orchestrated entrance
    gsap.from('.hero-title .line > span', { yPercent: 110, duration: 1.1, ease: 'expo.out', stagger: .09, delay: .15 });
    gsap.from(['.hero-sub', '.hero-ctas'], { opacity: 0, y: 18, duration: .9, ease: 'expo.out', stagger: .1, delay: .55 });

    // Hero copy drifts up as the lawn is scrolled away
    gsap.to('.hero-copy', {
      yPercent: -18, opacity: 0, ease: 'none',
      scrollTrigger: { trigger: '.hero', start: 'top top', end: 'bottom top', scrub: true },
    });

    const mm = gsap.matchMedia();
    mm.add('(min-width: 761px)', () => {
      // Trees: pinned zoom-out reveal
      const tl = gsap.timeline({
        scrollTrigger: { trigger: '.trees-pin', start: 'top top', end: '+=90%', pin: true, scrub: 1 },
      });
      tl.fromTo('.trees-media img', { scale: 1.35 }, { scale: 1, ease: 'none' }, 0)
        .from('.trees-title', { y: 60, opacity: 0, ease: 'power2.out', duration: .5 }, .1)
        .from('.trees-copy p, .trees-points li', { y: 30, opacity: 0, stagger: .05, duration: .4 }, .35);

      // Shop: horizontal pan
      const track = document.getElementById('shopTrack');
      const distance = () => Math.max(0, track.scrollWidth - window.innerWidth);
      gsap.to(track, {
        x: () => -distance(), ease: 'none',
        scrollTrigger: {
          trigger: '.shop-pin', start: 'top top', end: () => `+=${distance()}`,
          pin: true, scrub: 1, invalidateOnRefresh: true,
        },
      });
      gsap.utils.toArray('.product').forEach((p, i) => {
        gsap.fromTo(p, { rotateY: -18, z: -60 }, {
          rotateY: 0, z: 0, ease: 'none',
          scrollTrigger: { trigger: '.shop-pin', start: `top+=${i * 120 - 300} top`, end: `+=500`, scrub: true },
        });
      });
    });
    mm.add('(max-width: 760px)', () => {
      document.querySelector('.shop').classList.add('is-static');
      return () => document.querySelector('.shop').classList.remove('is-static');
    });

    // Process: the path draws itself between steps
    const path = document.getElementById('processPath');
    if (path) {
      const len = path.getTotalLength();
      gsap.fromTo(path, { strokeDashoffset: len, strokeDasharray: `${len}` }, {
        strokeDashoffset: 0, ease: 'none',
        scrollTrigger: { trigger: '.process', start: 'top 70%', end: 'center 50%', scrub: true },
      });
    }

    // Gallery: gentle depth parallax
    gsap.utils.toArray('.g img').forEach((img, i) => {
      gsap.fromTo(img, { yPercent: -6 }, {
        yPercent: 6, ease: 'none',
        scrollTrigger: { trigger: img.parentElement, start: 'top bottom', end: 'bottom top', scrub: true },
      });
    });

    window.addEventListener('load', () => ScrollTrigger.refresh());
  };

  if (document.readyState === 'complete' || window.gsap) startGsap();
  else window.addEventListener('DOMContentLoaded', startGsap);
})();
