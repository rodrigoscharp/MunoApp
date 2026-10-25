"use client";

import dynamic from "next/dynamic";
import { useDeliveryTracking } from "@/hooks/useDeliveryTracking";
import { MapPin, Navigation } from "lucide-react";
import { cartao } from "@/components/loja/estilos";

const CustomerTrackingMap = dynamic(() => import("./CustomerTrackingMap"), {
  ssr: false,
  loading: () => (
    <div className="flex h-full items-center justify-center bg-loja-creme text-sm text-loja-tinta-2">
      Carregando mapa...
    </div>
  ),
});

interface Props {
  orderId: string;
  deliveryAddress: string;
  initialLat?: number | null;
  initialLng?: number | null;
}

export function LiveDeliveryTracker({
  orderId,
  deliveryAddress,
  initialLat,
  initialLng,
}: Props) {
  const tracking = useDeliveryTracking(orderId);

  const lat = tracking?.lat ?? initialLat ?? null;
  const lng = tracking?.lng ?? initialLng ?? null;

  return (
    <section
      aria-labelledby="titulo-mapa"
      className={`${cartao} isolate overflow-hidden`}
    >
      {/* Header */}
      <div className="flex items-center justify-between gap-3 px-4 py-3">
        <div className="flex items-center gap-2.5">
          <span
            aria-hidden="true"
            className="flex h-9 w-9 items-center justify-center rounded-full bg-loja-pessego text-brand"
          >
            <Navigation size={16} />
          </span>
          <h2 id="titulo-mapa" className="text-sm font-extrabold text-loja-tinta">
            Motoboy a caminho
          </h2>
        </div>
        <span className="flex h-7 items-center gap-1.5 rounded-full bg-loja-folha px-2.5 text-[11px] font-extrabold uppercase tracking-wider text-forest-dark">
          <span aria-hidden="true" className="inline-block h-1.5 w-1.5 rounded-full bg-forest motion-safe:animate-pulse" />
          Ao vivo
        </span>
      </div>

      {/* Mapa */}
      <div className="relative h-72 border-y border-loja-linha">
        {lat && lng ? (
          <CustomerTrackingMap lat={lat} lng={lng} />
        ) : (
          <div className="flex h-full flex-col items-center justify-center gap-2 bg-loja-creme text-sm text-loja-tinta-2">
            <Navigation size={24} aria-hidden="true" className="text-brand motion-safe:animate-pulse" />
            <p>Aguardando localização do motoboy...</p>
          </div>
        )}
      </div>

      {/* Endereço */}
      <div className="flex items-center gap-3 px-4 py-3">
        <span
          aria-hidden="true"
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-loja-pessego text-brand"
        >
          <MapPin size={16} />
        </span>
        <div className="min-w-0">
          <p className="text-xs text-loja-tinta-2">Entregando em</p>
          <p className="text-[13px] font-extrabold leading-snug text-loja-tinta">{deliveryAddress}</p>
        </div>
      </div>
    </section>
  );
}
