import { describe, expect, it } from "vitest";
import {
  JANELA_DEDUPE_MS,
  ORIGEM_LANDING,
  decidirGravacao,
  normalizarTelefone,
  telefoneValido,
  type LeadCandidato,
} from "./lead-landing";

const AGORA = new Date("2026-08-10T12:00:00Z");

function candidato(over: Partial<LeadCandidato> = {}): LeadCandidato {
  return {
    id: "lead-1",
    telefone: "(11) 99999-9999",
    origem: ORIGEM_LANDING,
    createdAt: new Date(AGORA.getTime() - 60_000),
    ...over,
  };
}

describe("normalizarTelefone", () => {
  it("reduz a dígitos, seja qual for a formatação", () => {
    expect(normalizarTelefone("(11) 99999-9999")).toBe("11999999999");
    expect(normalizarTelefone("11 99999 9999")).toBe("11999999999");
    expect(normalizarTelefone("+55 (11) 99999-9999")).toBe("5511999999999");
  });
});

describe("telefoneValido", () => {
  it.each(["(11) 99999-9999", "1199999999", "+55 11 99999-9999"])(
    "aceita %s",
    (entrada) => {
      expect(telefoneValido(entrada)).toBe(true);
    }
  );

  it.each([
    ["((((((((((", "só pontuação"],
    ["119999", "dígitos de menos"],
    ["551199999999999", "dígitos demais"],
    ["", "vazio"],
  ])("recusa %s (%s)", (entrada) => {
    expect(telefoneValido(entrada)).toBe(false);
  });

  it("valida pelos dígitos, não pelo tamanho do texto", () => {
    // 15 caracteres, 11 dígitos: válido. Validar o texto cru recusaria isto.
    expect(telefoneValido("(11) 99999-9999")).toBe(true);
    // 10 caracteres, 0 dígitos: inválido.
    expect(telefoneValido("((((((((((")).toBe(false);
  });
});

describe("decidirGravacao", () => {
  it("cria quando não há candidato nenhum", () => {
    expect(decidirGravacao([], "11999999999", AGORA)).toEqual({
      acao: "criar",
    });
  });

  it("atualiza o lead recente com o mesmo telefone", () => {
    const existente = candidato({ id: "lead-42" });

    expect(decidirGravacao([existente], "11999999999", AGORA)).toEqual({
      acao: "atualizar",
      id: "lead-42",
    });
  });

  it("reconhece o mesmo telefone escrito de outro jeito", () => {
    const existente = candidato({ id: "lead-42", telefone: "11999999999" });

    expect(decidirGravacao([existente], "(11) 99999-9999", AGORA)).toEqual({
      acao: "atualizar",
      id: "lead-42",
    });
  });

  it("cria quando o lead com aquele telefone é mais velho que a janela", () => {
    const antigo = candidato({
      createdAt: new Date(AGORA.getTime() - JANELA_DEDUPE_MS - 1),
    });

    expect(decidirGravacao([antigo], "11999999999", AGORA)).toEqual({
      acao: "criar",
    });
  });

  it("nunca toca em lead de origem manual", () => {
    // O nome ali foi digitado por uma pessoa; o formulário não o sobrescreve.
    const manual = candidato({ origem: "manual" });

    expect(decidirGravacao([manual], "11999999999", AGORA)).toEqual({
      acao: "criar",
    });
  });

  it("ignora candidato sem telefone", () => {
    const semTelefone = candidato({ telefone: null });

    expect(decidirGravacao([semTelefone], "11999999999", AGORA)).toEqual({
      acao: "criar",
    });
  });

  it("escolhe o mais recente quando há mais de um", () => {
    const velho = candidato({
      id: "lead-velho",
      createdAt: new Date(AGORA.getTime() - 10 * 60_000),
    });
    const novo = candidato({
      id: "lead-novo",
      createdAt: new Date(AGORA.getTime() - 60_000),
    });

    expect(decidirGravacao([velho, novo], "11999999999", AGORA)).toEqual({
      acao: "atualizar",
      id: "lead-novo",
    });
  });
});
