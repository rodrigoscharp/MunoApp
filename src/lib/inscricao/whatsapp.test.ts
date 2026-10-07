import { describe, expect, it } from "vitest";
import { mascararWhatsapp, normalizarWhatsapp } from "./whatsapp";

describe("normalizarWhatsapp", () => {
  it.each([
    ["(11) 98765-4321", "11987654321"],
    ["11987654321", "11987654321"],
    ["+55 11 98765-4321", "11987654321"],
    ["5512987654321", "12987654321"],
  ])("aceita %s", (bruto, esperado) => {
    expect(normalizarWhatsapp(bruto)).toBe(esperado);
  });

  // Fixo não recebe WhatsApp nem SMS do Asaas: aceitar aqui daria a sensação
  // de canal de recuperação onde não existe nenhum.
  it.each([
    ["fixo", "(11) 3456-7890"],
    ["sem o nove", "1187654321"],
    ["DDD com zero", "(01) 98765-4321"],
    ["curto", "98765-4321"],
    ["vazio", ""],
    ["letras", "abcdefghijk"],
  ])("recusa %s", (_caso, bruto) => {
    expect(normalizarWhatsapp(bruto)).toBeNull();
  });
});

describe("mascararWhatsapp", () => {
  it("formata enquanto digita e corta no 11º dígito", () => {
    expect(mascararWhatsapp("1")).toBe("(1");
    expect(mascararWhatsapp("1198")).toBe("(11) 98");
    expect(mascararWhatsapp("119876543210")).toBe("(11) 98765-4321");
  });
});
