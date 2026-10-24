import { describe, expect, it } from "vitest";
import { diasDeAtraso } from "@/lib/assinatura/regua";
import { inicioDoAtraso } from "./atraso";

// O selo de atrasadas do menu conta no banco com `vencimento < inicioDoAtraso`.
// Se esse predicado se afastar de `diasDeAtraso > 0`, o número do menu passa a
// discordar da tela que ele abre, sem erro nenhum.

describe("inicioDoAtraso", () => {
  const agoras = [
    new Date("2026-10-24T00:00:00.000Z"),
    new Date("2026-10-24T02:59:59.999Z"),
    new Date("2026-10-24T13:30:00.000Z"),
    new Date("2026-10-24T23:59:59.999Z"),
    new Date("2026-01-01T00:00:00.000Z"),
  ];
  const vencimentos = [
    "2026-10-22T12:00:00.000Z",
    "2026-10-23T23:59:59.999Z",
    "2026-10-24T00:00:00.000Z",
    "2026-10-24T03:00:00.000Z",
    "2026-10-24T23:59:59.999Z",
    "2026-10-25T00:00:00.000Z",
    "2025-12-31T23:59:59.999Z",
    "2026-01-01T00:00:00.000Z",
  ].map((v) => new Date(v));

  it("conta como atrasada exatamente o que diasDeAtraso conta", () => {
    for (const agora of agoras) {
      for (const vencimento of vencimentos) {
        expect(
          vencimento < inicioDoAtraso(agora),
          `${vencimento.toISOString()} em ${agora.toISOString()}`
        ).toBe(diasDeAtraso(vencimento, agora) > 0);
      }
    }
  });

  it("é a meia-noite UTC do dia, não o próprio instante", () => {
    expect(inicioDoAtraso(new Date("2026-10-24T13:30:00Z")).toISOString()).toBe(
      "2026-10-24T00:00:00.000Z"
    );
  });
});
