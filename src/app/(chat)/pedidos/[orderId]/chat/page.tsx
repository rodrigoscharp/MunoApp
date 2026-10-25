import { auth } from "@/lib/auth";
import { prismaUnscoped } from "@/lib/prisma";
import { getRestaurantInfo } from "@/lib/restaurant";
import { redirect, notFound } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Store } from "lucide-react";
import { ChatWindow, type QuickReply } from "@/components/chat/ChatWindow";
import { OrderStatusBadge } from "@/components/chat/OrderStatusBadge";
import { OrderStatus } from "@/types";
import { fontesDaLoja } from "@/lib/loja/fontes";

type Props = { params: Promise<{ orderId: string }> };

const QUICK_REPLIES_BY_STATUS: Partial<Record<OrderStatus, QuickReply[]>> = {
  PENDING: [
    { label: "Meu pedido está atrasado", message: "Olá! Meu pedido está demorando mais que o esperado, pode verificar?" },
    { label: "Quero cancelar meu pedido", message: "Olá! Gostaria de cancelar meu pedido, é possível?" },
    { label: "Preciso alterar algo no pedido", message: "Olá! Preciso fazer uma alteração no meu pedido, pode me ajudar?" },
  ],
  CONFIRMED: [
    { label: "Qual a previsão de entrega?", message: "Olá! Qual é a previsão de entrega do meu pedido?" },
    { label: "Quero cancelar meu pedido", message: "Olá! Gostaria de cancelar meu pedido, ainda é possível?" },
    { label: "Preciso alterar o endereço de entrega", message: "Olá! Preciso alterar o endereço de entrega, é possível?" },
  ],
  IN_PREPARATION: [
    { label: "Quanto tempo falta para ficar pronto?", message: "Olá! Quanto tempo falta para meu pedido ficar pronto?" },
    { label: "Tenho uma observação sobre o preparo", message: "Olá! Tenho uma observação sobre o preparo do meu pedido." },
  ],
  READY: [
    { label: "Quando sai para entrega?", message: "Olá! Meu pedido já está pronto, quando sai para entrega?" },
    { label: "Posso retirar agora?", message: "Olá! Meu pedido está pronto, posso ir buscar agora?" },
  ],
  OUT_FOR_DELIVERY: [
    { label: "Meu pedido está atrasado", message: "Olá! Meu pedido está demorando mais que o esperado, pode verificar?" },
    { label: "Preciso confirmar meu endereço", message: "Olá! Quero confirmar o endereço de entrega para o entregador." },
    { label: "O entregador não está me encontrando", message: "Olá! O entregador está com dificuldade para me encontrar, pode ajudar?" },
  ],
  DELIVERED: [
    { label: "Recebi um item errado ou faltando", message: "Olá! Recebi meu pedido mas havia um item errado ou faltando." },
    { label: "Tive um problema com o pedido", message: "Olá! Tive um problema com meu pedido e gostaria de relatar." },
  ],
};

const DEFAULT_QUICK_REPLIES: QuickReply[] = [
  { label: "Tenho uma dúvida sobre meu pedido", message: "Olá! Tenho uma dúvida sobre meu pedido." },
  { label: "Meu pedido está atrasado", message: "Olá! Meu pedido está atrasado, pode verificar?" },
  { label: "Tive um problema com o pedido", message: "Olá! Tive um problema com meu pedido e gostaria de relatar." },
];

export default async function OrderChatPage({ params }: Props) {
  const { orderId } = await params;
  const session = await auth();

  if (!session?.user) {
    redirect(`/login?callbackUrl=/pedidos/${orderId}/chat`);
  }

  // tenantId é opcional no tipo Session (a sessão de plataforma não tem um);
  // aqui a sessão é sempre de restaurante, já checada logo acima.
  const [order, restaurant] = await Promise.all([
    prismaUnscoped.order.findUnique({
      where: { id: orderId, tenantId: session.user.tenantId! },
      select: { id: true, userId: true, status: true },
    }),
    getRestaurantInfo(session.user.tenantId!),
  ]);

  if (!order) notFound();

  if (order.userId !== session.user.id) {
    redirect("/pedidos");
  }

  const quickReplies =
    QUICK_REPLIES_BY_STATUS[order.status as OrderStatus] ?? DEFAULT_QUICK_REPLIES;

  // Esta rota não tem layout próprio (o grupo (chat) fica fora do (client)
  // para o chat ocupar a tela inteira), então o invólucro da loja vem aqui.
  return (
    <div className={`loja ${fontesDaLoja} flex h-dvh flex-col`}>
      {/* Header */}
      <header className="relative z-10 flex shrink-0 items-center gap-3 bg-loja-papel px-3 py-2.5 shadow-loja sm:px-4">
        <Link
          href="/pedidos"
          aria-label="Voltar para meus pedidos"
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full transition hover:bg-loja-creme"
        >
          <ArrowLeft size={20} aria-hidden="true" className="text-loja-tinta" />
        </Link>

        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-loja-pessego">
          <Store size={18} aria-hidden="true" className="text-loja-preco" />
        </div>

        <div className="min-w-0 flex-1">
          <p className="manchete truncate text-[22px] text-loja-preco">
            {restaurant.name}
          </p>
          <p className="truncate text-xs font-semibold text-loja-tinta-2">
            Pedido #{orderId.slice(-6).toUpperCase()}
          </p>
        </div>

        <OrderStatusBadge
          orderId={orderId}
          initialStatus={order.status as OrderStatus}
        />
      </header>

      {/* Chat ocupa o restante */}
      <div className="min-h-0 flex-1">
        <ChatWindow
          orderId={orderId}
          currentRole="CUSTOMER"
          currentName={session.user.name ?? "Cliente"}
          quickReplies={quickReplies}
        />
      </div>
    </div>
  );
}
