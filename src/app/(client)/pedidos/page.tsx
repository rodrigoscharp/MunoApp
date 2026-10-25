import { auth } from "@/lib/auth";
import { prismaUnscoped } from "@/lib/prisma";
import { redirect } from "next/navigation";
import Link from "next/link";
import { formatCurrency, formatDate, ORDER_STATUS_LABELS } from "@/lib/utils";
import { ChevronRight, MessageSquare, PackageSearch } from "lucide-react";
import { OrderStatus } from "@/types";
import { botaoBrasa, cartao, kicker } from "@/components/loja/estilos";
import { Raminho } from "@/components/loja/Raminho";
import { TituloDosPedidos } from "./TituloDosPedidos";
import { SELO_DO_PEDIDO, seloBase } from "@/components/loja/selo-do-pedido";

const ACTIVE_STATUSES: OrderStatus[] = [
  "PENDING",
  "CONFIRMED",
  "IN_PREPARATION",
  "READY",
  "OUT_FOR_DELIVERY",
];

export default async function PedidosPage() {
  const session = await auth();

  if (!session?.user) {
    redirect("/login?callbackUrl=/pedidos");
  }

  const orders = await prismaUnscoped.order.findMany({
    where: { userId: session.user.id, tenantId: session.user.tenantId },
    include: {
      items: { include: { menuItem: { select: { name: true } } } },
    },
    orderBy: { createdAt: "desc" },
    // Os 50 mais recentes: o histórico inteiro de um cliente fiel, com itens,
    // a cada visita à página, só cresce.
    take: 50,
  });

  const active = orders.filter((o) =>
    ACTIVE_STATUSES.includes(o.status as OrderStatus)
  );
  const past = orders.filter(
    (o) => !ACTIVE_STATUSES.includes(o.status as OrderStatus)
  );

  return (
    <div className="mx-auto max-w-2xl px-4 py-8">
      <TituloDosPedidos />

      {orders.length === 0 ? (
        <div className={`${cartao} relative overflow-hidden px-6 py-12 text-center`}>
          <Raminho className="pointer-events-none absolute -right-6 -top-6 h-28 w-28 text-[#C9A685]" />
          <div className="relative">
            <span className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-loja-pessego">
              <PackageSearch size={28} aria-hidden="true" className="text-loja-preco" />
            </span>
            <p className="manchete text-[32px] text-forest-dark">Nenhum pedido ainda</p>
            <p className="mx-auto mt-2 mb-6 max-w-xs text-sm text-loja-tinta-2">
              Seus pedidos aparecerão aqui após a compra.
            </p>
            <Link href="/" className={`${botaoBrasa} h-12 text-sm`}>
              Ver cardápio
            </Link>
          </div>
        </div>
      ) : (
        <div className="space-y-8">
          {/* Pedidos ativos */}
          {active.length > 0 && (
            <section>
              <h2 className={`${kicker} mb-3 text-loja-tinta-2`}>Em andamento</h2>
              <div className="space-y-3">
                {active.map((order) => (
                  <OrderCard key={order.id} order={order} />
                ))}
              </div>
            </section>
          )}

          {/* Histórico */}
          {past.length > 0 && (
            <section>
              <h2 className={`${kicker} mb-3 text-loja-tinta-2`}>Histórico</h2>
              <div className="space-y-3">
                {past.map((order) => (
                  <OrderCard key={order.id} order={order} />
                ))}
              </div>
            </section>
          )}
        </div>
      )}
    </div>
  );
}

function OrderCard({
  order,
}: {
  order: {
    id: string;
    status: string;
    total: { toString(): string };
    createdAt: Date;
    items: { quantity: number; menuItem: { name: string } }[];
  };
}) {
  const status = order.status as OrderStatus;
  const isActive = ACTIVE_STATUSES.includes(status);

  return (
    <div className={`${cartao} px-5 py-4 transition hover:shadow-loja-alta`}>
      <Link href={`/track/${order.id}`} className="group flex items-center justify-between gap-4">
        <div className="min-w-0 flex-1">
          <div className="mb-2 flex flex-wrap items-center gap-2">
            <span className="font-mono text-xs font-bold text-loja-tinta-2">
              #{order.id.slice(-6).toUpperCase()}
            </span>
            <span className={`${seloBase} ${SELO_DO_PEDIDO[status]}`}>
              {ORDER_STATUS_LABELS[status]}
            </span>
            {isActive && (
              <span className="flex items-center gap-1.5 text-xs font-bold text-loja-preco">
                <span className="inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-brand" />
                Ao vivo
              </span>
            )}
          </div>

          <p className="truncate text-sm font-semibold text-loja-tinta">
            {order.items
              .map((i) => `${i.quantity}× ${i.menuItem.name}`)
              .join(", ")}
          </p>

          <p className="mt-1 text-xs text-loja-tinta-2">
            {formatDate(order.createdAt)}
          </p>
        </div>

        <div className="flex shrink-0 items-center gap-2">
          <span className="manchete text-[24px] text-forest-dark">
            {formatCurrency(Number(order.total))}
          </span>
          <ChevronRight
            size={18}
            aria-hidden="true"
            className="text-loja-tinta-2 transition group-hover:text-loja-preco"
          />
        </div>
      </Link>

      {/* Botão de chat */}
      <div className="mt-3 flex justify-end border-t border-dashed border-loja-linha pt-2">
        <Link
          href={`/pedidos/${order.id}/chat`}
          className="inline-flex min-h-11 items-center gap-1.5 text-[13px] font-bold text-forest-dark transition hover:text-loja-preco"
        >
          <MessageSquare size={15} aria-hidden="true" />
          Chat com o restaurante
        </Link>
      </div>
    </div>
  );
}
