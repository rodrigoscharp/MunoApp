"use client";

import { useEffect } from "react";
import { MapContainer, TileLayer, Marker, useMap } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import marcador from "leaflet/dist/images/marker-icon.png";
import marcador2x from "leaflet/dist/images/marker-icon-2x.png";
import sombraDoMarcador from "leaflet/dist/images/marker-shadow.png";

// Corrige ícone padrão do Leaflet no Next.js
delete (L.Icon.Default.prototype as unknown as Record<string, unknown>)._getIconUrl;
// Os PNGs do próprio pacote, empacotados pelo build: mesma origem, com hash
// no nome e cache longo. Antes vinham do unpkg, uma origem a mais para o
// celular resolver no meio do mapa e uma versão fixa que não acompanhava a
// do leaflet instalado.
L.Icon.Default.mergeOptions({
  iconRetinaUrl: marcador2x.src,
  iconUrl: marcador.src,
  shadowUrl: sombraDoMarcador.src,
});

const motoboyIcon = L.divIcon({
  html: `<div style="background:#ef4444;width:36px;height:36px;border-radius:50%;display:flex;align-items:center;justify-content:center;border:3px solid white;box-shadow:0 2px 8px rgba(0,0,0,0.4);font-size:18px;">🛵</div>`,
  className: "",
  iconSize: [36, 36],
  iconAnchor: [18, 18],
});

function RecenterMap({ lat, lng }: { lat: number; lng: number }) {
  const map = useMap();
  useEffect(() => {
    map.setView([lat, lng], map.getZoom());
  }, [lat, lng, map]);
  return null;
}

export default function MotoboyMap({ lat, lng }: { lat: number; lng: number }) {
  return (
    <MapContainer
      center={[lat, lng]}
      zoom={16}
      style={{ height: "100%", width: "100%" }}
      zoomControl={false}
    >
      <TileLayer
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
      />
      <Marker position={[lat, lng]} icon={motoboyIcon} />
      <RecenterMap lat={lat} lng={lng} />
    </MapContainer>
  );
}
