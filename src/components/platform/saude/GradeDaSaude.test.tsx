// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import type { Peca, Saude } from "@/lib/saude/avaliar";
import { GradeDaSaude } from "./GradeDaSaude";

// "Rotas" não tem batimento: o que ela guarda é o instante do último ERRO.
// Dizer "último sinal" ali leria como "a rota respondeu há pouco", que é o
// contrário do que o número significa.

const AGORA = new Date("2026-10-07T15:00:00Z");
const HA_DEZ_MIN = new Date(AGORA.getTime() - 10 * 60_000);

const peca = (p: Partial<Peca> & Pick<Peca, "chave" | "nome">): Peca => ({
  cor: "verde",
  motivo: "tudo certo",
  ultimoSinal: null,
  ...p,
});

const saude = (pecas: Peca[]): Saude => ({ geral: "verde", resumo: "Tudo funcionando.", pecas });

afterEach(cleanup);

describe("GradeDaSaude", () => {
  it("rotula o instante da peça de rotas como último erro", () => {
    render(
      <GradeDaSaude
        saude={saude([peca({ chave: "rotas", nome: "Rotas", ultimoSinal: HA_DEZ_MIN })])}
        agora={AGORA}
      />
    );

    expect(screen.getByText("último erro há 10 min")).toBeTruthy();
    expect(screen.queryByText(/último sinal/)).toBeNull();
  });

  it("diz que nenhum erro foi registrado quando a peça de rotas não tem instante", () => {
    render(<GradeDaSaude saude={saude([peca({ chave: "rotas", nome: "Rotas" })])} agora={AGORA} />);

    expect(screen.getByText("nenhum erro registrado")).toBeTruthy();
    expect(screen.queryByText(/sem sinal registrado/)).toBeNull();
  });

  it("mantém último sinal e sem sinal registrado nas demais peças", () => {
    render(
      <GradeDaSaude
        saude={saude([
          peca({ chave: "cron", nome: "Cron", ultimoSinal: HA_DEZ_MIN }),
          peca({ chave: "email", nome: "E-mail" }),
        ])}
        agora={AGORA}
      />
    );

    expect(screen.getByText("último sinal há 10 min")).toBeTruthy();
    expect(screen.getByText("sem sinal registrado")).toBeTruthy();
  });

  it("escreve o rótulo da cor só para leitor de tela", () => {
    render(
      <GradeDaSaude
        saude={saude([peca({ chave: "cron", nome: "Cron", cor: "vermelho" })])}
        agora={AGORA}
      />
    );

    expect(screen.getByText("parado").className).toContain("sr-only");
  });
});
