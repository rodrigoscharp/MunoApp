/*
 * Service worker da Muno.
 *
 * Ele existe por dois motivos, nesta ordem: é o que habilita o convite de
 * instalação no Android (sem um service worker registrado o Chrome não dispara
 * beforeinstallprompt), e é o que dá uma tela decente para quem perdeu a rede.
 * Ele NÃO existe para deixar o app rápido, e essa distinção é o que decide
 * tudo abaixo.
 *
 * ---------------------------------------------------------------------------
 * O que ele deliberadamente NÃO cacheia
 *
 * 1. Nada sob /api/. Este app é multi-tenant e tem sessão: uma resposta de
 *    /api/orders no cache é o pedido de uma conta aparecendo para a próxima
 *    pessoa que usar o mesmo aparelho.
 *
 * 2. Nenhum HTML de navegação. O HTML aqui carrega estado de sessão e pedido
 *    ao vivo. Um /adm/orders servido do cache é o painel do restaurante
 *    mostrando pedido velho enquanto a cozinha acha que está vendo a fila de
 *    agora, e isso é pior que a tela de offline. A navegação é network-first e
 *    a resposta segue direto para a página, sem cópia.
 *
 * Sobra o que é imutável e público: o bundle hasheado do Next e os ícones.
 * Esses são cache-first porque o nome do arquivo muda quando o conteúdo muda.
 *
 * ---------------------------------------------------------------------------
 * Escopo
 *
 * Servido de /sw.js, então o escopo é a origem inteira. Cada subdomínio de
 * restaurante é uma origem diferente e ganha o seu, isolado dos outros pelo
 * próprio navegador. Nada aqui precisa saber de tenant.
 *
 * Trocar CACHE de versão descarta tudo o que ficou para trás no activate.
 */

const CACHE = "muno-v1";
const OFFLINE = "/offline.html";

// Só o indispensável para a tela de offline aparecer sem rede. Uma lista maior
// atrasa a primeira instalação do worker, e o install falha inteiro se um só
// dos arquivos não responder.
const PRECACHE = [OFFLINE, "/icons/icone-192.png"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE)
      .then((cache) => cache.addAll(PRECACHE))
      // skipWaiting depois do precache, não antes: assumir o controle sem a
      // página de offline em mãos deixaria a primeira queda de rede sem
      // fallback nenhum.
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((chaves) =>
        Promise.all(
          chaves.filter((c) => c !== CACHE).map((c) => caches.delete(c))
        )
      )
      .then(() => self.clients.claim())
  );
});

// Imutável: o Next põe hash no nome do arquivo, e os ícones são gerados por
// scripts/gerar-icones-pwa.ts junto do deploy.
function ehImutavel(url) {
  return (
    url.pathname.startsWith("/_next/static/") ||
    url.pathname.startsWith("/icons/")
  );
}

self.addEventListener("fetch", (event) => {
  const req = event.request;

  // POST, PUT e afins nunca passam por cache: criar pedido, pagar e entrar são
  // todos não-GET, e a Cache API nem aceita guardá-los.
  if (req.method !== "GET") return;

  const url = new URL(req.url);

  // Outra origem (Vercel Blob, gateway de pagamento, tiles do mapa): deixa o
  // navegador resolver. Não temos como saber o que é seguro guardar de lá.
  if (url.origin !== self.location.origin) return;

  // Ver o cabeçalho: API fica inteiramente fora.
  if (url.pathname.startsWith("/api/")) return;

  if (ehImutavel(url)) {
    event.respondWith(
      caches.match(req).then(
        (guardado) =>
          guardado ||
          fetch(req).then((res) => {
            // `res.ok` filtra 404 e 500: guardar um erro sob um nome hasheado
            // o congela para sempre, já que o nome nunca mais muda.
            if (res.ok) {
              const copia = res.clone();
              caches.open(CACHE).then((cache) => cache.put(req, copia));
            }
            return res;
          })
      )
    );
    return;
  }

  // Navegação: rede sempre, cache nunca, tela de offline quando a rede falha.
  if (req.mode === "navigate") {
    event.respondWith(
      fetch(req).catch(() =>
        caches.match(OFFLINE).then(
          (offline) =>
            offline ||
            new Response("Sem conexão", {
              status: 503,
              headers: { "content-type": "text/plain; charset=utf-8" },
            })
        )
      )
    );
    return;
  }

  // Todo o resto (imagem de produto, logo do restaurante, fonte) segue para a
  // rede sem interferência.
});
