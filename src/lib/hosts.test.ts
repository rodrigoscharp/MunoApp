/**
 * A resolução de host, que o proxy e o manifest do PWA compartilham.
 *
 * Ela tem teste próprio porque passou a ter DOIS consumidores. Enquanto vivia
 * dentro do proxy, src/proxy.test.ts era a única rede; agora um erro aqui
 * afeta também qual manifest cada subdomínio recebe, e o sintoma lá é silencioso
 * (o app instala com o nome errado, e ninguém abre um chamado por isso).
 *
 * ROOT_DOMAIN não está definido no ambiente de teste, então vale o padrão
 * "localhost:3000".
 */
import { describe, expect, it } from "vitest";
import { resolveSlugFromHost, tipoDeHost, PLATFORM_SUBDOMAIN } from "./hosts";

describe("resolveSlugFromHost", () => {
  it("devolve null no domínio raiz", () => {
    expect(resolveSlugFromHost("localhost:3000")).toBe(null);
  });

  it("devolve o slug do subdomínio", () => {
    expect(resolveSlugFromHost("burguer.localhost:3000")).toBe("burguer");
  });

  it("ignora a porta na comparação", () => {
    expect(resolveSlugFromHost("burguer.localhost")).toBe("burguer");
  });

  it("devolve null para host que não é do projeto", () => {
    // O host de deploy da Vercel cai aqui, e é o que o faz se comportar como o
    // apex em vez de virar um tenant chamado "muno-abc123".
    expect(resolveSlugFromHost("muno-abc123.vercel.app")).toBe(null);
  });
});

describe("tipoDeHost", () => {
  it.each([
    ["localhost:3000", "raiz"],
    ["admin.localhost:3000", "plataforma"],
    ["burguer.localhost:3000", "tenant"],
    ["default.localhost:3000", "tenant"],
    ["muno-abc123.vercel.app", "raiz"],
    ["", "raiz"],
  ])("%s é %s", (host, esperado) => {
    expect(tipoDeHost(host)).toBe(esperado);
  });

  it("o subdomínio da plataforma é o mesmo que o proxy usa", () => {
    // Se alguém trocar a constante, este teste continua verdadeiro e o proxy
    // continua alinhado — que é justamente o ponto de haver uma só.
    expect(tipoDeHost(`${PLATFORM_SUBDOMAIN}.localhost:3000`)).toBe("plataforma");
  });
});
