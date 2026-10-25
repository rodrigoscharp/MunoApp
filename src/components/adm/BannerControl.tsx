"use client";

import { useState, useTransition } from "react";
import Image from "next/image";
import { Check, ImageOff, AlertTriangle, ArrowRight } from "lucide-react";
import { toast } from "sonner";
import { cn, formatCurrency } from "@/lib/utils";
import { imagemOtimizavel } from "@/lib/imagem-otimizavel";
import { chamadaDoBanner } from "@/lib/loja/banner-regras";
import { precoCurto } from "@/components/loja/preco";
import { Raminho } from "@/components/loja/Raminho";
import { botaoBrasa, campo, cartaoPainel, kicker, rotulo, tituloDeSecao } from "@/components/painel/estilos";

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

/** O que a loja mostra quando o dono não escolhe: o mais vendido, ou um item da casa sem venda no mês. */
export interface BannerAutomatico {
  item: ItemParaBanner;
  modo: "mais-vendido" | "destaque";
}

/**
 * O banner do topo do cardápio. Sem mexer em nada ele já funciona: mostra o
 * mais vendido dos últimos 30 dias, com o dia da semana, o nome e o preço.
 * Aqui o dono só escolhe empurrar outro item (lançamento, promoção) e,
 * se quiser, a chamada que vai junto do dia.
 */
