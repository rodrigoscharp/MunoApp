import { describe, expect, it } from "vitest";
import {
  coorteMensal,
  conversaoPorOrigem,
  degrausDoFunil,
  formatarTaxa,
  medianaDeDiasAteFechar,
  taxaDeConversao,
  type LeadDaConversao,
} from "./platform-conversao";

const dia = (iso: string) => new Date(`${iso}T12:00:00`);

function lead(
  parcial: Partial<LeadDaConversao> & { createdAt: Date }
): LeadDaConversao {
  return {
    origem: "landing",
    tenantId: null,
    fechadoEm: null,
    ...parcial,
  };
}

describe("taxaDeConversao", () => {
  it("conta como cliente quem tem tenant", () => {
    const r = taxaDeConversao([
      lead({ createdAt: dia("2026-08-01"), tenantId: "t1" }),
      lead({ createdAt: dia("2026-08-02") }),
      lead({ createdAt: dia("2026-08-03") }),
      lead({ createdAt: dia("2026-08-04") }),
    ]);

    expect(r).toEqual({ rotulo: "total", leads: 4, clientes: 1, taxa: 0.25 });
  });

  // Zero afirmaria que ninguém converteu. Null diz que não há o que dividir, e
  // a diferença aparece na primeira semana de uma campanha nova.
  it("devolve null, e não zero, sem lead nenhum", () => {
    expect(taxaDeConversao([]).taxa).toBeNull();
  });
});

describe("conversaoPorOrigem", () => {
  it("separa as origens e ordena pela maior", () => {
    const linhas = conversaoPorOrigem([
      lead({ createdAt: dia("2026-08-01"), origem: "checkout", tenantId: "t1" }),
      lead({ createdAt: dia("2026-08-02"), origem: "checkout" }),
      lead({ createdAt: dia("2026-08-03"), origem: "landing" }),
    ]);

    expect(linhas.map((l) => l.rotulo)).toEqual(["checkout", "landing"]);
    expect(linhas[0]).toMatchObject({ leads: 2, clientes: 1, taxa: 0.5 });
    expect(linhas[1]).toMatchObject({ leads: 1, clientes: 0, taxa: 0 });
  });

  // O default de Lead.origem no schema é "manual", mas um registro antigo com
  // string vazia não pode virar uma origem sem nome na tela.
  it("trata origem vazia como manual", () => {
    const linhas = conversaoPorOrigem([
      lead({ createdAt: dia("2026-08-01"), origem: "" }),
    ]);

    expect(linhas[0].rotulo).toBe("manual");
  });
});

describe("coorteMensal", () => {
  const agora = dia("2026-08-15");

  it("credita o lead ao mês em que ele entrou, não ao do fechamento", () => {
    const linhas = coorteMensal(
      [
        // Entrou em junho e fechou em agosto: é conversão de junho.
        lead({
          createdAt: dia("2026-06-10"),
          tenantId: "t1",
          fechadoEm: dia("2026-08-01"),
        }),
        lead({ createdAt: dia("2026-06-20") }),
      ],
      agora,
      3
    );

    expect(linhas.map((l) => l.rotulo)).toEqual(["06/2026", "07/2026", "08/2026"]);
    expect(linhas[0]).toMatchObject({ leads: 2, clientes: 1, taxa: 0.5 });
    expect(linhas[2].taxa).toBeNull();
  });

  it("devolve a janela inteira, inclusive os meses sem lead", () => {
    expect(coorteMensal([], agora, 6)).toHaveLength(6);
  });
});

describe("medianaDeDiasAteFechar", () => {
  // Mediana e não média: o lead que dormiu meio ano puxaria a média para um
  // número que não descreve negócio nenhum.
  it("resiste ao caso extremo que a média não resistiria", () => {
    const r = medianaDeDiasAteFechar([
      lead({ createdAt: dia("2026-08-01"), fechadoEm: dia("2026-08-02") }),
      lead({ createdAt: dia("2026-08-01"), fechadoEm: dia("2026-08-03") }),
      lead({ createdAt: dia("2026-08-01"), fechadoEm: dia("2026-08-04") }),
      lead({ createdAt: dia("2026-01-01"), fechadoEm: dia("2026-08-01") }),
    ]);

    // Mediana de [1, 2, 3, 212] é 2,5. A média seria 54,5.
    expect(r).toBe(2.5);
  });

  it("ignora duração negativa em vez de afirmar que o cliente nasceu antes do lead", () => {
    const r = medianaDeDiasAteFechar([
      lead({ createdAt: dia("2026-08-10"), fechadoEm: dia("2026-08-01") }),
      lead({ createdAt: dia("2026-08-01"), fechadoEm: dia("2026-08-06") }),
    ]);

    expect(r).toBe(5);
  });

  it("devolve null quando ninguém fechou", () => {
    expect(medianaDeDiasAteFechar([lead({ createdAt: dia("2026-08-01") })])).toBeNull();
  });
});

describe("degrausDoFunil", () => {
  it("calcula a passagem de cada degrau para o seguinte", () => {
    const degraus = degrausDoFunil({
      VISITA: 100,
      VIU_PRECO: 40,
      CLICOU_ASSINAR: 10,
      CHECKOUT_CRIADO: 5,
      PAGOU: 4,
      PROVISIONADO: 4,
    });

    expect(degraus[0]).toMatchObject({ n: 100, doAnterior: null });
    expect(degraus[1]).toMatchObject({ n: 40, doAnterior: 0.4 });
    expect(degraus[4]).toMatchObject({ n: 4, doAnterior: 0.8 });
  });

  // Degrau que some faz a escada parecer completa quando ela está furada.
  it("mantém o degrau zerado na escada, em vez de escondê-lo", () => {
    const degraus = degrausDoFunil({ VISITA: 10 });

    expect(degraus).toHaveLength(6);
    expect(degraus[1]).toMatchObject({ n: 0, doAnterior: 0 });
  });

  it("não divide por zero quando o degrau anterior está vazio", () => {
    expect(degrausDoFunil({ VIU_PRECO: 3 })[1].doAnterior).toBeNull();
  });
});

describe("formatarTaxa", () => {
  it("usa vírgula decimal", () => {
    expect(formatarTaxa(0.125)).toBe("12,5%");
  });

  it("diz 'sem dado' em vez de inventar zero", () => {
    expect(formatarTaxa(null)).toBe("sem dado");
  });
});
