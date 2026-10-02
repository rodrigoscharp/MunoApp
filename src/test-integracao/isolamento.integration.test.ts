/**
 * O isolamento entre restaurantes contra um Postgres de verdade.
 *
 * Os testes de unidade verificam que a extensão do Prisma monta o `where`
 * certo; aqui se confere o efeito no banco: um restaurante não enxerga, não
 * altera e não cria linha no outro.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma, prismaUnscoped } from "@/lib/prisma";
import { comTenant, criarTenant, limparTenants, pedidoMinimo } from "./apoio";

let A: { id: string };
let B: { id: string };
let pedidoA: string;
let pedidoB: string;

beforeAll(async () => {
  A = await criarTenant("iso-a");
  B = await criarTenant("iso-b");
  pedidoA = (await prismaUnscoped.order.create({ data: pedidoMinimo(A.id, { customerName: "Ana" }) })).id;
  pedidoB = (await prismaUnscoped.order.create({ data: pedidoMinimo(B.id, { customerName: "Bruno" }) })).id;
});

afterAll(limparTenants);

describe("isolamento entre restaurantes", () => {
  it("findMany só devolve os pedidos do próprio restaurante", async () => {
    const dosPedidos = await comTenant(A.id, () => prisma.order.findMany());
    expect(dosPedidos.map((o) => o.id)).toEqual([pedidoA]);
  });

  it("findUnique de um pedido do outro restaurante devolve null", async () => {
    const alheio = await comTenant(A.id, () => prisma.order.findUnique({ where: { id: pedidoB } }));
    expect(alheio).toBeNull();
  });

  it("updateMany não toca no pedido do outro restaurante", async () => {
    const r = await comTenant(A.id, () =>
      prisma.order.updateMany({ where: { id: pedidoB }, data: { customerName: "INVADIDO" } })
    );
    expect(r.count).toBe(0);
    const intacto = await prismaUnscoped.order.findUnique({ where: { id: pedidoB } });
    expect(intacto?.customerName).toBe("Bruno");
  });

  it("deleteMany não apaga o pedido do outro restaurante", async () => {
    const r = await comTenant(A.id, () => prisma.order.deleteMany({ where: { id: pedidoB } }));
    expect(r.count).toBe(0);
    expect(await prismaUnscoped.order.count({ where: { id: pedidoB } })).toBe(1);
  });

  it("count é por restaurante", async () => {
    expect(await comTenant(A.id, () => prisma.order.count())).toBe(1);
  });

  it("criar passando o tenantId do outro grava no restaurante da request", async () => {
    const criado = await comTenant(A.id, () =>
      prisma.order.create({ data: pedidoMinimo(B.id, { customerName: "Forjado" }) })
    );
    expect(criado.tenantId).toBe(A.id);
  });

  it("update com tenantId de outro restaurante não move a linha", async () => {
    await comTenant(A.id, () =>
      prisma.order.update({ where: { id: pedidoA }, data: { tenantId: B.id } })
    );
    const depois = await prismaUnscoped.order.findUnique({ where: { id: pedidoA } });
    expect(depois?.tenantId).toBe(A.id);
  });

  it("sem restaurante no contexto a consulta falha, em vez de devolver tudo", async () => {
    await expect(prisma.order.findMany()).rejects.toThrow();
  });
});

describe("RLS no schema real", () => {
  it("toda tabela do schema public tem row level security ligado", async () => {
    const rows = await prismaUnscoped.$queryRaw<{ tabela: string }[]>`
      select c.relname as tabela
      from pg_class c
      join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public' and c.relkind = 'r'
        and not c.relrowsecurity
        and c.relname <> '_prisma_migrations'`;
    expect(rows.map((r) => r.tabela)).toEqual([]);
  });
});
