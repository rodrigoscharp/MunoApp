"use client";

import Image from "next/image";
import { imagemOtimizavel } from "@/lib/imagem-otimizavel";
import { X, Plus, Minus } from "lucide-react";
import { useState, useEffect, useRef, useId } from "react";
import { formatCurrency } from "@/lib/utils";
import { Raminho } from "@/components/loja/Raminho";
import { botaoBrasa, campo } from "@/components/loja/estilos";
import { precoCurto } from "@/components/loja/preco";
import type { ItemDaVitrine } from "@/components/loja/tipos";

interface Props {
  item: ItemDaVitrine;
  onConfirm: (notes: string, quantity: number) => void;
  onClose: () => void;
  /**
   * "Combina com": até dois outros itens (os mais pedidos), que entram na
   * sacola com um toque, sem fechar a folha. Sem a prop, a seção não aparece.
   */
  combinaCom?: ItemDaVitrine[];
  onAdicionarCombinacao?: (item: ItemDaVitrine, origem: HTMLElement) => void;
  /** Selo acima do nome ("O mais pedido"). */
  selo?: string;
}

/** A duração da saída. A transição do CSS abaixo dura 300ms; a folha sai em 280. */
const SAIDA_MS = 280;

function SemFoto({ className }: { className?: string }) {
  return (
    <svg aria-hidden="true" className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
    </svg>
  );
}

