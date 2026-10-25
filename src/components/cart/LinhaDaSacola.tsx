"use client";

import Image from "next/image";
import { Minus, Plus, Trash2, UtensilsCrossed } from "lucide-react";
import { formatCurrency } from "@/lib/utils";
import type { CartItem } from "@/types";

/**
 * Uma linha da sacola: foto, nome, observação, subtotal e o passo de
 * quantidade. É a mesma na gaveta do delivery, na da mesa e na página /cart.
 *
 * A estrutura importa para os testes e para o leitor de tela: o nome fica numa
 * coluna própria, e os únicos botões da linha são o menos e o mais, nessa
 * ordem. O menos na última unidade vira lixeira, porque é por ele que o item
 * sai da sacola.
 */
export function LinhaDaSacola({
  item,
  onQuantidade,
  unitarioSempre = false,
}: {
  item: CartItem;
  onQuantidade: (quantidade: number) => void;
  /** Mostra o preço unitário mesmo quando há observação (a página /cart). */
  unitarioSempre?: boolean;
}) {
  const ultima = item.quantity === 1;

  return (
    <div className="flex items-center gap-3 rounded-[18px] bg-loja-papel p-2 pr-1 shadow-loja">
      <Miniatura src={item.imageUrl} />

      <div className="min-w-0 flex-1">
        <p className="truncate text-[14px] font-extrabold leading-tight text-loja-tinta">
          {item.name}
        </p>
        {/* O mesmo item com observações diferentes ocupa linhas próprias (o
            store indexa por cartId); sem a observação, as duas linhas
            pareceriam repetidas. */}
        {item.notes && (
          <p className="mt-0.5 truncate text-[12px] italic text-loja-tinta-2">{item.notes}</p>
        )}
        {(!item.notes || unitarioSempre) && (
          <p className="mt-0.5 text-[12px] text-loja-tinta-2">{formatCurrency(item.price)} cada</p>
        )}
        <p className="mt-0.5 text-[14px] font-extrabold text-loja-preco">
          {formatCurrency(item.price * item.quantity)}
        </p>
      </div>

      <div className="flex shrink-0 items-center rounded-full bg-loja-creme">
        <button
          type="button"
          onClick={() => onQuantidade(item.quantity - 1)}
          aria-label={ultima ? `Remover ${item.name}` : `Diminuir ${item.name}`}
          className="group flex h-11 w-11 items-center justify-center rounded-full"
        >
          <span className="flex h-8 w-8 items-center justify-center rounded-full bg-loja-papel text-loja-tinta shadow-[0_1px_3px_rgba(74,48,28,0.18)] transition group-hover:bg-loja-pessego-claro group-active:scale-90">
            {ultima ? (
              <Trash2 size={14} className="text-loja-preco" aria-hidden="true" />
            ) : (
              <Minus size={14} strokeWidth={2.5} aria-hidden="true" />
            )}
          </span>
        </button>
        <span className="w-5 text-center text-[14px] font-extrabold tabular-nums">
          {item.quantity}
        </span>
        <button
          type="button"
          onClick={() => onQuantidade(item.quantity + 1)}
          aria-label={`Aumentar ${item.name}`}
          className="group flex h-11 w-11 items-center justify-center rounded-full"
        >
          <span className="flex h-8 w-8 items-center justify-center rounded-full bg-loja-brasa text-white transition group-hover:bg-loja-brasa-escura group-active:scale-90">
            <Plus size={14} strokeWidth={2.5} aria-hidden="true" />
          </span>
        </button>
      </div>
    </div>
  );
}

/** A foto do item, ou um prato desenhado quando ele não tem foto. */
export function Miniatura({ src, tamanho = 56 }: { src?: string | null; tamanho?: number }) {
  return (
    <div
      className="relative shrink-0 overflow-hidden rounded-[14px] bg-loja-pessego-claro"
      style={{ width: tamanho, height: tamanho }}
    >
      {src ? (
        <Image src={src} alt="" fill sizes={`${tamanho}px`} className="object-cover" />
      ) : (
        <span className="flex h-full w-full items-center justify-center text-forest/60">
          <UtensilsCrossed size={Math.round(tamanho * 0.36)} strokeWidth={1.6} aria-hidden="true" />
        </span>
      )}
    </div>
  );
}
