"use client";

import { useState, useTransition, useRef } from "react";
import Image from "next/image";
import { Check, Upload, Loader2 } from "lucide-react";
import { toast } from "sonner";
import type { RestaurantInfo } from "@/lib/restaurant";
import { uploadLogo } from "@/lib/upload-logo";
import { imagemOtimizavel } from "@/lib/imagem-otimizavel";
import { cn } from "@/lib/utils";
import { botaoBrasa, botaoContorno, campo, cartaoPainel } from "@/components/painel/estilos";
import { LogoDoGoogle } from "@/components/loja/AvaliarNoGoogle";
import { normalizarLinkDeAvaliacao } from "@/lib/avaliacao-google";

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
        // A rota devolve os problemas do zod; o primeiro já diz o que corrigir
        // (nome vazio, frase longa, link de avaliação que não é do Google).
        const corpo = await res.json().catch(() => null);
        const motivo = Array.isArray(corpo?.error) ? corpo.error[0]?.message : null;
        toast.error(motivo ?? "Erro ao salvar");
      }
    });
  }

  const campoId = (nome: string) => `restaurante-${nome}`;
  const linkInvalido = !!info.avaliacaoGoogleUrl?.trim() && !normalizarLinkDeAvaliacao(info.avaliacaoGoogleUrl);
  const rotuloDoCampo = "mb-1.5 block text-[13px] font-bold text-loja-tinta";

  return (
    <div className={`${cartaoPainel} p-5 sm:p-6`}>
      <div className="flex flex-col gap-6 md:flex-row md:items-start">
        {/* Logo */}
        <div className="flex items-center gap-4 md:w-56 md:flex-col md:items-start">
          <div className="relative flex h-24 w-24 shrink-0 items-center justify-center overflow-hidden rounded-[18px] border border-loja-linha bg-white">
            <Image
              src={info.logoUrl}
              alt="Logo do restaurante"
              fill
              className="object-contain p-2"
              unoptimized={!imagemOtimizavel(info.logoUrl)}
            />
          </div>
          <div className="flex flex-col gap-2">
            <p className="text-[13px] font-bold text-loja-tinta">Logo do restaurante</p>
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              disabled={uploading}
              className={cn(botaoContorno, "h-11 px-4 text-[13px]")}
            >
              {uploading ? <Loader2 size={15} className="animate-spin" aria-hidden /> : <Upload size={15} aria-hidden />}
              {uploading ? "Enviando..." : "Trocar logo"}
            </button>
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              aria-label="Arquivo da logo"
              className="hidden"
              onChange={(e) => { const f = e.target.files?.[0]; if (f) handleLogoSelected(f); }}
            />
          </div>
        </div>

        <div className="grid min-w-0 flex-1 grid-cols-1 gap-4 sm:grid-cols-2">
          {/* Nome */}
          <div>
            <label htmlFor={campoId("nome")} className={rotuloDoCampo}>Nome do restaurante</label>
            <input
              id={campoId("nome")}
              type="text"
              value={info.name}
              onChange={(e) => change("name", e.target.value)}
              className={campo}
              placeholder="Nome do restaurante"
            />
          </div>

          {/* Telefone */}
          <div>
            <label htmlFor={campoId("telefone")} className={rotuloDoCampo}>Telefone</label>
            <input
              id={campoId("telefone")}
              type="text"
              value={info.phone}
              onChange={(e) => change("phone", e.target.value)}
              className={campo}
              placeholder="(XX) 99999-0000"
            />
          </div>

          {/* Frase */}
          <div className="sm:col-span-2">
            <label htmlFor="restaurante-slogan" className={rotuloDoCampo}>
              Frase do restaurante <span className="font-medium text-loja-tinta-2">(opcional)</span>
            </label>
            <input
              id="restaurante-slogan"
              type="text"
              maxLength={60}
              value={info.slogan ?? ""}
              onChange={(e) => change("slogan", e.target.value)}
              aria-describedby="restaurante-slogan-ajuda"
              className={campo}
              placeholder="Ex.: Hambúrguer de chapa"
            />
            <p id="restaurante-slogan-ajuda" className="mt-1.5 text-[12px] text-loja-tinta-2">
              Aparece embaixo do nome, no topo do cardápio.
            </p>
          </div>

          {/* Endereço */}
          <div className="sm:col-span-2">
            <label htmlFor={campoId("endereco")} className={rotuloDoCampo}>Endereço</label>
            <input
              id={campoId("endereco")}
              type="text"
              value={info.address}
              onChange={(e) => change("address", e.target.value)}
              className={campo}
              placeholder="Rua, número, cidade"
            />
          </div>

          {/* Avaliação no Google */}
          <div className="sm:col-span-2">
            <label htmlFor="restaurante-avaliacao" className={`${rotuloDoCampo} flex items-center gap-1.5`}>
              <LogoDoGoogle className="h-4 w-4" />
              Link de avaliação no Google <span className="font-medium text-loja-tinta-2">(opcional)</span>
            </label>
            <input
              id="restaurante-avaliacao"
              type="url"
              inputMode="url"
              value={info.avaliacaoGoogleUrl ?? ""}
              onChange={(e) => change("avaliacaoGoogleUrl", e.target.value)}
              aria-describedby="restaurante-avaliacao-ajuda"
              aria-invalid={linkInvalido || undefined}
              className={campo}
              placeholder="https://g.page/r/.../review"
            />
            <p
              id="restaurante-avaliacao-ajuda"
              className={cn("mt-1.5 text-[12px]", linkInvalido ? "font-bold text-loja-preco" : "text-loja-tinta-2")}
            >
              {linkInvalido
                ? "Esse endereço não é do Google. Cole o link do botão “Pedir avaliações”."
                : "No Perfil da Empresa no Google, toque em “Pedir avaliações” e copie o link. O botão aparece para o cliente quando o pedido é entregue e na conta da mesa."}
            </p>
          </div>

          <div className="sm:col-span-2 flex justify-end">
            <button
              type="button"
              onClick={save}
              disabled={pending || saved || uploading || linkInvalido}
              className={`${botaoBrasa} h-12 w-full text-[14px] sm:w-auto`}
            >
              {saved ? <><Check size={16} aria-hidden /> Salvo</> : pending ? "Salvando..." : "Salvar informações"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
