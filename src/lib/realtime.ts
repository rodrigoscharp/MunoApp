import { supabaseAdmin } from "@/lib/supabase-admin";
import { tenantChannelName } from "@/lib/realtime-channel";

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
  await supabaseAdmin.channel(tenantChannelName(tenantId, channel)).send({
    type: "broadcast",
    event,
    payload,
  });
}