export function BannerControl({
  initial,
  itens,
  nomeDoItemSalvo = null,
  automatico = null,
  agora,
}: {
  initial: Config;
  /** Só os itens disponíveis: é o que o banner pode mostrar. */
  itens: ItemParaBanner[];
  /** O nome do item gravado, quando ele não está em `itens` (esgotou). */
  nomeDoItemSalvo?: string | null;
  /** O item do modo automático, para a prévia. */
  automatico?: BannerAutomatico | null;
  /** A hora da requisição, em ISO: servidor e navegador montam o mesmo dia na prévia. */
  agora?: string;
}) {
  // O item gravado pode ter esgotado ou sido apagado. A lista só tem os
  // disponíveis, e o select mostrava "Selecione…" com o id velho guardado no
  // estado: "Salvar" regravava um item que o banner já não mostra, sem o dono
  // saber. O id velho sai do estado e o aviso diz o que aconteceu.
  const salvoSumiu = initial.modo === "item" && !!initial.itemId && !itens.some((i) => i.id === initial.itemId);
  const [config, setConfig] = useState<Config>(salvoSumiu ? { ...initial, itemId: null } : initial);
  const [avisoDoSalvo, setAvisoDoSalvo] = useState(salvoSumiu);
  const [saved, setSaved] = useState(false);
  const [pending, startTransition] = useTransition();

  const escolhido = itens.find((i) => i.id === config.itemId) ?? null;

  function mudar(parcial: Partial<Config>) {
    setConfig((c) => ({ ...c, ...parcial }));
    setSaved(false);
    if (parcial.itemId || parcial.modo === "mais-vendido") setAvisoDoSalvo(false);
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

  // A prévia segue a mesma regra da loja (escolherItemDoBanner): o item
  // escolhido, se houver um; senão, o automático.
  const hoje = agora ? new Date(agora) : new Date();
  const previa =
    config.modo === "item" && escolhido
      ? { item: escolhido, chamada: chamadaDoBanner(config, "item", hoje) }
      : automatico
        ? { item: automatico.item, chamada: chamadaDoBanner(config, automatico.modo, hoje) }
        : null;

  const opcao =
    "flex min-h-11 cursor-pointer items-start gap-3 rounded-2xl border-[1.5px] border-loja-linha bg-loja-papel p-3.5 transition has-[:checked]:border-forest-dark has-[:checked]:bg-loja-folha has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-brand";

  return (
    <section aria-labelledby="titulo-banner" className={cn(cartaoPainel, "flex flex-col gap-4 p-5")}>
      <div>
        <h2 id="titulo-banner" className={tituloDeSecao}>
          Banner do cardápio
        </h2>
        <p className="mt-0.5 text-[13px] text-loja-tinta-2">
          O destaque no topo do cardápio, com o dia da semana, o nome e o preço do item.
        </p>
      </div>

      <PreviaDoBanner previa={previa} />

      <fieldset className="space-y-2">
        <legend className="sr-only">O que aparece no banner</legend>
        <label className={opcao}>
          <input
            type="radio"
            name="modo-banner"
            checked={config.modo === "mais-vendido"}
            onChange={() => mudar({ modo: "mais-vendido" })}
            className="mt-0.5 h-[18px] w-[18px] shrink-0 accent-[#1E3D2F]"
          />
          <span className="text-[14px] text-loja-tinta">
            <strong className="font-extrabold">Mais vendido, automático</strong>
            <span className="mt-0.5 block text-[12.5px] text-loja-tinta-2">
              O item que mais saiu nos últimos 30 dias. Troca sozinho conforme as vendas.
            </span>
          </span>
        </label>
        <label className={opcao}>
          <input
            type="radio"
            name="modo-banner"
            checked={config.modo === "item"}
            onChange={() => mudar({ modo: "item", itemId: config.itemId ?? itens[0]?.id ?? null })}
            className="mt-0.5 h-[18px] w-[18px] shrink-0 accent-[#1E3D2F]"
          />
          <span className="text-[14px] text-loja-tinta">
            <strong className="font-extrabold">Escolher um item</strong>
            <span className="mt-0.5 block text-[12.5px] text-loja-tinta-2">
              Para lançamento ou promoção. Se ele esgotar, o banner volta sozinho para o mais vendido.
            </span>
          </span>
        </label>
      </fieldset>

      {avisoDoSalvo && (
        <p role="status" className="flex items-start gap-2 rounded-2xl bg-loja-pessego-claro px-3.5 py-3 text-[12.5px] font-semibold text-[#8A3A12]">
          <AlertTriangle size={15} className="mt-0.5 shrink-0" aria-hidden="true" />
          <span>
            {nomeDoItemSalvo
              ? `O item escolhido (${nomeDoItemSalvo}) está indisponível no cardápio.`
              : "O item escolhido não está mais no cardápio."}{" "}
            Enquanto isso, o banner mostra o automático. Escolha outro item ou volte ao mais vendido.
          </span>
        </p>
      )}

      {config.modo === "item" && (
        <div className="space-y-3">
          <div>
            <label htmlFor="banner-item" className={cn(rotulo, "mb-1.5 block text-[13px]")}>
              Item do banner
            </label>
            <select
              id="banner-item"
              value={config.itemId ?? ""}
              onChange={(e) => mudar({ itemId: e.target.value || null })}
              className={cn(campo, "h-[50px] py-0")}
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
            <label htmlFor="banner-chamada" className={cn(rotulo, "mb-1.5 block text-[13px]")}>
              Chamada <span className="font-normal">(opcional)</span>
            </label>
            <input
              id="banner-chamada"
              type="text"
              maxLength={24}
              value={config.chamada}
              onChange={(e) => mudar({ chamada: e.target.value })}
              placeholder="Ex.: Lançamento"
              className={campo}
            />
            <p className="mt-1.5 text-[12px] text-loja-tinta-2">Aparece depois do dia, até 24 letras.</p>
          </div>
          {escolhido && !escolhido.imagemRecortadaUrl && (
            <p className="flex items-start gap-2 rounded-2xl bg-loja-pessego-claro px-3.5 py-3 text-[12.5px] font-semibold text-[#8A3A12]">
              <ImageOff size={15} className="mt-0.5 shrink-0" aria-hidden="true" />
              <span>
                Este item ainda não tem foto sem fundo, então aparece no banner com moldura. Em Cardápio, abra o item e use &quot;Remover fundo da foto&quot; ou envie um PNG sem fundo.
              </span>
            </p>
          )}
        </div>
      )}

      <button
        onClick={salvar}
        disabled={pending || saved}
        className={cn(botaoBrasa, "h-12 w-full text-[14px] font-extrabold")}
      >
        {saved ? (
          <>
            <Check size={15} aria-hidden="true" /> Salvo
          </>
        ) : pending ? (
          "Salvando..."
        ) : (
          "Salvar banner"
        )}
      </button>
    </section>
  );
}

/**
 * O banner como a loja vai mostrar, no mesmo desenho de BannerDestaque: com
 * recorte, o lanche sai do banner sem moldura; sem ele, a foto vai numa
 * moldura inclinada. O "Pedir agora" aqui é só desenho, não botão.
 */
function PreviaDoBanner({ previa }: { previa: { item: ItemParaBanner; chamada: string } | null }) {
  if (!previa) {
    return (
      <p className="rounded-[20px] bg-loja-creme px-4 py-5 text-[13px] text-loja-tinta-2">
        Nenhum item disponível no cardápio: o banner só aparece quando houver um.
      </p>
    );
  }
  const { item, chamada } = previa;
  const recorte = item.imagemRecortadaUrl;

  return (
    <figure aria-label="Prévia do banner na loja" className="flex flex-col gap-2">
      <div className="relative min-h-[172px] overflow-hidden rounded-[24px] bg-loja-pessego">
        <Raminho className="absolute -top-4 left-[38%] h-32 w-32 text-[#C9A685] opacity-80" />
        {recorte ? (
          <div className="pointer-events-none absolute -right-6 top-1/2 h-[190px] w-[190px] -translate-y-1/2">
            <Image
              src={recorte}
              unoptimized={!imagemOtimizavel(recorte)}
              alt=""
              fill
              sizes="190px"
              className="object-contain drop-shadow-[0_18px_22px_rgba(74,48,28,0.35)]"
            />
          </div>
        ) : (
          item.imageUrl && (
            <div className="absolute -right-3 top-1/2 h-[140px] w-[140px] -translate-y-1/2 rotate-[4deg] overflow-hidden rounded-[24px] bg-loja-pessego-claro shadow-loja-alta">
              <Image
                src={item.imageUrl}
                unoptimized={!imagemOtimizavel(item.imageUrl)}
                alt=""
                fill
                sizes="140px"
                className="object-cover"
              />
            </div>
          )
        )}
        <div className={cn("relative flex flex-col gap-2 p-[18px]", (recorte || item.imageUrl) && "max-w-[60%]")}>
          <span className={`${kicker} text-[#6A3A1E]`}>{chamada}</span>
          <p className="manchete text-[1.9rem] text-forest-dark">
            <span className="line-clamp-2">{item.name}</span>
            <span className="block">por {precoCurto(item.price)}</span>
          </p>
          <span aria-hidden="true" className={cn(botaoBrasa, "mt-1 h-10 self-start px-4 text-[12.5px] pointer-events-none")}>
            Pedir agora
            <ArrowRight size={14} strokeWidth={2.6} />
          </span>
        </div>
      </div>
      <figcaption className="text-[12px] text-loja-tinta-2">
        Prévia: é assim que o banner aparece hoje no topo do cardápio.
      </figcaption>
    </figure>
  );
}
