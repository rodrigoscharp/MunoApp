/* ======================================================
   MUNOFOOD — Cartões de plano com inclinação

   Porte do @beui/tilt-card (beui.dev): perspectiva de 1000px, rotação de
   até 12 graus seguindo o cursor, e um brilho radial acompanhando o ponto.

   O componente original desliga sozinho em toque e em movimento reduzido,
   pela mesma razão que vale aqui: em celular o "hover" é fantasma, dispara
   no toque e fica preso até o próximo. Como o público da Muno é celular,
   este arquivo não faz nada na maioria das visitas, e isso é o desenho,
   não uma limitação.
   ====================================================== */
(() => {
  const cartoes = [...document.querySelectorAll('[data-tilt]')];
  if (!cartoes.length) return;

  const MAX = 12;

  const reduzido = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const temHover = matchMedia('(hover: hover)').matches;
  if (reduzido || !temHover || typeof gsap === 'undefined') return;

  cartoes.forEach((cartao) => {
    /* O brilho é um irmão sobreposto, não um background do cartão: o
       cartão já tem fundo próprio e sombra, e trocar o background apagaria
       os dois. */
    const brilho = document.createElement('div');
    brilho.className = 'tilt-brilho';
    brilho.setAttribute('aria-hidden', 'true');
    cartao.appendChild(brilho);

    /* quickTo dá a mola do cursor sem criar uma tween nova a cada
       mousemove, que é o que trava a rolagem em cartão grande.

       São rotationX e rotationY, não rotateX e rotateY. O GSAP nomeia as
       rotações 3D com "rotation"; passando "rotate" ele trata como
       propriedade CSS avulsa, escreve algo que o navegador ignora, e a
       falha é muda: nenhum erro, nenhuma rotação, medido em zero graus
       depois de avançar a timeline na mão. */
    const girarX = gsap.quickTo(cartao, 'rotationX', { duration: 0.35, ease: 'power3.out' });
    const girarY = gsap.quickTo(cartao, 'rotationY', { duration: 0.35, ease: 'power3.out' });

    /* A perspectiva NÃO é aplicada aqui por gsap.set. Fazer isso no load
       congela no cache do GSAP o transform que o cartão tem naquele
       instante, que é o translateY(28px) do .reveal ainda invisível — e o
       cartão fica preso 28px abaixo do lugar para sempre, porque o inline
       ganha do transform: none que .reveal.visible aplica depois.

       Por isso a perspectiva mora no CSS, no contêiner da grade, e o GSAP
       só encosta no elemento no primeiro mousemove, quando o .reveal já
       terminou e a base está limpa. */

    /* O GSAP herda como base o transform que o elemento tiver no primeiro
       toque. Se o cursor chegar antes de o .reveal terminar, ele herda o
       translateY(28px) e o cartão fica 28px abaixo do lugar para sempre.
       Zerar o y explicitamente na primeira vez torna a base declarada em
       vez de herdada, e o destino é o mesmo que .reveal.visible pede. */
    let preparado = false;

    cartao.addEventListener('mousemove', (e) => {
      if (!preparado) { gsap.set(cartao, { y: 0 }); preparado = true; }
      const r = cartao.getBoundingClientRect();
      const px = (e.clientX - r.left) / r.width;
      const py = (e.clientY - r.top) / r.height;
      girarY((px - 0.5) * MAX);
      girarX((0.5 - py) * MAX);
      brilho.style.setProperty('--bx', (px * 100) + '%');
      brilho.style.setProperty('--by', (py * 100) + '%');
      brilho.style.opacity = '0.15';
    });

    cartao.addEventListener('mouseleave', () => {
      girarX(0);
      girarY(0);
      brilho.style.opacity = '0';
    });
  });
})();
