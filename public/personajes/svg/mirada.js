// Mirada: los ojos de cada <svg class="personaje"> siguen al puntero, máximo ±12 u del viewBox 1024
// (= ±6 u del contrato de Astra en 512). Solo escribe --look-x / --look-y; personajes.css hace el resto.
// También pausa animaciones fuera de pantalla (con la pestaña oculta el navegador ya las detiene).
(() => {
  const MAX = 12; // unidades del viewBox
  const reduce = matchMedia('(prefers-reduced-motion: reduce)');
  const fine = matchMedia('(pointer: fine)');
  const all = () => document.querySelectorAll('svg.personaje');
  let px = null, py = null, queued = false;

  function apply() {
    queued = false;
    for (const svg of all()) {
      if (px === null || reduce.matches || !fine.matches || svg.classList.contains('is-offscreen')) {
        svg.style.setProperty('--look-x', '0px');
        svg.style.setProperty('--look-y', '0px');
        continue;
      }
      const r = svg.getBoundingClientRect();
      const dx = px - (r.left + r.width / 2), dy = py - (r.top + r.height * 0.45);
      const dist = Math.hypot(dx, dy) || 1;
      const k = Math.min(1, dist / (r.width * 1.5)) * MAX / dist;
      svg.style.setProperty('--look-x', (dx * k).toFixed(1) + 'px');
      svg.style.setProperty('--look-y', (dy * k).toFixed(1) + 'px');
    }
  }
  const schedule = () => { if (!queued) { queued = true; requestAnimationFrame(apply); } };

  addEventListener('pointermove', (e) => { if (e.pointerType === 'mouse' || e.pointerType === 'pen') { px = e.clientX; py = e.clientY; schedule(); } }, { passive: true });
  document.documentElement.addEventListener('pointerleave', () => { px = py = null; schedule(); });
  reduce.addEventListener('change', schedule);

  const io = 'IntersectionObserver' in window
    ? new IntersectionObserver((entries) => entries.forEach((en) => en.target.classList.toggle('is-offscreen', !en.isIntersecting)))
    : null;
  const watch = () => { if (io) all().forEach((svg) => io.observe(svg)); };

  // Para SVG insertados después de cargar: window.mirada.watch()
  window.mirada = { watch, refresh: schedule };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', watch); else watch();
})();
