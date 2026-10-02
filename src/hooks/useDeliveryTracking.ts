"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { useTopicoRealtime } from "@/hooks/useTopicoRealtime";
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
export function useDeliveryTracking(orderId: string) {
  const [tracking, setTracking] = useState<DeliveryTracking | null>(null);
  const topic = useTopicoRealtime("order", orderId);

  // Posição inicial: o GET já é protegido por canViewOrder.
  useEffect(() => {
    let ativo = true;

    fetch(`/api/motoboy/orders/${orderId}/location`)
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (ativo && data) setTracking(data);
      })
      .catch(() => {});

    return () => {
      ativo = false;
    };
  }, [orderId]);

  useEffect(() => {
    if (!topic) return;
    const channel = supabase
      .channel(topic)
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
      supabase.removeChannel(channel);
    };
  }, [topic, orderId]);

  return tracking;
}
