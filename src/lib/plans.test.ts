import type { PlanoTenant } from "@prisma/client";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  PLANO_BENEFICIOS,
  PRECOS,
  escolhaDaQueryString,
  formatarBRL,
  planoFromHeaderValue,
  precoDoCiclo,
  tenantTemMesaQr,
} from "./plans";

describe("tenantTemMesaQr", () => {
  it("libera só MEMBRO_MESA_QR", () => {
    expect(tenantTemMesaQr("MEMBRO_MESA_QR")).toBe(true);
    expect(tenantTemMesaQr("MEMBRO")).toBe(false);
  });
});

describe("planoFromHeaderValue", () => {
  it("reconhece MEMBRO_MESA_QR", () => {
    expect(planoFromHeaderValue("MEMBRO_MESA_QR")).toBe("MEMBRO_MESA_QR");
  });

  it.each([null, "", "MEMBRO", "free", "algo-desconhecido"])(
    // Fail-closed: qualquer coisa que não seja exatamente o label do plano
    // pago vira MEMBRO, nunca libera a feature por omissão ou por um enum
    // futuro que este deploy ainda não conhece.
    "cai em MEMBRO para %s",
    (valor) => {
      expect(planoFromHeaderValue(valor)).toBe("MEMBRO");
    }
  );
});

describe("precoDoCiclo", () => {
  it("o anual é onze mensalidades — um mês grátis", () => {
    expect(PRECOS.MEMBRO.anualCentavos).toBe(11999 * 11);
    expect(PRECOS.MEMBRO_MESA_QR.anualCentavos).toBe(14999 * 11);
  });

  it("devolve o preço do ciclo pedido", () => {
    expect(precoDoCiclo("MEMBRO", "MENSAL")).toBe(11999);
    expect(precoDoCiclo("MEMBRO", "ANUAL")).toBe(131989);
  });
});

describe("o preço anunciado na landing e o preço do código não podem divergir", () => {
  // A landing é servida de public/vendas/ desde 26/08/2026, mas estar no mesmo
  // repositório não impede a divergência — só a torna detectável. Quem impede é
  // este arquivo.
  //
  // Antes da mudança de casa, index.html dizia "R$ 99,99" e MENSALIDADE_SUGERIDA
  // em ConverterLead.tsx dizia "99". Já divergiam, sem consequência, porque
  // ninguém cobrava automaticamente: o operador lia o número na tela e digitava
  // o que quisesse. No dia em que um gateway emitir a cobrança sozinho, essa
  // divergência vira cobrança com valor diferente do anunciado.
  const landing = readFileSync(
    join(process.cwd(), "public/vendas/index.html"),
    "utf8"
  );

  const precosNaPagina = () => [
    ...landing.matchAll(/R\$\s*((?:\d{1,3}\.)*\d{1,3},\d{2})/g),
  ].map((m) => m[1]);

  it("a página anuncia algum preço — senão as asserções abaixo passam à toa", () => {
    expect(precosNaPagina().length).toBeGreaterThan(0);
  });

  it("cobra os preços de tabela de 2026-08", () => {
    expect(PRECOS.MEMBRO.mensalCentavos).toBe(11999);
    expect(PRECOS.MEMBRO_MESA_QR.mensalCentavos).toBe(14999);
  });

  // Direção 1: plans.ts mudou e o HTML ficou para trás. Cobre os dois planos
  // nos dois ciclos — mensal e anual — porque o toggle da landing agora
  // anuncia os quatro.
  it("os quatro preços de tabela aparecem na página", () => {
    const naPagina = precosNaPagina();
    for (const plano of Object.keys(PRECOS) as PlanoTenant[]) {
      expect(naPagina).toContain(formatarBRL(PRECOS[plano].mensalCentavos));
      expect(naPagina).toContain(formatarBRL(PRECOS[plano].anualCentavos));
    }
  });

  // Direção 2: o HTML mudou e plans.ts ficou para trás — ou alguém digitou um
  // valor que não existe em plano nenhum. A lista de conhecidos também precisa
  // dos quatro, senão o preço anual vira "desconhecido" e o teste falha à toa.
  it("nenhum preço da página é desconhecido do código", () => {
    const conhecidos = Object.values(PRECOS).flatMap((p) => [
      formatarBRL(p.mensalCentavos),
      formatarBRL(p.anualCentavos),
    ]);

    for (const preco of new Set(precosNaPagina())) {
      expect(conhecidos).toContain(preco);
    }
  });

  // Mesmo raciocínio dos preços, aplicado ao que o plano ENTREGA. A tela de
  // /assinar passou a listar os benefícios ao lado do formulário, e uma
  // segunda cópia deles divergiria da landing do mesmo jeito que 99,99 e 99
  // divergiram — só que aqui a divergência é pior de perceber, porque ninguém
  // confere lista de features lado a lado.
  //
  // O HTML quebra linha no meio do texto ("Painel\n  financeiro completo"),
  // então a comparação normaliza espaço em branco antes de casar. Sem isso o
  // teste falharia por formatação do arquivo, não por divergência real.
  const textoDaLanding = landing.replace(/\s+/g, " ");

  it("cada benefício de tabela aparece na página", () => {
    for (const plano of Object.keys(PLANO_BENEFICIOS) as PlanoTenant[]) {
      for (const beneficio of PLANO_BENEFICIOS[plano]) {
        expect(textoDaLanding).toContain(beneficio);
      }
    }
  });

  it("os dois planos têm benefício listado — senão o teste acima passa à toa", () => {
    expect(PLANO_BENEFICIOS.MEMBRO.length).toBeGreaterThan(0);
    expect(PLANO_BENEFICIOS.MEMBRO_MESA_QR.length).toBeGreaterThan(0);
  });
});

