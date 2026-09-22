/* ======================================================
   MUNOFOOD — Entrada da nota de garantia

   O gesto é o do objeto: o papel cai na mesa e o carimbo desce em cima
   dele. Por isso a nota entra um pouco maior e mais torta e assenta na
   inclinação de repouso, e o carimbo vem depois, grande demais, batendo e
   voltando.

   Antes a nota usava a classe .reveal do main.js, que é a mesma subida
   discreta de todo o resto da página, e o carimbo usava outra com atraso.
   Dois fades aninhados no mesmo objeto embolam, e "carimbo que aparece
   junto com o papel" não é carimbo, é decoração impressa.
   ====================================================== */
(() => {
  const nota = document.querySelector('.receipt');
  const carimbo = document.querySelector('.receipt-stamp');
  if (!nota) return;

  /* Ângulos e opacidade de repouso, os mesmos do styles.css. Estão aqui
     porque a animação precisa terminar exatamente neles: parar em zero
     endireitaria o papel e tiraria justamente o que o faz parecer papel. */
  const NOTA_REPOUSO = -1.1;
  const CARIMBO_REPOUSO = -14;
  const CARIMBO_OPACIDADE = 0.88;

  const reduzido = matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (reduzido || typeof gsap === 'undefined') return;

  /* Só agora o CSS esconde a nota. Se este arquivo não carregar, a classe
     nunca entra e a nota aparece como sempre apareceu. */
  document.documentElement.classList.add('recibo-armado');

  const entrar = () => {
    const tl = gsap.timeline();

    tl.fromTo(nota,
      { opacity: 0, y: 26, rotation: -6, scale: 0.94 },
      { opacity: 1, y: 0, rotation: NOTA_REPOUSO, scale: 1, duration: 0.7, ease: 'power3.out' },
      0);

    if (carimbo) {
      /* back.out é o repique da borracha batendo no papel. O carimbo sai de
         uma escala bem maior para ler como algo que desce em direção à
         mesa, e não como algo que só cresce. */
      tl.fromTo(carimbo,
        { opacity: 0, scale: 1.8, rotation: CARIMBO_REPOUSO - 10 },
        { opacity: CARIMBO_OPACIDADE, scale: 1, rotation: CARIMBO_REPOUSO,
          duration: 0.45, ease: 'back.out(2.4)' },
        0.38);
    }
  };

  new IntersectionObserver((entradas, obs) => {
    entradas.forEach(e => {
      if (!e.isIntersecting) return;
      obs.disconnect();
      entrar();
    });
  }, { threshold: 0.3 }).observe(nota);
})();
