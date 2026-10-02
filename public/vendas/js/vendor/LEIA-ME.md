Bibliotecas de terceiros da landing, servidas daqui para a página não executar
script de CDN no mesmo domínio do /assinar.

| Arquivo | Origem | Versão |
|---|---|---|
| `tailwind-play-cdn.js` | https://cdn.tailwindcss.com | Play CDN (a versão que o CDN servia em 02/10/2026) |
| `lucide-1.50.0.min.js` | https://unpkg.com/lucide@1.50.0/dist/umd/lucide.min.js | 1.50.0 (o que `lucide@latest` resolvia) |
| `gsap-3.13.0.min.js` | https://cdn.jsdelivr.net/npm/gsap@3.13.0/dist/gsap.min.js | 3.13.0 |

Para atualizar, baixe a nova versão, troque o arquivo e o `<script src>` em
`public/vendas/index.html`, e abra a página para conferir.
