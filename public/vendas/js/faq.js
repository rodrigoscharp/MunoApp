/* ======================================================
   MUNOFOOD — FAQ com mola

   Porte do @beui/bouncy-accordion (beui.dev) para o GSAP da página. De lá
   vieram a altura em mola, o um-aberto-por-vez e o giro do ícone junto; a
   fusão dos cantos ficou de fora (o porquê está no bloco FAQ do styles.css).

   A marcação continua <details>/<summary>. O componente do BE UI recria
   teclado, aria-expanded e aria-controls porque em React não existe o
   elemento; aqui ele existe, e trocá-lo por <div> seria jogar fora
   acessibilidade que o navegador dá pronta. Enter e Espaço no <summary>
   disparam click, então interceptar o click cobre o teclado também.
   ====================================================== */
(() => {
  const itens = [...document.querySelectorAll('.faq-item')];
  if (!itens.length) return;

  /* Sem GSAP ou com movimento reduzido, não intercepta nada: o <details>
     nativo abre e fecha na hora, que é exatamente o comportamento pedido
     nos dois casos. */
  const reduzido = matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (reduzido || typeof gsap === 'undefined') return;

  /* O original abre com bounce 0.32 e fecha com 0.26. O GSAP não tem mola,
     e o back.out faz o passar-do-ponto na abertura: a altura vai além do
     texto, o excesso fica escondido pelo overflow do clipe, e volta.

     Na saída o back NÃO serve: passar do ponto abaixo de zero pede altura
     negativa, que não existe. O navegador prende em 0 e o movimento morre
     seco no fim, que é pior do que não ter mola nenhuma. Por isso o
     fechamento usa power2.inOut, e essa é a única parte que não reproduz o
     componente. */
  const ABRE = { duracao: 0.58, ease: 'back.out(1.4)' };
  const FECHA = { duracao: 0.46, ease: 'power2.inOut' };
  const TEXTO = 0.18;

  const clipeDe = (item) => item.querySelector('.faq-clip');
  const respostaDe = (item) => item.querySelector('.faq-answer');

  const abrir = (item) => {
    const clipe = clipeDe(item);
    const resposta = respostaDe(item);

    /* A altura de partida precisa ser lida ANTES de ligar o atributo. Com
       [open] no ar a regra .faq-item:not([open]) do CSS sai de cena, o
       clipe volta para auto, e a leitura já devolveria a altura final: a
       animação sairia de onde deveria chegar.

       O alvo é lido depois por precaução, não por necessidade medida. O
       Chrome 152 ainda faz layout do conteúdo de um <details> fechado (a
       resposta mede seus 66px com o clipe em zero), mas os motores divergem
       nisso e a ordem correta não custa nada. */
    const inicio = clipe.offsetHeight;
    item.open = true;
    const alvo = resposta.offsetHeight;

    gsap.killTweensOf([clipe, resposta]);
    gsap.fromTo(clipe,
      { height: inicio },
      {
        height: alvo,
        duration: ABRE.duracao,
        ease: ABRE.ease,
        /* Solta a altura no fim: presa no pixel medido, a resposta ficaria
           cortada quando o texto refluísse numa troca de orientação. */
        onComplete: () => gsap.set(clipe, { height: 'auto' }),
      });
    gsap.to(resposta, { opacity: 1, duration: TEXTO, ease: 'power2.out' });
  };

  const fechar = (item) => {
    const clipe = clipeDe(item);
    const resposta = respostaDe(item);

    gsap.killTweensOf([clipe, resposta]);
    gsap.fromTo(clipe,
      { height: clipe.offsetHeight },
      {
        height: 0,
        duration: FECHA.duracao,
        ease: FECHA.ease,
        onComplete: () => {
          /* O atributo sai só agora. Tirá-lo antes entregaria a altura para
             a regra .faq-item:not([open]) do CSS no meio do caminho, e o
             painel sumiria de uma vez. Limpar o estilo inline devolve o
             controle a essa mesma regra depois que o movimento acabou. */
          item.open = false;
          gsap.set(clipe, { clearProps: 'height' });
        },
      });
    gsap.to(resposta, { opacity: 0, duration: TEXTO, ease: 'power2.out' });
  };

  itens.forEach(item => {
    const gatilho = item.querySelector('summary');
    if (!gatilho) return;

    gatilho.addEventListener('click', (e) => {
      /* O <details> alternaria o atributo sozinho, sem animação nenhuma.
         Quem decide a partir daqui é este arquivo. */
      e.preventDefault();

      if (item.open) { fechar(item); return; }

      /* Um por vez, como no componente. */
      itens.forEach(outro => { if (outro !== item && outro.open) fechar(outro); });
      abrir(item);
    });
  });
})();
