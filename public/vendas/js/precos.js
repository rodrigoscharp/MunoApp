/* ======================================================
   MUNOFOOD — Preços contando na entrada

   Porte do @beui/animated-number (beui.dev): conta de zero até o valor
   quando a seção entra na tela, e, quando o valor muda, conta do anterior
   para o novo em vez de saltar.

   O número NÃO é injetado por JS. Ele vive no HTML, em data-mensal e
   data-anual, e src/lib/plans.test.ts lê o arquivo para conferir que os
   valores da tabela PRECOS aparecem na página. Este arquivo só pinta por
   cima do que já está lá: se ele não carregar, o preço continua correto.
   ====================================================== */
(() => {
  const precos = [...document.querySelectorAll('.preco')];
  if (!precos.length) return;

  const DURACAO = 1.2;
  const EASE_OUT = 'cubic-bezier(0.16, 1, 0.3, 1)';

  const reduzido = matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (reduzido || typeof gsap === 'undefined') return;

  const formatador = new Intl.NumberFormat('pt-BR', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

  /* "R$ 1.319,89" → 1319.89. O ponto é separador de milhar e a vírgula é
     decimal: trocar os dois de lugar antes de Number() é o que evita
     1.319,89 virar 1.319. */
  const paraNumero = (texto) => {
    const limpo = texto.replace(/[^\d.,]/g, '').replace(/\./g, '').replace(',', '.');
    const n = Number(limpo);
    return Number.isFinite(n) ? n : null;
  };

  const estado = new Map();
  /* O texto exato que este arquivo escreveu por último, por elemento. É
     assim que o observador lá embaixo distingue a própria escrita da
     escrita do main.js.

     A primeira tentativa foi uma marca ligada antes e desligada depois de
     escrever. Não funciona, e o modo de falha é silencioso: MutationObserver
     entrega em microtask, quando a marca já saiu, então toda escrita da
     contagem voltava como se fosse externa e abria uma segunda contagem por
     cima. Medido: duas séries convergindo, uma subindo de 311,64 e outra
     descendo de 1.319,89, ambas mirando o meio do caminho. */
  const ultimoEscrito = new Map();

  const escrever = (el, valor) => {
    const texto = 'R$ ' + formatador.format(valor);
    ultimoEscrito.set(el, texto);
    el.textContent = texto;
  };

  const contar = (el, de, para) => {
    const caixa = { v: de };
    gsap.killTweensOf(caixa);
    estado.set(el, para);

    /* Pinta o ponto de partida agora, e não no primeiro quadro da tween.
       O main.js escreve o valor final de uma vez, e a correção vem por
       MutationObserver, que roda em microtask: escrevendo aqui, ainda antes
       da pintura, o valor final não chega a aparecer. Deixando para a tween,
       ele pisca por um quadro. */
    escrever(el, de);
    gsap.to(caixa, {
      v: para,
      duration: DURACAO,
      ease: EASE_OUT,
      onUpdate: () => escrever(el, caixa.v),
      onComplete: () => escrever(el, para),
    });
  };

  const observador = new IntersectionObserver((entradas) => {
    entradas.forEach((e) => {
      if (!e.isIntersecting) return;
      observador.unobserve(e.target);
      const alvo = paraNumero(e.target.textContent);
      if (alvo === null) return;
      contar(e.target, 0, alvo);
    });
  }, { threshold: 0.6 });

  precos.forEach((el) => {
    const inicial = paraNumero(el.textContent);
    if (inicial === null) return;
    estado.set(el, inicial);
    observador.observe(el);
  });

  /* O toggle mensal/anual do main.js escreve direto no textContent, e não
     dispara evento nenhum. Em vez de mexer lá e acoplar os dois arquivos,
     este observador escuta a escrita e transforma o salto em contagem, a
     partir do valor que já estava na tela. */
  precos.forEach((el) => {
    new MutationObserver(() => {
      /* Comparação por valor, não por marca temporal: quando o callback
         roda, o textContent já é o estado final do lote. Se for igual ao
         que escrevemos, o lote é nosso e não há nada a fazer. */
      if (el.textContent === ultimoEscrito.get(el)) return;
      const novo = paraNumero(el.textContent);
      const atual = estado.get(el);
      if (novo === null || novo === atual) return;
      contar(el, atual ?? 0, novo);
    }).observe(el, { childList: true, characterData: true, subtree: true });
  });
})();
