import "dotenv/config";
import { prismaUnscoped } from "../src/lib/prisma";

/**
 * Levanta os pedidos que foram cobrados a menos no cartão via Mercado Pago.
 *
 * O adapter montava a preference do Checkout Pro item a item, e a preference não
 * tem campo de valor: o MP cobra a SOMA dos items. Como a taxa de entrega nunca
 * entrou nessa lista, todo pedido com frete pago no cartão via MP cobrou o
 * subtotal e deixou o frete de fora. O PIX não é afetado — aquele caminho manda
 * transaction_amount = order.total.
 *
 * Corrigido em f644a1c; este script mede o que ficou para trás.
 *
 * Só lê. Rode com as credenciais de produção:
 *     npx dotenv -e .env.prod -- tsx scripts/conciliacao-mercadopago.ts
 */

type Linha = {
  tenant: string;
  pedido: string;
  data: Date;
  cobrado: unknown;
  deveriaTer: unknown;
  diferenca: unknown;
};

async function main() {
  // Só tenants que chegaram a conectar o Mercado Pago: nos outros, o cartão
  // passou por outro gateway e o valor saiu certo.
  const conexoes = await prismaUnscoped.paymentConnection.findMany({
    where: { provider: "mercado_pago" },
    select: { tenantId: true },
  });
  const tenantIds = conexoes.map((c) => c.tenantId);

  console.log(`Restaurantes com Mercado Pago conectado: ${tenantIds.length}`);

  if (tenantIds.length === 0) {
    console.log("\nNenhum. Não há o que conciliar — o bug nunca teve como acontecer.");
    return;
  }

  const linhas = await prismaUnscoped.$queryRawUnsafe<Linha[]>(
    `
    select t.nome                       as tenant,
           o.id                         as pedido,
           o."createdAt"                as data,
           (o.total - o."deliveryFee")  as cobrado,
           o.total                      as "deveriaTer",
           o."deliveryFee"              as diferenca
      from "Order" o
      join "Tenant" t on t.id = o."tenantId"
     where o."tenantId" = any($1::text[])
       and o."paymentMethod" = 'CREDIT_CARD'
       and o."paymentStatus" = 'PAID'
       and o."deliveryFee" > 0
     order by o."createdAt"
  `,
    tenantIds
  );

  if (linhas.length === 0) {
    console.log("\nNenhum pedido afetado: não houve cartão pago com frete nesses restaurantes.");
    return;
  }

  const totalPerdido = linhas.reduce((soma, l) => soma + Number(l.diferenca), 0);
  const porTenant = new Map<string, { pedidos: number; valor: number }>();
  for (const l of linhas) {
    const atual = porTenant.get(l.tenant) ?? { pedidos: 0, valor: 0 };
    atual.pedidos += 1;
    atual.valor += Number(l.diferenca);
    porTenant.set(l.tenant, atual);
  }

  const brl = (v: number) =>
    new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v);

  console.log(`\nPedidos cobrados a menos: ${linhas.length}`);
  console.log(`Total não cobrado:        ${brl(totalPerdido)}\n`);

  console.log("Por restaurante:");
  for (const [tenant, { pedidos, valor }] of porTenant) {
    console.log(`  ${tenant}: ${pedidos} pedido(s), ${brl(valor)}`);
  }

  console.log("\nDetalhe:");
  console.log("data\t\tpedido\t\tcobrado\t\tdevido\t\tdiferença");
  for (const l of linhas) {
    const data = new Date(l.data).toLocaleDateString("pt-BR");
    console.log(
      `${data}\t${l.pedido.slice(-6).toUpperCase()}\t\t` +
        `${brl(Number(l.cobrado))}\t${brl(Number(l.deveriaTer))}\t${brl(Number(l.diferenca))}`
    );
  }
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prismaUnscoped.$disconnect());
