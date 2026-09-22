/* ======================================================
   MUNOFOOD — Abertura da página

   Porte da composição MunoIntro (~/Dev/MunoVideo/src/Intro.tsx, Remotion,
   1080x1080 @30fps) para o GSAP que a landing já carrega. O painel cobre a
   tela, o ícone atravessa a câmera, a wordmark assenta, e o painel sobe
   revelando a página — a saída é a mesma do loader de rodrigoscharp.vercel.app.

   Os tempos abaixo são os frames do original multiplicados por 0.75: dois
   segundos de vídeo viram 1.5s de abertura. A tabela de conversão está em
   cada linha para que uma mudança no Intro.tsx seja rastreável até aqui.
   ====================================================== */
(() => {
  const raiz = document.documentElement;
  const painel = document.querySelector('.intro');
  if (!painel || !raiz.hasAttribute('data-intro')) return;

  const EASE_OUT = 'cubic-bezier(0.16, 1, 0.3, 1)';   // desaceleração
  const EASE_IN = 'cubic-bezier(0.55, 0.06, 0.68, 0.19)'; // punch acelerando
  const EASE_PAINEL = 'cubic-bezier(0.65, 0.05, 0, 1)';

  const FIM = 1.5;          // frame 60 do original
  const SAIDA = 0.6;        // o painel subindo
  const ANTECIPA_HERO = 0.25; // o hero começa antes de o painel terminar

  /* O resgate armado no <head> derruba o painel se este arquivo nunca
     rodar. A partir daqui a abertura é nossa, e o timer sai de cena. */
  const desarmarResgate = () => clearTimeout(window.__munoIntroResgate);

  const encerrar = (pularMarca) => {
    desarmarResgate();
    if (window.munoHero) window.munoHero.iniciar({ pularMarca });

    /* A travadinha morava aqui. Isto rodava na mesma rAF em que o GSAP
       também atualiza o hero — que a essa altura (ANTECIPA_HERO) já está
       0.25s dentro da rajada de blur nas oito palavras. Tirar o
       data-intro vira o .intro inteiro de display: flex para none, um
       recálculo de estilo grande num elemento fixed cobrindo a tela,
       empilhado sobre a interpolação de filter das palavras no mesmo
       frame. O resultado era um frame mais longo que 16ms, sentido como
       hiccup bem no instante em que o headline aparece — o timing que não
       "casava".

       Adiar para o PRÓXIMO frame separa os dois custos em vez de somá-los.
       O painel já está fora da tela (yPercent: -100) e sem pointer-events,
       então um frame de atraso na remoção real não aparece — só o custo
       dela sai do caminho do hero. */
    requestAnimationFrame(() => {
      raiz.removeAttribute('data-intro');
      painel.remove();
    });
  };

  if (typeof gsap === 'undefined') { encerrar(false); return; }

  try { sessionStorage.setItem('muno_intro_visto', '1'); } catch (e) { /* modo privado */ }

  const icone = painel.querySelector('.intro__icone--real');
  const fantasmas = painel.querySelectorAll('.intro__icone--fantasma');
  const marca = painel.querySelector('.intro__marca');
  const glow = painel.querySelector('.intro__glow');
  const flash = painel.querySelector('.intro__flash');

  /* O deslocamento cromático é 7px sobre uma wordmark de 620 no original.
     Aqui a wordmark é fluida, então o valor acompanha a largura. */
  const larguraMarca = marca.getBoundingClientRect().width || 280;
  const CROMA = larguraMarca * (7 / 620);

  const tl = gsap.timeline({
    onComplete: () => encerrar(true),
  });

  // --- Ícone: para, recua, e acelera atravessando a lente ---------------
  tl.set(painel, { '--intro-escala': 1 })
    // frames 8–14: antecipação, um recuo curto antes do lançamento
    .to(painel, { '--intro-escala': 0.9, duration: 0.15, ease: EASE_OUT }, 0.20)
    // frames 14–40: punch. 0.9 x 3.1, a mesma razão do original
    .to(painel, { '--intro-escala': 2.79, duration: 0.65, ease: EASE_IN }, 0.35)
    .to(painel, { '--intro-blur': '7px', duration: 0.65, ease: EASE_IN }, 0.35)
    .to(painel, { '--intro-blur-fantasma': '12px', duration: 0.65, ease: EASE_IN }, 0.35)
    // frames 32–40: o ícone some no meio do movimento, não no fim
    .to(icone, { opacity: 0, duration: 0.2, ease: 'none' }, 0.80)

    // --- Split cromático, visível só no pico da velocidade -------------
    // frames 20–29–36
    .to(painel, { '--intro-croma': CROMA + 'px', duration: 0.225, ease: 'none' }, 0.50)
    .to(fantasmas, { opacity: 0.45, duration: 0.225, ease: 'none' }, 0.50)
    .to(painel, { '--intro-croma': '0px', duration: 0.175, ease: 'none' }, 0.725)
    .to(fantasmas, { opacity: 0, duration: 0.175, ease: 'none' }, 0.725)

    // --- O estouro do instante em que ele passa ------------------------
    // frames 26–29–36
    .to(flash, { opacity: 0.4, duration: 0.075, ease: 'none' }, 0.65)
    .to(flash, { opacity: 0, duration: 0.175, ease: 'none' }, 0.725)

    // --- Wordmark: entra grande e assenta com undershoot ---------------
    // frames 24–44 na opacidade, 24–49–60 na escala
    .fromTo(marca,
      { opacity: 0, scale: 1.4 },
      { opacity: 1, duration: 0.5, ease: EASE_OUT }, 0.60)
    .to(marca, { scale: 0.96, duration: 0.63, ease: EASE_OUT }, 0.60)
    .to(marca, { scale: 1, duration: 0.27, ease: EASE_OUT }, 1.23)

    // --- Glow ambiente acompanhando o assentamento ---------------------
    .to(glow, { opacity: 0.35, duration: 0.63, ease: EASE_OUT }, 0.87)

    // --- O painel sobe, e o hero já está animando atrás ----------------
    .to(painel, { yPercent: -100, duration: SAIDA, ease: EASE_PAINEL }, FIM)
    .call(() => {
      if (window.munoHero) window.munoHero.iniciar({ pularMarca: true });
    }, null, FIM + SAIDA - ANTECIPA_HERO);

  /* Por último, e só aqui: a timeline existe e está rodando. Um erro em
     qualquer linha acima deixa o resgate de pé, que é o ponto dele. */
  desarmarResgate();
})();
