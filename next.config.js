/** @type {import('next').NextConfig} */
const nextConfig = {
  // Não anuncia o framework e a versão em todo response. Não é defesa, mas é
  // informação que só serve para quem está procurando um alvo com a versão
  // certa.
  poweredByHeader: false,
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "**.supabase.co",
      },
      {
        protocol: "https",
        hostname: "**.supabase.com",
      },
    ],
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
