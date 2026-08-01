"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { orderChannel, tenantChannelName } from "@/lib/realtime-channel";
import { DeliveryTracking } from "@/types";

/**
 * Posição do motoboy, ao vivo.
 *
 * Antes isto lia a tabela DeliveryTracking direto por postgres_changes com a
 * chave anon. Funcionava só porque essa era a única tabela do app sem RLS — ou
 * seja, ao custo de deixar o GPS de todos os restaurantes legível por qualquer
 * um com a chave pública. Agora escuta o canal Broadcast do tenant, alimentado
 * pelo POST de /api/motoboy/orders/[orderId]/location.
 */
export function useDeliveryTracking(orderId: string, tenantId: string) {
  const [tracking, setTracking] = useState<DeliveryTracking | null>(null);

  useEffect(() => {
    let ativo = true;

    // Posição inicial: o GET já é protegido por canViewOrder.
    fetch(`/api/motoboy/orders/${orderId}/location`)
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (ativo && data) setTracking(data);
      })
      .catch(() => {});

    const channel = supabase
      .channel(tenantChannelName(tenantId, orderChannel(orderId)))
      .on("broadcast", { event: "tracking-updated" }, ({ payload }) => {
        const lat = payload.lat as number;
        const lng = payload.lng as number;
        if (typeof lat !== "number" || typeof lng !== "number") return;

        setTracking((anterior) =>
          anterior
            ? { ...anterior, lat, lng }
            : ({ orderId, lat, lng } as DeliveryTracking)
        );
      })
      .subscribe();

    return () => {
      ativo = false;
      supabase.removeChannel(channel);
    };
  }, [orderId, tenantId]);

  return tracking;
}
