/* ======================================================
   MUNOFOOD — Entrada do hero (headline palavra a palavra + stagger)

   O reveal do headline é o @beui/text-reveal (beui.dev), portado do React
   para o GSAP que a página já carrega: a landing é um documento estático,
   sem bundler e sem React, então o componente original não entra aqui.

   O spring de lá (stiffness 140, damping 26, mass 1.2) tem razão de
   amortecimento ~1.0 — criticamente amortecido, sem repique. Por isso a
   curva EASE_OUT do próprio pacote reproduz o movimento sem plugin de
   física.

   Quando a abertura da página está armada (html[data-intro]), este arquivo
   prepara tudo e ESPERA: quem dá a partida é o intro.js, para que as
   palavras comecem enquanto o painel ainda sobe, em vez de depois dele.
   ====================================================== */
(() => {
  const EASE_OUT = 'cubic-bezier(0.16, 1, 0.3, 1)';
  const STAGGER = 0.09;
  const BLUR = 12;
  const Y_OFFSET = '40%';

  /* Se o intro.js morrer (404, erro de sintaxe), o hero não pode ficar
     invisível esperando uma partida que não vem. Casa com o failsafe de 4s
     do painel em styles.css. */
  const ESPERA_MAXIMA = 4200;

  const heroAnim = document.querySelectorAll('.hero-anim');
  const hlLines = document.querySelectorAll('.hl-line');
  const marca = document.querySelectorAll('.hero-marca');
  if (!heroAnim.length && !hlLines.length && !marca.length) return;

  const revealInstantly = () => {
    [heroAnim, hlLines, marca].forEach(lista => {
      lista.forEach(el => { el.style.opacity = '1'; el.style.transform = 'none'; });
    });
  };

  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (reduced || typeof gsap === 'undefined') { revealInstantly(); return; }

  /* Cada palavra leva junto o espaço que vem depois dela, e um corrido de
     espaços vira um grupo próprio em vez de sumir. Mesmo tokenizador do
     componente original. */
  const dividirEmPalavras = (linha) => linha.match(/\S+\s*|\s+/g) ?? [];

  const unidades = [];
  hlLines.forEach(linha => {
    const texto = linha.textContent;
    linha.textContent = '';
    dividirEmPalavras(texto).forEach(palavra => {
      const span = document.createElement('span');
      span.className = 'tr-unit';
      span.textContent = palavra;
      linha.appendChild(span);
      unidades.push(span);
    });
    linha.style.opacity = '1';
  });

  let jaRodou = false;

  /* pularMarca: a abertura acabou de entregar a wordmark em tela cheia.
     Reanimar a mesma logo dois segundos depois desfaz o efeito, então ela
     só aparece no lugar final. */
  const iniciar = ({ pularMarca = false } = {}) => {
    if (jaRodou) return;
    jaRodou = true;

    if (pularMarca) {
      marca.forEach(el => { el.style.opacity = '1'; el.style.transform = 'none'; });
    }

    const tl = gsap.timeline({ defaults: { ease: EASE_OUT } });

    /* A marca entra antes das palavras, não junto: ela é a assinatura que
       abre a dobra, e sair ao mesmo tempo que o headline faz as duas
       disputarem o olho no mesmo instante. */
    if (!pularMarca) {
      tl.fromTo(marca,
        { opacity: 0, y: -8, scale: 0.9 },
        { opacity: 1, y: 0, scale: 1, duration: 0.6 },
        0);
    }

    tl.fromTo(unidades,
      { yPercent: parseFloat(Y_OFFSET), opacity: 0, filter: `blur(${BLUR}px)` },
      { yPercent: 0, opacity: 1, filter: 'blur(0px)', duration: 0.9, stagger: STAGGER },
      pularMarca ? 0 : 0.2)
      .to('.hero-anim', { opacity: 1, y: 0, duration: 0.7, stagger: 0.12 },
        pularMarca ? 0.35 : 0.55);
  };

  window.munoHero = { iniciar };

  if (document.documentElement.hasAttribute('data-intro')) {
    setTimeout(() => iniciar({ pularMarca: true }), ESPERA_MAXIMA);
  } else {
    iniciar();
  }
})();
