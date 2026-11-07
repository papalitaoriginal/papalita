/* Presentation only. Never changes an order, payment, price or availability. */
(() => {
  'use strict';
  const media = matchMedia('(prefers-reduced-motion: reduce)');
  let paused = false;
  try { paused = localStorage.getItem('papalita.motion.paused') === 'true'; } catch {}
  let carousel = null, revealObserver = null;
  const stopped = () => paused || media.matches || document.hidden;
  function apply() {
    document.documentElement.dataset.motion = stopped() ? 'paused' : 'running';
    document.querySelectorAll('[data-motion-toggle]').forEach(b => {
      b.textContent = media.matches ? 'Reduced motion on' : paused ? 'Play animations' : 'Pause animations';
      b.setAttribute('aria-pressed', String(paused || media.matches));
      b.disabled = media.matches;
    });
    if (carousel) carousel.toggle();
  }
  function refresh(root = document) {
    carousel?.destroy(); carousel = null;
    revealObserver?.disconnect();
    const nodes = root.querySelectorAll('[data-reveal]');
    if ('IntersectionObserver' in window && !stopped()) {
      revealObserver = new IntersectionObserver(entries => entries.forEach(e => {
        if (e.isIntersecting) { e.target.classList.add('pp-entered'); revealObserver.unobserve(e.target); }
      }), {threshold: .04, rootMargin: '0px 0px 30px'});
      nodes.forEach((el, i) => {
        el.style.setProperty('--enter-delay', Math.min(i % 4, 3) * 45 + 'ms');
        el.classList.add('pp-reveal-ready'); revealObserver.observe(el);
      });
    }
    const host = root.querySelector('[data-food-slideshow]');
    if (host) {
      const slides = [...host.querySelectorAll('[data-food-slide]')];
      const dots = [...host.querySelectorAll('[data-slide-index]')];
      let current = 0, timer = null, held = false;
      const show = index => {
        current = (index + slides.length) % slides.length;
        slides.forEach((el, i) => { el.classList.toggle('pp-slide-active', i === current); el.inert = i !== current; el.setAttribute('aria-hidden', String(i !== current)); });
        dots.forEach((b, i) => b.setAttribute('aria-pressed', String(i === current)));
      };
      const toggle = () => { clearInterval(timer); timer = null; if (slides.length > 1 && !stopped() && !held) timer = setInterval(() => show(current + 1), 5500); };
      dots.forEach(b => b.onclick = () => { show(Number(b.dataset.slideIndex)); toggle(); });
      const hold = () => { held = true; toggle(); };
      const release = () => { held = host.matches(':hover') || host.contains(document.activeElement); toggle(); };
      host.onmouseenter = hold; host.onmouseleave = release; host.onfocusin = hold;
      host.onfocusout = () => setTimeout(release, 0);
      show(0); carousel = {toggle, destroy: () => clearInterval(timer)};
    }
    root.querySelectorAll('[data-motion-toggle]').forEach(b => b.onclick = () => {
      paused = !paused; try { localStorage.setItem('papalita.motion.paused', String(paused)); } catch {} apply();
    });
    apply();
  }
  media.addEventListener('change', () => { if (media.matches) document.querySelectorAll('.pp-reveal-ready').forEach(n => n.classList.add('pp-entered')); apply(); });
  document.addEventListener('visibilitychange', apply);
  window.PapalitaMotion = {refresh, stopped};
  apply();
})();
