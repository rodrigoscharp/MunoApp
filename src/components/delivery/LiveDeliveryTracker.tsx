"use client";

import dynamic from "next/dynamic";
import { useDeliveryTracking } from "@/hooks/useDeliveryTracking";
import { MapPin, Navigation } from "lucide-react";

const CustomerTrackingMap = dynamic(() => import("./CustomerTrackingMap"), {
  ssr: false,
  loading: () => (
    <div className="h-full bg-neutral-100 flex items-center justify-center text-neutral-400 text-sm">
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
    <div className="bg-white rounded-xl border border-neutral-200 overflow-hidden isolate">
      {/* Header */}
      <div className="px-5 py-4 border-b border-neutral-100 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Navigation size={16} className="text-brand" />
          <span className="font-semibold text-neutral-900">Motoboy a caminho</span>
        </div>
        <span className="flex items-center gap-1.5 text-xs bg-red-50 text-brand px-2.5 py-1 rounded-full font-semibold animate-pulse">
          <span className="w-1.5 h-1.5 bg-brand rounded-full inline-block" />
          Ao vivo
        </span>
      </div>

      {/* Mapa */}
      <div className="h-72 relative">
        {lat && lng ? (
          <CustomerTrackingMap lat={lat} lng={lng} />
        ) : (
          <div className="h-full bg-neutral-50 flex flex-col items-center justify-center text-neutral-400 text-sm gap-2">
            <Navigation size={24} className="animate-pulse" />
            <p>Aguardando localização do motoboy...</p>
          </div>
        )}
      </div>

      {/* Endereço */}
      <div className="px-5 py-4 flex items-start gap-3">
        <MapPin size={16} className="text-brand flex-shrink-0 mt-0.5" />
        <div>
          <p className="text-xs text-neutral-500">Entregando em</p>
          <p className="text-sm font-medium text-neutral-800">{deliveryAddress}</p>
        </div>
      </div>
    </div>
  );
}
