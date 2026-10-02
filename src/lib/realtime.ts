import { supabaseAdmin } from "@/lib/supabase-admin";
import { KITCHEN_CHANNEL, orderChannel, userChannel } from "@/lib/realtime-channel";
import { topicoSeguro } from "@/lib/realtime-topic";

const LIMITE_DO_ENVIO_MS = 2000;

// Substitui as assinaturas antigas de postgres_changes, que dependiam de
// RLS numa role (anon) sem noção de tenant (ver Fase 1 do plano de
// multi-tenancy). Servidor publica no canal do tenant explicitamente após
// cada escrita relevante.
export async function broadcastTenantEvent(
  tenantId: string,
  channel: string,
  event: string,
  payload: Record<string, unknown>
): Promise<void> {
  const canal = supabaseAdmin.channel(topicoSeguro(tenantId, channel));
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    // O pedido já está gravado quando isto roda: Realtime lento ou fora do ar
    // não pode segurar a resposta nem virar 500. Espera no máximo 2s.
    await Promise.race([
      canal.send({ type: "broadcast", event, payload }),
      new Promise<void>((resolve) => {
        timer = setTimeout(resolve, LIMITE_DO_ENVIO_MS);
      }),
    ]);
  } catch (erro) {
    console.error(`[realtime] falha ao publicar ${event} em ${channel}:`, erro);
  } finally {
    clearTimeout(timer);
    // O cliente do Supabase guarda todo canal criado; sem remover, uma
    // instância reaproveitada acumula um tópico por pedido, para sempre.
    supabaseAdmin.removeChannel(canal);
  }
}

/** O que todo publisher de mudança de pedido tem em mãos após o update. */
interface OrderEventSource {
  id: string;
  userId: string | null;
  status: string;
  deliveryType: string;
  updatedAt: Date;
  estimatedDeliveryAt: Date | null;
}

/**
 * Publica uma mudança de pedido nos três públicos que se importam, de uma vez:
 *
 * - `order:<id>`     — quem está com a tela daquele pedido aberta (tracker)
 * - `kitchen-orders` — a fila do restaurante
 * - `user:<userId>`  — o dono do pedido, para o sino de notificações
 *
 * Existe para os publishers não precisarem lembrar dos três. O canal do dono é
 * o que faltava: sem ele o sino não tinha como saber de uma mudança sem varrer
 * /api/orders de 15 em 15 segundos.
 *
 * Pedido sem dono (mesa/legado) simplesmente não tem o terceiro envio.
 */
export async function broadcastOrderUpdate(
  tenantId: string,
  order: OrderEventSource
): Promise<void> {
  const estimatedDeliveryAt = order.estimatedDeliveryAt?.toISOString() ?? null;
  const updatedAt = order.updatedAt.toISOString();

  const envios = [
    broadcastTenantEvent(tenantId, orderChannel(order.id), "order-updated", {
      status: order.status,
      updatedAt,
      estimatedDeliveryAt,
    }),
    // status e deliveryType vão junto para quem escuta a fila do restaurante
    // conseguir decidir sem consultar: a lista do motoboy só reage a pedido que
    // virou READY/DELIVERY. A cozinha ignora o payload e recarrega de qualquer
    // forma, então incluir campos aqui não quebra nada.
    broadcastTenantEvent(tenantId, KITCHEN_CHANNEL, "order-updated", {
      orderId: order.id,
      status: order.status,
      deliveryType: order.deliveryType,
    }),
  ];

  if (order.userId) {
    envios.push(
      broadcastTenantEvent(tenantId, userChannel(order.userId), "order-updated", {
        orderId: order.id,
        status: order.status,
        deliveryType: order.deliveryType,
        updatedAt,
      })
    );
  }

  await Promise.all(envios);
}
