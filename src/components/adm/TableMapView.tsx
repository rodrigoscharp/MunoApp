"use client";

import { useEffect, useRef, useState } from "react";
import type { PointerEvent as ReactPointerEvent } from "react";
import Image from "next/image";
import { Upload, Loader2, MapPin } from "lucide-react";
import { toast } from "sonner";
import { uploadLogo } from "@/lib/upload-logo";
import { relativePosition } from "@/lib/table-map-position";
import type { RestaurantInfo } from "@/lib/restaurant";

interface MapTable {
  id: string;
  number: number;
  name: string | null;
  posX: number | null;
  posY: number | null;
  openOrdersCount: number;
}

interface Props {
  tables: MapTable[];
  onPositionChange: (id: string, posX: number, posY: number) => void;
}

export function TableMapView({ tables, onPositionChange }: Props) {
  const [floorPlanImageUrl, setFloorPlanImageUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    fetch("/api/settings/restaurant")
      .then((r) => r.json())
      .then((info: RestaurantInfo) => setFloorPlanImageUrl(info.floorPlanImageUrl ?? null))
      .finally(() => setLoading(false));
  }, []);

  async function handleUpload(file: File) {
    setUploading(true);
    try {
      const url = await uploadLogo(file);
      const res = await fetch("/api/settings/restaurant");
      const info = (await res.json()) as RestaurantInfo;
      await fetch("/api/settings/restaurant", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...info, floorPlanImageUrl: url }),
      });
      setFloorPlanImageUrl(url);
      toast.success("Planta enviada");
    } catch {
      toast.error("Erro ao enviar a planta");
    } finally {
      setUploading(false);
    }
  }

  async function savePosition(id: string, x: number, y: number) {
    onPositionChange(id, x, y);
    await fetch(`/api/tables/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ posX: x, posY: y }),
    });
  }

  function handlePointerMove(e: ReactPointerEvent<HTMLDivElement>) {
    if (!draggingId || !containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const { x, y } = relativePosition(e.clientX, e.clientY, rect);
    onPositionChange(draggingId, x, y);
  }

  function handlePointerUp(e: ReactPointerEvent<HTMLDivElement>) {
    if (!draggingId || !containerRef.current) {
      setDraggingId(null);
      return;
    }
    const rect = containerRef.current.getBoundingClientRect();
    const { x, y } = relativePosition(e.clientX, e.clientY, rect);
    const id = draggingId;
    setDraggingId(null);
    savePosition(id, x, y);
  }

  const placed = tables.filter((t) => t.posX != null && t.posY != null);
  const unplaced = tables.filter((t) => t.posX == null || t.posY == null);

  if (loading) {
    return <div className="text-center py-12 text-neutral-400 text-sm">Carregando mapa...</div>;
  }

  if (!floorPlanImageUrl) {
    return (
      <div className="flex flex-col items-center justify-center py-16 gap-3 text-neutral-400 border border-dashed border-neutral-200 rounded-xl">
        <MapPin size={40} strokeWidth={1.2} />
        <p className="text-sm">Envie uma foto ou planta do salão para montar o mapa.</p>
        <button
          onClick={() => fileRef.current?.click()}
          disabled={uploading}
          className="flex items-center gap-2 bg-brand hover:bg-brand-dark disabled:opacity-50 text-white text-sm font-semibold px-4 py-2 rounded-xl transition"
        >
          {uploading ? <Loader2 size={14} className="animate-spin" /> : <Upload size={14} />}
          {uploading ? "Enviando..." : "Enviar planta"}
        </button>
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) handleUpload(f);
          }}
        />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-xs text-neutral-500">Arraste cada mesa até a posição certa no mapa.</p>
        <button
          onClick={() => fileRef.current?.click()}
          disabled={uploading}
          className="flex items-center gap-1.5 text-xs font-semibold text-neutral-600 border border-neutral-200 rounded-lg px-3 py-1.5 hover:bg-neutral-50 transition disabled:opacity-50"
        >
          {uploading ? <Loader2 size={12} className="animate-spin" /> : <Upload size={12} />}
          Trocar planta
        </button>
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) handleUpload(f);
          }}
        />
      </div>

      <div
        ref={containerRef}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerLeave={handlePointerUp}
        className="relative w-full rounded-xl border border-neutral-200 overflow-hidden bg-neutral-50 select-none"
        style={{ aspectRatio: "4 / 3" }}
      >
        <Image
          src={floorPlanImageUrl}
          alt="Planta do salão"
          fill
          className="object-contain pointer-events-none"
          unoptimized={floorPlanImageUrl.startsWith("http")}
        />
        {placed.map((table) => {
          const occupied = table.openOrdersCount > 0;
          const label = table.name ? `Mesa ${table.number} · ${table.name}` : `Mesa ${table.number}`;
          return (
            <button
              key={table.id}
              onPointerDown={() => setDraggingId(table.id)}
              className={`absolute -translate-x-1/2 -translate-y-1/2 flex items-center justify-center w-9 h-9 rounded-full text-[11px] font-bold text-white shadow-md cursor-grab active:cursor-grabbing transition-colors ${
                occupied ? "bg-amber-500" : "bg-emerald-500"
              }`}
              style={{ left: `${(table.posX ?? 0.5) * 100}%`, top: `${(table.posY ?? 0.5) * 100}%` }}
              title={label}
            >
              {table.number}
            </button>
          );
        })}
      </div>

      {unplaced.length > 0 && (
        <div className="bg-white rounded-xl border border-neutral-200 p-4">
          <p className="text-xs font-medium text-neutral-500 mb-2">Mesas sem posição no mapa</p>
          <div className="flex flex-wrap gap-2">
            {unplaced.map((table) => (
              <button
                key={table.id}
                onClick={() => savePosition(table.id, 0.5, 0.5)}
                className="flex items-center gap-1.5 text-xs font-semibold text-neutral-600 border border-neutral-200 rounded-lg px-3 py-1.5 hover:bg-neutral-50 transition"
              >
                <MapPin size={12} />
                {table.name ? `Mesa ${table.number} · ${table.name}` : `Mesa ${table.number}`}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
