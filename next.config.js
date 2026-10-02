// Só o projeto Supabase do app e só o bucket de imagens do cardápio. Com
// "**.supabase.co", o /_next/image servia de otimizador gratuito, na cota da
// Muno, para qualquer projeto Supabase do mundo. Sem a variável (desenvolvimento
// sem .env) cai no curinga antigo para a imagem não quebrar.
function remotePatternsDasImagens() {
  try {
    const { hostname } = new URL(process.env.NEXT_PUBLIC_SUPABASE_URL ?? "");
    if (hostname) {
      return [
        {
          protocol: "https",
          hostname,
          pathname: "/storage/v1/object/public/product-images/**",
        },
      ];
    }
  } catch {
    // cai no curinga
  }
  return [
    { protocol: "https", hostname: "**.supabase.co" },
    { protocol: "https", hostname: "**.supabase.com" },
  ];
}

/** @type {import('next').NextConfig} */
const nextConfig = {
  // Não anuncia o framework e a versão em todo response. Não é defesa, mas é
  // informação que só serve para quem está procurando um alvo com a versão
  // certa.
  poweredByHeader: false,
  images: {
    remotePatterns: remotePatternsDasImagens(),
  },
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          // HSTS com includeSubDomains porque cada restaurante é um subdomínio
          // de munoapp.com.br: sem isso, o cardápio de um cliente novo aceita a
          // primeira visita em HTTP e é onde a sessão do dono seria interceptada.
          // Sem `preload` de propósito: entrar na lista dos navegadores é
          // decisão difícil de desfazer. O motivo original citava o apex
          // pertencer a outro projeto, o que deixou de valer em 26/08/2026,
          // quando a landing veio para cá — mas a decisão continua de pé pelo
          // primeiro motivo, que sempre foi o que importava.
          {
            key: "Strict-Transport-Security",
            value: "max-age=63072000; includeSubDomains",
          },
          // O navegador não tem por que pedir estes três em nenhuma tela do
          // app. O mapa do motoboy usa geolocalização e roda no próprio
          // dispositivo, então `geolocation=(self)` continua permitindo.
          // Só observa (Report-Only): lista no console do navegador o que uma CSP
          // bloquearia, sem bloquear nada. Passar a aplicar (Content-Security-Policy)
          // exige abrir o app inteiro com o console aberto e ajustar o que
          // aparecer: Supabase (REST e wss), tiles do OpenStreetMap e ícones do
          // Leaflet (unpkg), Google Fonts, imagens https (logo e QR do gateway)
          // e os scripts inline do Next, que mudam a cada resposta. A landing
          // (public/vendas) usa Tailwind CDN, jsdelivr e unpkg e vai relatar
          // bastante enquanto não ganhar a própria política.
          {
            key: "Content-Security-Policy-Report-Only",
            value: [
              "default-src 'self'",
              "script-src 'self' 'unsafe-inline'",
              "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
              "font-src 'self' data: https://fonts.gstatic.com",
              "img-src 'self' data: blob: https:",
              "connect-src 'self' https://*.supabase.co wss://*.supabase.co",
              "worker-src 'self'",
              "manifest-src 'self'",
              "object-src 'none'",
              "base-uri 'self'",
              "form-action 'self'",
              "frame-ancestors 'none'",
              "frame-src 'none'",
            ].join("; "),
          },
          {
            key: "Permissions-Policy",
            value: "camera=(), microphone=(), payment=(), geolocation=(self)",
          },
        ],
      },
    ];
  },
};

module.exports = nextConfig;