// A escolha que a página /assinar faz a partir da query string. Mora aqui, e
// não na page, porque Server Component assíncrono não se testa com o mesmo
// ferramental dos componentes de cliente — e esta é a parte que precisa de
// teste, não a marcação em volta dela.
describe("escolhaDaQueryString", () => {
  it("respeita plano e ciclo quando os dois vêm certos", () => {
    expect(escolhaDaQueryString({ plano: "MEMBRO_MESA_QR", ciclo: "ANUAL" })).toEqual({
      plano: "MEMBRO_MESA_QR",
      ciclo: "ANUAL",
    });
  });

  // A REGRA: nunca quebrar a página por causa de query string, e nunca
  // conceder por engano o plano mais caro para quem não pediu. Link velho
  // compartilhado no WhatsApp, parâmetro cortado pelo cliente de e-mail, ou
  // valor de uma versão futura do enum — tudo cai no mais barato.
  it.each([
    undefined,
    "",
    "membro_mesa_qr",
    "MEMBRO_MESA_QR_PLUS",
    "PLANO_QUE_NAO_EXISTE",
    "'; DROP TABLE",
  ])("plano %j cai em MEMBRO", (plano) => {
    expect(escolhaDaQueryString({ plano, ciclo: "MENSAL" }).plano).toBe("MEMBRO");
  });

  it.each([undefined, "", "anual", "SEMESTRAL", "0"])(
    "ciclo %j cai em MENSAL",
    (ciclo) => {
      expect(escolhaDaQueryString({ plano: "MEMBRO", ciclo }).ciclo).toBe("MENSAL");
    }
  );

  it("sem parâmetro nenhum entrega o plano mais barato no ciclo mensal", () => {
    const escolha = escolhaDaQueryString({});

    expect(escolha).toEqual({ plano: "MEMBRO", ciclo: "MENSAL" });
    expect(precoDoCiclo(escolha.plano, escolha.ciclo)).toBe(
      PRECOS.MEMBRO.mensalCentavos
    );
  });
});
