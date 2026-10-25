"use client";

import { useState, useTransition } from "react";
import { Megaphone, Check, ImageOff } from "lucide-react";
import { toast } from "sonner";
import { formatCurrency } from "@/lib/utils";

export interface ItemParaBanner {
  id: string;
  name: string;
  price: number;
  imageUrl: string | null;
  imagemRecortadaUrl: string | null;
}

interface Config {
  modo: "mais-vendido" | "item";
  itemId: string | null;
  chamada: string;
}

/**
 * O banner do topo do cardápio. Sem mexer em nada ele já funciona: mostra o
 * mais vendido dos últimos 30 dias, com o dia da semana, o nome e o preço.
 * Aqui o dono só escolhe empurrar outro item (lançamento, promoção) e,
 * se quiser, a chamada que vai junto do dia.
 */
export function BannerControl({ initial, itens }: { initial: Config; itens: ItemParaBanner[] }) {
  const [config, setConfig] = useState<Config>(initial);
  const [saved, setSaved] = useState(false);
  const [pending, startTransition] = useTransition();

  const escolhido = itens.find((i) => i.id === config.itemId) ?? null;

  function mudar(parcial: Partial<Config>) {
    setConfig((c) => ({ ...c, ...parcial }));
    setSaved(false);
  }

  function salvar() {
    if (config.modo === "item" && !config.itemId) {
      toast.error("Escolha o item do banner");
      return;
    }
    startTransition(async () => {
      const res = await fetch("/api/settings/banner", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(config),
      });
      if (res.ok) {
        setSaved(true);
        toast.success("Banner atualizado no cardápio");
      } else {
        const json = await res.json().catch(() => ({}));
        toast.error(json.error?.[0]?.message ?? "Erro ao salvar");
      }
    });
  }

  return (
    <div className="bg-white rounded-xl border border-neutral-200 p-5">
      <div className="flex items-center gap-2 mb-1">
        <Megaphone size={15} className="text-neutral-400" aria-hidden="true" />
        <h2 className="text-xs text-neutral-400 font-medium uppercase tracking-wide">Banner do cardápio</h2>
      </div>
      <p className="text-xs text-neutral-500 mb-4">
        O destaque no topo do cardápio, com o dia da semana, o nome e o preço do item.
      </p>

      <fieldset className="space-y-2">
        <legend className="sr-only">O que aparece no banner</legend>
        <label className="flex cursor-pointer items-start gap-3 rounded-lg border border-neutral-200 p-3 has-[:checked]:border-brand has-[:checked]:bg-brand-light">
          <input
            type="radio"
            name="modo-banner"
            checked={config.modo === "mais-vendido"}
            onChange={() => mudar({ modo: "mais-vendido" })}
            className="mt-0.5 accent-[#BF5321]"
          />
          <span className="text-sm text-neutral-800">
            <strong className="font-semibold">Mais vendido, automático</strong>
            <span className="block text-xs text-neutral-500">
              O item que mais saiu nos últimos 30 dias. Troca sozinho conforme as vendas.
            </span>
          </span>
        </label>
        <label className="flex cursor-pointer items-start gap-3 rounded-lg border border-neutral-200 p-3 has-[:checked]:border-brand has-[:checked]:bg-brand-light">
          <input
            type="radio"
            name="modo-banner"
            checked={config.modo === "item"}
            onChange={() => mudar({ modo: "item", itemId: config.itemId ?? itens[0]?.id ?? null })}
            className="mt-0.5 accent-[#BF5321]"
          />
          <span className="text-sm text-neutral-800">
            <strong className="font-semibold">Escolher um item</strong>
            <span className="block text-xs text-neutral-500">
              Para lançamento ou promoção. Se ele esgotar, o banner volta sozinho para o mais vendido.
            </span>
          </span>
        </label>
      </fieldset>

      {config.modo === "item" && (
        <div className="mt-4 space-y-3">
          <div>
            <label htmlFor="banner-item" className="text-xs font-medium text-neutral-700 block mb-1.5">
              Item do banner
            </label>
            <select
              id="banner-item"
              value={config.itemId ?? ""}
              onChange={(e) => mudar({ itemId: e.target.value || null })}
              className="w-full border border-neutral-200 rounded-lg px-3 py-2 text-sm text-neutral-800 focus:outline-none focus:ring-2 focus:ring-brand/30"
            >
              <option value="">Selecione…</option>
              {itens.map((i) => (
                <option key={i.id} value={i.id}>
                  {i.name} · {formatCurrency(i.price)}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="banner-chamada" className="text-xs font-medium text-neutral-700 block mb-1.5">
              Chamada <span className="font-normal text-neutral-400">(opcional)</span>
            </label>
            <input
              id="banner-chamada"
              type="text"
              maxLength={24}
              value={config.chamada}
              onChange={(e) => mudar({ chamada: e.target.value })}
              placeholder="Ex.: Lançamento"
              className="w-full border border-neutral-200 rounded-lg px-3 py-2 text-sm text-neutral-800 focus:outline-none focus:ring-2 focus:ring-brand/30"
            />
            <p className="mt-1 text-[11px] text-neutral-400">
              Aparece depois do dia: &quot;SEXTA · {(config.chamada || "Destaque da casa").toUpperCase()}&quot;.
            </p>
          </div>
          {escolhido && !escolhido.imagemRecortadaUrl && (
            <p className="flex items-start gap-2 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800">
              <ImageOff size={14} className="mt-0.5 shrink-0" aria-hidden="true" />
              Este item ainda não tem foto sem fundo, então aparece no banner com moldura. Em Cardápio, abra o item e use &quot;Remover fundo da foto&quot; ou envie um PNG sem fundo.
            </p>
          )}
        </div>
      )}

      <button
        onClick={salvar}
        disabled={pending || saved}
        className="mt-4 w-full flex items-center justify-center gap-2 py-2 rounded-lg bg-brand text-white text-sm font-medium hover:bg-brand-dark disabled:opacity-50 transition"
      >
        {saved ? (
          <>
            <Check size={14} aria-hidden="true" /> Salvo
          </>
        ) : pending ? (
          "Salvando..."
        ) : (
          "Salvar banner"
        )}
      </button>
    </div>
  );
}
