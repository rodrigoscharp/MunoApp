/**
 * A coleta da saúde e o expurgo sobre o banco real: as janelas de tempo, o
 * fuso das horas e o deleteMany por data.
 */
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { prismaUnscoped } from "@/lib/prisma";
import { coletarDadosDeSaude, coletarPedidosPorHora, listarEventos } from "@/lib/saude/coletar";
import { expurgarEventosDeSaude } from "@/lib/saude/expurgo";
import { criarTenant, limparTenants, pedidoMinimo } from "./apoio";

const AGORA = new Date();
const H = 3_600_000;
const ha = (ms: number) => new Date(AGORA.getTime() - ms);

beforeEach(async () => {
  await prismaUnscoped.eventoSistema.deleteMany({});
});
afterAll(async () => {
  await prismaUnscoped.eventoSistema.deleteMany({});
  await limparTenants();
});

describe("expurgarEventosDeSaude", () => {
  it("apaga só o que passou de 30 dias", async () => {
    await prismaUnscoped.eventoSistema.createMany({
      data: [
        { origem: "x", nivel: "OK", mensagem: "velho", criadoEm: ha(31 * 24 * H) },
        { origem: "x", nivel: "OK", mensagem: "novo", criadoEm: ha(29 * 24 * H) },
      ],
    });
    expect(await expurgarEventosDeSaude(AGORA)).toBe(1);
    const restantes = await prismaUnscoped.eventoSistema.findMany();
    expect(restantes.map((e) => e.mensagem)).toEqual(["novo"]);
  });
});

describe("coletarDadosDeSaude", () => {
  it("lê a janela de eventos, o último sinal do cron e o primeiro evento", async () => {
    await prismaUnscoped.eventoSistema.createMany({
      data: [
        { origem: "cron/assinaturas", nivel: "OK", mensagem: "rodou", criadoEm: ha(60 * H) },
        { origem: "cron/assinaturas:faxina", nivel: "ERRO", mensagem: "x", criadoEm: ha(2 * H) },
        { origem: "webhook/asaas", nivel: "OK", mensagem: "y", criadoEm: ha(H) },
      ],
    });
    const d = await coletarDadosDeSaude(AGORA);
    expect(d.banco.ok).toBe(true);
    // O sinal de 60 h fica fora da janela de 50 h, mas é o último sinal do cron.
    expect(d.leitura!.eventos.map((e) => e.origem).sort()).toEqual(["cron/assinaturas:faxina", "webhook/asaas"]);
    expect(d.leitura!.ultimoCron?.origem).toBe("cron/assinaturas");
    expect(d.leitura!.primeiroEvento?.getTime()).toBe(ha(60 * H).getTime());
  });

  it("conta pedidos na última hora e na mesma hora das semanas anteriores", async () => {
    const tenant = await criarTenant("saude");
    await prismaUnscoped.order.createMany({
      data: [
        pedidoMinimo(tenant.id, { createdAt: ha(10 * 60_000) }),
        pedidoMinimo(tenant.id, { createdAt: ha(7 * 24 * H + 10 * 60_000) }),
        pedidoMinimo(tenant.id, { createdAt: ha(7 * 24 * H + 20 * 60_000) }),
      ],
    });
    const d = await coletarDadosDeSaude(AGORA);
    expect(d.leitura!.pedidos.naUltimaHora).toBeGreaterThanOrEqual(1);
    expect(d.leitura!.pedidos.mesmaHoraAntes).toHaveLength(4);
    expect(d.leitura!.pedidos.mesmaHoraAntes[0]).toBeGreaterThanOrEqual(2);
  });
});

describe("coletarPedidosPorHora", () => {
  it("agrupa na hora de São Paulo", async () => {
    const barras = await coletarPedidosPorHora(AGORA);
    expect(barras.length).toBeGreaterThan(0);
    expect(barras.at(-1)!.hoje).toBeGreaterThanOrEqual(0);
  });

  it("separa as horas no relógio de São Paulo, não no UTC, e compara com o mesmo dia da semana anterior", async () => {
    const tenant = await criarTenant("porhora");
    // 01:30 de quinta em São Paulo (04:30Z). Data fixa e distante, para nenhum
    // pedido de outro teste cair na janela.
    const agora = new Date("2030-03-14T04:30:00Z");
    const em = (iso: string) => pedidoMinimo(tenant.id, { createdAt: new Date(iso) });
    await prismaUnscoped.order.createMany({
      data: [
        em("2030-03-14T03:10:00Z"), // 00:10 de hoje em São Paulo, hora 0
        em("2030-03-14T04:10:00Z"), // 01:10 de hoje, hora 1
        em("2030-03-14T02:50:00Z"), // 23:50 de ONTEM, não é hoje
        em("2030-03-07T03:20:00Z"), // hora 0 de quinta passada
        em("2030-03-07T03:40:00Z"), // hora 0 de quinta passada
        em("2030-02-28T03:20:00Z"), // hora 0, duas quintas atrás
        em("2030-02-21T03:20:00Z"), // hora 0, três quintas atrás
        em("2030-03-07T02:50:00Z"), // 23:50 da quarta anterior: fora da hora 0
      ],
    });
    expect(await coletarPedidosPorHora(agora)).toEqual([
      { hora: 0, hoje: 1, media: 1 }, // (2 + 1 + 1 + 0) / 4
      { hora: 1, hoje: 1, media: 0 },
    ]);
  });
});

describe("listarEventos", () => {
  it("padrão esconde OK; filtra por peça; traz o nome do restaurante", async () => {
    const tenant = await criarTenant("feed");
    await prismaUnscoped.eventoSistema.createMany({
      data: [
        { origem: "webhook/pagamento", nivel: "ERRO", mensagem: "a", tenantId: tenant.id },
        { origem: "webhook/pagamento", nivel: "OK", mensagem: "b", tenantId: tenant.id },
        { origem: "forgot-password:envio", nivel: "ERRO", mensagem: "c" },
        { origem: "x", nivel: "ERRO", mensagem: "d", tenantId: "removido" },
      ],
    });
    const padrao = await listarEventos({ todos: false, peca: null, tenantId: null });
    expect(padrao.map((e) => e.mensagem).sort()).toEqual(["a", "c", "d"]);
    expect(padrao.find((e) => e.mensagem === "a")!.restaurante).toBe(tenant.nome);
    expect(padrao.find((e) => e.mensagem === "d")!.restaurante).toBe("restaurante removido");

    const pagamentos = await listarEventos({ todos: true, peca: "pagamentos", tenantId: null });
    expect(pagamentos.map((e) => e.mensagem).sort()).toEqual(["a", "b"]);

    const outros = await listarEventos({ todos: false, peca: "outros", tenantId: null });
    expect(outros.map((e) => e.mensagem)).toEqual(["d"]);
  });
});
