/**
 * O 404 do domínio raiz.
 *
 * Até aqui `munoapp.com.br/qualquercoisa` devolvia `new NextResponse(null,
 * { status: 404 })`: corpo vazio, no domínio da marca. O status estava certo
 * e a página não existia.
 *
 * É uma string de HTML, e não um arquivo em `public/` servido por rewrite,
 * porque rewrite devolve o status do destino. Um arquivo estático responderia
 * 200 com cara de erro, que é o soft 404 que buscador pune. Devolvendo o
 * corpo daqui o status continua 404 de verdade.
 *
 * Também não é página do App Router: `src/app/(client)` pertence ao pipeline
 * de tenant, e este caminho existe justamente onde tenant nenhum existe. Ver
 * o bloco de `resolvedSlug === null` em `src/proxy.ts`.
 *
 * O efeito é o @beui/not-found-glitch (beui.dev): cada caractere embaralha
 * entre glifos e vai assentando da esquerda para a direita, e no hover duas
 * camadas fantasma se separam. As cores dos fantasmas são as da marca, as
 * mesmas do split cromático da abertura da landing, e não o vermelho e ciano
 * do original — a página é creme, e ciano sobre creme não é aberração
 * cromática, é um borrão.
 *
 * Tudo inline de propósito: é a página que aparece quando alguma outra coisa
 * já deu errado, e ela não deve depender de CDN, de bundle nem de arquivo
 * externo para renderizar.
 */
export const PAGINA_404 = `<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex">
<title>Página não encontrada — Muno</title>
<link rel="icon" href="/icon.png">
<style>
  :root {
    --terracota: #C6562A;
    --gastrogreen: #1F3F34;
    --cream: #F4F2EF;
  }
  * { box-sizing: border-box; }
  body {
    margin: 0;
    min-height: 100vh;
    min-height: 100svh;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 28px;
    padding: 24px;
    background: var(--cream);
    color: var(--gastrogreen);
    font-family: ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
    text-align: center;
  }
  .codigo {
    position: relative;
    font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
    font-weight: 700;
    font-size: clamp(5rem, 18vw, 11rem);
    line-height: 1;
    letter-spacing: -0.05em;
    font-variant-numeric: tabular-nums;
    user-select: none;
  }
  /* Os fantasmas só se separam no hover, como no original. Em toque não há
     hover, e a camada fica exatamente sob o número, invisível. */
  .fantasma {
    position: absolute;
    inset: 0;
    opacity: 0;
    pointer-events: none;
    transition: transform 0.15s ease-out, opacity 0.15s ease-out;
  }
  .fantasma--terracota { color: var(--terracota); }
  .fantasma--verde { color: var(--gastrogreen); }
  .codigo:hover .fantasma { opacity: 0.55; }
  .codigo:hover .fantasma--terracota { transform: translateX(3px); }
  .codigo:hover .fantasma--verde { transform: translateX(-3px); }
  h1 { position: relative; margin: 0; font: inherit; }
  .titulo { margin: 0; font-size: 1.125rem; font-weight: 700; }
  .texto { margin: 0; max-width: 24rem; font-size: 0.9rem; color: #5b6b63; line-height: 1.6; }
  .voltar {
    display: inline-block;
    padding: 14px 28px;
    border-radius: 12px;
    background: var(--terracota);
    color: #fff;
    font-weight: 700;
    text-decoration: none;
    box-shadow: 0 4px 16px rgba(198, 86, 42, 0.35);
    transition: background-color 0.3s ease, transform 0.2s ease;
  }
  .voltar:hover { background: var(--gastrogreen); transform: translateY(-2px); }
  @media (prefers-reduced-motion: reduce) {
    .fantasma { display: none; }
    .voltar { transition: none; }
  }
</style>
</head>
<body>
  <div class="codigo">
    <span class="fantasma fantasma--terracota" aria-hidden="true" data-embaralha>404</span>
    <span class="fantasma fantasma--verde" aria-hidden="true" data-embaralha>404</span>
    <h1><span data-embaralha>404</span></h1>
  </div>
  <div>
    <p class="titulo">Esta página não existe</p>
    <p class="texto">O endereço que você abriu não corresponde a nada aqui. Pode ter sido um link antigo, ou um erro de digitação.</p>
  </div>
  <a class="voltar" href="/">Voltar para a Muno</a>
<script>
(function () {
  var GLIFOS = "ABCDEFGHJKLMNPQRSTUVWXYZ0123456789#%&@$?/\\\\";
  var DURACAO = 700;
  var PASSO = 45;

  if (matchMedia("(prefers-reduced-motion: reduce)").matches) return;

  var alvos = [].slice.call(document.querySelectorAll("[data-embaralha]"));
  if (!alvos.length) return;

  var textos = alvos.map(function (el) { return el.textContent; });
  var inicio = performance.now();
  var ultimo = 0;

  /* O texto real já está no HTML e só depois embaralha: se o script não
     rodar, ou rodar tarde, a pessoa lê 404 do mesmo jeito. */
  function passo(agora) {
    if (agora - ultimo >= PASSO) {
      ultimo = agora;
      var progresso = Math.min((agora - inicio) / DURACAO, 1);
      alvos.forEach(function (el, i) {
        var chars = textos[i].split("");
        var assentados = Math.floor(progresso * chars.length);
        el.textContent = chars.map(function (ch, j) {
          return j < assentados || ch === " "
            ? ch
            : GLIFOS[Math.floor(Math.random() * GLIFOS.length)];
        }).join("");
      });
    }
    if (agora - inicio < DURACAO) {
      requestAnimationFrame(passo);
    } else {
      alvos.forEach(function (el, i) { el.textContent = textos[i]; });
    }
  }
  requestAnimationFrame(passo);
})();
</script>
</body>
</html>`;
