/* ======================================================
   MUNOFOOD — Entrada do hero (headline mascarado + stagger)
   ====================================================== */
(() => {
  const heroAnim = document.querySelectorAll('.hero-anim');
  const hlLines = document.querySelectorAll('.hl-line');
  if (!heroAnim.length && !hlLines.length) return;

  const revealInstantly = () => {
    heroAnim.forEach(el => { el.style.opacity = '1'; el.style.transform = 'none'; });
    hlLines.forEach(el => { el.style.opacity = '1'; el.style.transform = 'none'; });
  };

  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (reduced || typeof gsap === 'undefined') { revealInstantly(); return; }

  gsap.timeline({ defaults: { ease: 'power3.out' } })
    .fromTo(hlLines,
      { y: (i, el) => el.offsetHeight * 1.1, opacity: 0 },
      { y: 0, opacity: 1, duration: 0.9, stagger: 0.12 }, 0)
    .to('.hero-anim', { opacity: 1, y: 0, duration: 0.7, stagger: 0.12 }, 0.35);
})();
