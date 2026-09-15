/**
 * `callbackUrl` vem da query string, e quem escreve a query string é quem
 * mandou o link. Sem esta função,
 * pizzaria.munoapp.com.br/login?callbackUrl=https://golpe.example levava o
 * cliente, recém autenticado e confiando no domínio do restaurante, para
 * qualquer lugar. Por exemplo, uma cópia da tela de login pedindo a senha de
 * novo.
 */

import { describe, expect, it } from "vitest";
import { destinoSeguro } from "./redirect-seguro";

describe("destinoSeguro", () => {
  it.each(["/checkout", "/pedidos/abc/chat", "/adm", "/adm/menu?aba=2#topo", "/"])(
    "mantém o destino interno %s",
    (destino) => {
      expect(destinoSeguro(destino, "/")).toBe(destino);
    }
  );

  it.each([
    ["URL absoluta", "https://golpe.example"],
    ["URL sem esquema", "//golpe.example"],
    ["barra invertida, que o navegador lê como barra", "/\\golpe.example"],
    ["tabulação no meio, que o parser de URL remove", "/\t/golpe.example"],
    ["espaço antes", " //golpe.example"],
    ["javascript:", "javascript:alert(1)"],
    ["caminho relativo", "adm"],
    ["vazio", ""],
  ])("recusa %s", (_nome, valor) => {
    expect(destinoSeguro(valor, "/")).toBe("/");
  });

  it("devolve o padrão quando não há valor", () => {
    expect(destinoSeguro(null, "/")).toBe("/");
    expect(destinoSeguro(undefined, "/inicio")).toBe("/inicio");
  });

  it("aceita null como padrão, para quem decide o destino depois", () => {
    expect(destinoSeguro("https://golpe.example", null)).toBeNull();
    expect(destinoSeguro("/checkout", null)).toBe("/checkout");
  });
});
