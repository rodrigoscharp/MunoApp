"use client";

import { useEffect, useRef, useState } from "react";
import type { PointerEvent as ReactPointerEvent } from "react";
import Image from "next/image";
import { Upload, Loader2, MapPin } from "lucide-react";
import { toast } from "sonner";
import { uploadLogo } from "@/lib/upload-logo";
import { relativePosition } from "@/lib/table-map-position";
import type { RestaurantInfo } from "@/lib/restaurant";
import { cn } from "@/lib/utils";
import { botaoBrasa, botaoContorno, cartaoPainel, rotulo, tituloDeSecao } from "@/components/painel/estilos";

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

  const ocupadas = tables.filter((t) => t.openOrdersCount > 0).length;

  if (loading) {
    return <div className={cn(cartaoPainel, "py-12 text-center text-sm text-loja-tinta-2")}>Carregando mapa...</div>;
  }

  if (!floorPlanImageUrl) {
    return (
      <div className={cn(cartaoPainel, "flex flex-col items-center justify-center gap-3 border-[1.5px] border-dashed border-loja-linha px-6 py-16 text-center")}>
        <span className="flex h-16 w-16 items-center justify-center rounded-full bg-loja-pessego-claro text-loja-preco">
          <MapPin size={30} strokeWidth={1.6} aria-hidden="true" />
        </span>
        <p className="text-[15px] font-extrabold text-loja-tinta">Monte o mapa do salão</p>
        <p className="max-w-sm text-sm text-loja-tinta-2">Envie uma foto ou planta do salão para montar o mapa.</p>
        <button
          onClick={() => fileRef.current?.click()}
          disabled={uploading}
          className={cn(botaoBrasa, "mt-1 h-11 text-sm")}
        >
          {uploading ? <Loader2 size={15} className="animate-spin" aria-hidden="true" /> : <Upload size={15} aria-hidden="true" />}
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
      <div className={cn(cartaoPainel, "p-4 sm:p-5")}>
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-col gap-1">
            <h2 className={tituloDeSecao}>Mapa do salão</h2>
            <p className="text-[12.5px] text-loja-tinta-2">Arraste cada mesa até a posição certa no mapa.</p>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <ul aria-label="Legenda" className="flex items-center gap-3 text-[12px] font-bold text-loja-tinta-2">
              <li className="flex items-center gap-1.5">
                <span aria-hidden="true" className="h-2.5 w-2.5 rounded-full bg-forest" />
                {tables.length - ocupadas} livre{tables.length - ocupadas !== 1 ? "s" : ""}
              </li>
              <li className="flex items-center gap-1.5">
                <span aria-hidden="true" className="h-2.5 w-2.5 rounded-full bg-loja-brasa" />
                {ocupadas} ocupada{ocupadas !== 1 ? "s" : ""}
              </li>
            </ul>
            <button
              onClick={() => fileRef.current?.click()}
              disabled={uploading}
              className={cn(botaoContorno, "h-11 px-4 text-[13px]")}
            >
              {uploading ? <Loader2 size={14} className="animate-spin" aria-hidden="true" /> : <Upload size={14} aria-hidden="true" />}
              Trocar planta
            </button>
          </div>
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
          className="relative w-full select-none overflow-hidden rounded-2xl bg-loja-creme"
          style={{ aspectRatio: "4 / 3" }}
        >
          <Image
            src={floorPlanImageUrl}
            alt="Planta do salão"
            fill
            className="pointer-events-none object-contain"
            unoptimized={floorPlanImageUrl.startsWith("http")}
          />
          {placed.map((table) => {
            const occupied = table.openOrdersCount > 0;
            const label = table.name ? `Mesa ${table.number} · ${table.name}` : `Mesa ${table.number}`;
            return (
              <button
                key={table.id}
                onPointerDown={() => setDraggingId(table.id)}
                aria-label={`${label}, ${occupied ? "ocupada" : "livre"}`}
                className={cn(
                  "manchete absolute flex h-11 w-11 touch-none -translate-x-1/2 -translate-y-1/2 cursor-grab items-center justify-center rounded-2xl text-[20px] text-white shadow-loja-alta ring-2 ring-loja-papel transition-colors active:cursor-grabbing",
                  occupied ? "bg-loja-brasa" : "bg-forest",
                  draggingId === table.id && "scale-110"
                )}
                style={{ left: `${(table.posX ?? 0.5) * 100}%`, top: `${(table.posY ?? 0.5) * 100}%` }}
                title={label}
              >
                {table.number}
              </button>
            );
          })}
        </div>
      </div>

      {unplaced.length > 0 && (
        <div className={cn(cartaoPainel, "p-4 sm:p-5")}>
          <p className={cn(rotulo, "mb-3")}>Mesas sem posição no mapa · toque para colocar no centro</p>
          <div className="flex flex-wrap gap-2">
            {unplaced.map((table) => (
              <button
                key={table.id}
                onClick={() => savePosition(table.id, 0.5, 0.5)}
                className="inline-flex h-11 items-center gap-1.5 rounded-full bg-loja-creme px-4 text-[13px] font-bold text-loja-tinta transition hover:bg-loja-pessego-claro"
              >
                <MapPin size={14} className="text-loja-preco" aria-hidden="true" />
                {table.name ? `Mesa ${table.number} · ${table.name}` : `Mesa ${table.number}`}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