export function AddToCartModal({ item, onConfirm, onClose, combinaCom, onAdicionarCombinacao, selo }: Props) {
  const [notes, setNotes] = useState("");
  const [quantity, setQuantity] = useState(1);
  const [visible, setVisible] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const folhaRef = useRef<HTMLDivElement>(null);
  const tituloId = useId();
  const notasId = useId();

  // Entra no quadro seguinte, para a transição partir de translateY(100%).
  useEffect(() => {
    requestAnimationFrame(() => setVisible(true));
    // O foco vai para a folha, e não para a observação: no celular, focar o
    // campo abriria o teclado por cima da foto.
    folhaRef.current?.focus();
    const overflowAntes = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = overflowAntes;
    };
  }, []);

  function handleClose() {
    setVisible(false);
    setTimeout(onClose, SAIDA_MS);
  }

  function handleConfirm() {
    setVisible(false);
    setTimeout(() => onConfirm(notes.trim(), quantity), SAIDA_MS);
  }

  // Esc fecha, como em qualquer diálogo.
  useEffect(() => {
    function aoTeclar(e: KeyboardEvent) {
      if (e.key === "Escape") {
        setVisible(false);
        setTimeout(onClose, SAIDA_MS);
      }
    }
    document.addEventListener("keydown", aoTeclar);
    return () => document.removeEventListener("keydown", aoTeclar);
  }, [onClose]);

  function handleBackdrop(e: React.MouseEvent) {
    if (e.target === e.currentTarget) handleClose();
  }

  const combinacoes = (combinaCom ?? []).filter((c) => c.id !== item.id && c.available).slice(0, 2);

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center"
      onClick={handleBackdrop}
    >
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 bg-loja-tinta/50 transition-opacity duration-300"
        style={{ opacity: visible ? 1 : 0 }}
      />

      <div
        ref={folhaRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={tituloId}
        tabIndex={-1}
        className="relative flex max-h-[92dvh] w-full flex-col overflow-hidden rounded-t-[30px] bg-loja-creme shadow-loja-alta outline-none transition-transform duration-300 ease-out sm:max-w-md sm:rounded-[30px]"
        style={{ transform: visible ? "translateY(0)" : "translateY(100%)" }}
      >
        <div className="flex-1 overflow-y-auto overscroll-contain">
          {/* A foto sobre o pêssego, numa moldura arredondada. Sem mistura
              "multiplicar": foto de restaurante chega com qualquer fundo, e a
              mistura tingiria um fundo colorido junto com o prato. */}
          <div className="relative h-60 shrink-0 overflow-hidden bg-loja-pessego">
            <Raminho className="absolute -left-8 top-10 h-40 w-40 text-[#C9A685] opacity-90" />
            <div className="absolute left-1/2 top-5 h-[11.5rem] w-[11.5rem] -translate-x-1/2 overflow-hidden rounded-[28px] bg-loja-pessego-claro shadow-loja-alta">
              {item.imageUrl ? (
                <Image src={item.imageUrl}
            unoptimized={!imagemOtimizavel(item.imageUrl)} alt={item.name} fill sizes="184px" className="object-cover" />
              ) : (
                <div className="flex h-full w-full items-center justify-center text-loja-tinta-2/50">
                  <SemFoto className="h-12 w-12" />
                </div>
              )}
            </div>
            <button
              type="button"
              onClick={handleClose}
              aria-label="Fechar"
              className="absolute right-3 top-3 flex h-11 w-11 items-center justify-center rounded-full bg-loja-papel text-loja-tinta shadow-loja transition hover:bg-white"
            >
              <X size={20} aria-hidden="true" />
            </button>
          </div>

          <div className="relative -mt-6 space-y-4 rounded-t-[30px] bg-loja-creme px-5 pb-5 pt-5">
            <div className="space-y-1.5">
              {selo && (
                <span className="inline-flex h-6 items-center rounded-full bg-forest-dark px-2.5 text-[11px] font-bold text-white">
                  {selo}
                </span>
              )}
              <div className="flex items-end justify-between gap-3">
                <h2 id={tituloId} className="manchete text-[2.5rem] text-forest-dark">
                  {item.name}
                </h2>
                <span className="manchete shrink-0 text-[1.9rem] leading-none text-loja-preco">
                  {precoCurto(item.price)}
                </span>
              </div>
              {item.description && (
                <p className="text-[13.5px] leading-relaxed text-loja-tinta-2">{item.description}</p>
              )}
            </div>

            <div>
              <label htmlFor={notasId} className="mb-2 block text-[13px] font-extrabold text-loja-tinta">
                Alguma observação?
              </label>
              <textarea
                id={notasId}
                ref={textareaRef}
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Ex: sem cebola, ponto bem passado..."
                rows={2}
                maxLength={120}
                className={`${campo} resize-none text-sm`}
              />
            </div>

            {combinacoes.length > 0 && onAdicionarCombinacao && (
              <div className="space-y-2">
                <p className="text-[13px] font-extrabold text-loja-tinta">Combina com</p>
                <div className="flex gap-2">
                  {combinacoes.map((c) => (
                    <button
                      key={c.id}
                      type="button"
                      onClick={(e) => onAdicionarCombinacao(c, e.currentTarget)}
                      aria-label={`Adicionar ${c.name} à sacola, ${formatCurrency(c.price)}`}
                      className="flex min-h-[58px] flex-1 items-center gap-2 rounded-2xl bg-loja-papel p-1.5 pr-2 text-left shadow-loja transition hover:bg-white active:scale-[0.98]"
                    >
                      <span className="relative h-12 w-12 shrink-0 overflow-hidden rounded-xl bg-loja-pessego-claro">
                        {c.imageUrl ? (
                          <Image src={c.imageUrl}
            unoptimized={!imagemOtimizavel(c.imageUrl)} alt="" fill sizes="48px" className="object-cover" />
                        ) : (
                          <SemFoto className="m-3 h-6 w-6 text-loja-tinta-2/50" />
                        )}
                      </span>
                      <span className="flex min-w-0 flex-col text-xs font-bold text-loja-tinta">
                        <span className="truncate">{c.name}</span>
                        <span className="font-extrabold text-loja-preco">+ {precoCurto(c.price)}</span>
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>

        <div className="flex shrink-0 items-center gap-2.5 bg-loja-creme px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-3 shadow-[0_-12px_24px_-12px_rgba(74,48,28,0.18)]">
          <div className="flex h-14 items-center rounded-full bg-loja-papel shadow-loja">
            <button
              type="button"
              onClick={() => setQuantity((q) => Math.max(1, q - 1))}
              disabled={quantity <= 1}
              aria-label="Diminuir quantidade"
              className="flex h-14 w-12 items-center justify-center rounded-l-full text-loja-tinta transition hover:text-loja-preco disabled:opacity-40"
            >
              <Minus size={18} strokeWidth={2.5} aria-hidden="true" />
            </button>
            <span aria-live="polite" aria-label={`Quantidade: ${quantity}`} className="w-6 text-center text-base font-extrabold tabular-nums">
              {quantity}
            </span>
            <button
              type="button"
              onClick={() => setQuantity((q) => q + 1)}
              aria-label="Aumentar quantidade"
              className="flex h-14 w-12 items-center justify-center rounded-r-full text-loja-tinta transition hover:text-loja-preco"
            >
              <Plus size={18} strokeWidth={2.5} aria-hidden="true" />
            </button>
          </div>

          <button
            type="button"
            onClick={handleConfirm}
            className={`${botaoBrasa} h-14 flex-1 justify-between pl-5 pr-2 text-[15px] font-extrabold`}
          >
            <span>Pôr na sacola</span>
            <span className="flex h-10 items-center rounded-full bg-white/15 px-3.5 tabular-nums">
              <span className="sr-only">· </span>
              {formatCurrency(item.price * quantity)}
            </span>
          </button>
        </div>
      </div>
    </div>
  );
}
