"use client";

import { useState, useTransition, useRef } from "react";
import Image from "next/image";
import { Store, Check, Upload, Loader2 } from "lucide-react";
import { toast } from "sonner";
import type { RestaurantInfo } from "@/lib/restaurant";
import { uploadLogo } from "@/lib/upload-logo";

interface Props {
  initial: RestaurantInfo;
}

export function RestaurantInfoControl({ initial }: Props) {
  const [info, setInfo] = useState<RestaurantInfo>(initial);
  const [saved, setSaved] = useState(false);
  const [pending, startTransition] = useTransition();
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  function change(field: keyof RestaurantInfo, value: string) {
    setInfo((prev) => ({ ...prev, [field]: value }));
    setSaved(false);
  }

  async function handleLogoSelected(file: File) {
    setUploading(true);
    try {
      const url = await uploadLogo(file);
      setInfo((prev) => ({ ...prev, logoUrl: url }));
      setSaved(false);
      toast.success("Logo carregada");
    } catch {
      toast.error("Erro ao enviar imagem");
    } finally {
      setUploading(false);
    }
  }

  async function save() {
    startTransition(async () => {
      const res = await fetch("/api/settings/restaurant", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(info),
      });
      if (res.ok) {
        setSaved(true);
        toast.success("Informações do restaurante salvas");
      } else {
        toast.error("Erro ao salvar");
      }
    });
  }

  return (
    <div className="bg-white rounded-xl border border-neutral-200 p-5 space-y-4">
      <div className="flex items-center gap-2 mb-1">
        <Store size={15} className="text-neutral-400" />
        <p className="text-xs text-neutral-400 font-medium uppercase tracking-wide">
          Informações do Restaurante
        </p>
      </div>

      {/* Logo */}
      <div className="flex items-center gap-4">
        <div className="relative w-20 h-20 rounded-xl border border-neutral-200 bg-neutral-50 overflow-hidden flex items-center justify-center shrink-0">
          <Image
            src={info.logoUrl}
            alt="Logo"
            fill
            className="object-contain p-2"
            unoptimized={info.logoUrl.startsWith("http")}
          />
        </div>
        <div className="flex-1">
          <p className="text-xs font-medium text-neutral-700 mb-1.5">Logo do restaurante</p>
          <button
            onClick={() => fileRef.current?.click()}
            disabled={uploading}
            className="flex items-center gap-2 text-xs px-3 py-1.5 rounded-lg border border-neutral-200 text-neutral-600 hover:bg-neutral-50 disabled:opacity-50 transition"
          >
            {uploading ? <Loader2 size={12} className="animate-spin" /> : <Upload size={12} />}
            {uploading ? "Enviando..." : "Trocar logo"}
          </button>
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(e) => { const f = e.target.files?.[0]; if (f) handleLogoSelected(f); }}
          />
        </div>
      </div>

      {/* Nome */}
      <div>
        <label className="text-xs font-medium text-neutral-700 block mb-1.5">Nome do restaurante</label>
        <input
          type="text"
          value={info.name}
          onChange={(e) => change("name", e.target.value)}
          className="w-full border border-neutral-200 rounded-lg px-3 py-2 text-sm text-neutral-800 focus:outline-none focus:ring-2 focus:ring-brand/30"
          placeholder="Nome do restaurante"
        />
      </div>

      {/* Endereço */}
      <div>
        <label className="text-xs font-medium text-neutral-700 block mb-1.5">Endereço</label>
        <input
          type="text"
          value={info.address}
          onChange={(e) => change("address", e.target.value)}
          className="w-full border border-neutral-200 rounded-lg px-3 py-2 text-sm text-neutral-800 focus:outline-none focus:ring-2 focus:ring-brand/30"
          placeholder="Rua, número, cidade"
        />
      </div>

      {/* Telefone */}
      <div>
        <label className="text-xs font-medium text-neutral-700 block mb-1.5">Telefone</label>
        <input
          type="text"
          value={info.phone}
          onChange={(e) => change("phone", e.target.value)}
          className="w-full border border-neutral-200 rounded-lg px-3 py-2 text-sm text-neutral-800 focus:outline-none focus:ring-2 focus:ring-brand/30"
          placeholder="(XX) 99999-0000"
        />
      </div>

      <button
        onClick={save}
        disabled={pending || saved || uploading}
        className="w-full flex items-center justify-center gap-2 bg-brand hover:bg-brand-dark disabled:opacity-50 disabled:cursor-not-allowed text-white font-semibold py-2.5 rounded-lg text-sm transition"
      >
        {saved ? <><Check size={14} /> Salvo</> : pending ? "Salvando..." : "Salvar informações"}
      </button>
    </div>
  );
}
