/* ======================================================
   MUNOFOOD — Varredura cromática no título dos benefícios

   Porte do @beui/chromatic-text-reveal (beui.dev). A definição do efeito
   é o gradiente: transparente à frente da varredura, cor da marca atrás
   dela, e a faixa colorida exatamente no ponto da passagem. O texto é
   pintado por background-clip, e o que anima é uma variável de posição.

   A paleta é a da Muno. O porquê está no bloco correspondente do
   styles.css, junto da regra de por que as palavras do ciclo são estas.
   ====================================================== */
(() => {
  const alvo = document.querySelector('.cromatico');
  if (!alvo) return;

  const reduzido = matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (reduzido || typeof gsap === 'undefined') return;

  const ativa = alvo.querySelector('.cromatico__ativa');
  const palavras = (alvo.dataset.palavras || '').split('|').filter(Boolean);
  if (!ativa || palavras.length < 2) return;

  const META = 14;            // meia largura da faixa, em % da palavra
  const DURACAO = 1.2;
  const PAUSA = 0.8;
  const FRENTE = 'var(--terracota)';
  const PALETA = ['#C6562A', '#D9783F', '#9BB39D', '#4A7C63', '#1F3F34'];

  /* Cada cor ganha uma parada deslocada da varredura, espalhadas dentro da
     faixa. É o mesmo cálculo do componente. */
  const paradas = PALETA.map((cor, i) => {
    const desvio = -META + (i / (PALETA.length - 1)) * META * 2;
    const sinal = desvio < 0 ? '-' : '+';
    return `${cor} calc(var(--cromatico-varredura) ${sinal} ${Math.abs(desvio).toFixed(2)}%)`;
  });

  ativa.style.backgroundImage =
    `linear-gradient(90deg, ${FRENTE} 0%, ${FRENTE} calc(var(--cromatico-varredura) - ${META}%), ` +
    `${paradas.join(', ')}, transparent calc(var(--cromatico-varredura) + ${META}%), transparent 100%)`;

  alvo.classList.add('cromatico--ativo');

  let indice = 0;
  const varrer = () => {
    ativa.textContent = palavras[indice];
    gsap.fromTo(alvo,
      { '--cromatico-varredura': `${-META}%` },
      {
        '--cromatico-varredura': `${100 + META}%`,
        duration: DURACAO,
        ease: 'power2.inOut',
        onComplete: () => {
          indice = (indice + 1) % palavras.length;
          gsap.delayedCall(PAUSA, varrer);
        },
      });
  };

  /* Começa quando o título entra na tela, e não no load: a seção fica
     abaixo da dobra, e varrer para ninguém gastaria a primeira volta. */
  new IntersectionObserver((entradas, obs) => {
    entradas.forEach(e => {
      if (!e.isIntersecting) return;
      obs.disconnect();
      varrer();
    });
  }, { threshold: 0.4 }).observe(alvo);
})();
