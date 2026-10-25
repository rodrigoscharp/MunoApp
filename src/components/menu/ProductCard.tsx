"use client";

import Image from "next/image";
import { imagemOtimizavel } from "@/lib/imagem-otimizavel";
import { Plus } from "lucide-react";
import { useRef, useState } from "react";
import { useCart } from "@/hooks/useCart";
import { triggerCartFly } from "@/components/menu/CartFlyAnimation";
import { AddToCartModal } from "@/components/menu/AddToCartModal";
import { useFolhaDoProduto } from "@/components/loja/FolhaDoProduto";
import { precoCurto } from "@/components/loja/preco";
import type { ItemDaVitrine } from "@/components/loja/tipos";

export function ProductCard({
  item,
  restaurantOpen = true,
  prioridade = false,
  variante = "grade",
}: {
  item: ItemDaVitrine;
  restaurantOpen?: boolean;
  /**
   * Os primeiros cards, acima da dobra, são candidatos a LCP. Com isso a foto
   * sai na frente das outras em vez de esperar o lazy loading descobri-la.
   * Não usa `preload` (o antigo `priority`): a doc do Next o desaconselha
   * quando há várias imagens candidatas, que é o caso de uma grade.
   */
  prioridade?: boolean;
  /** "fileira": o card estreito da faixa de mais pedidos, sem descrição. */
  variante?: "grade" | "fileira";
}) {
  const folha = useFolhaDoProduto();
  const addItem = useCart((s) => s.addItem);
  const btnRef = useRef<HTMLButtonElement>(null);
  // Só usado fora de um ProvedorDaFolha (ver FolhaDoProduto).
  const [showModal, setShowModal] = useState(false);

  const podeAdicionar = item.available && restaurantOpen;

  function abrir() {
    if (!podeAdicionar) return;
    if (folha) folha.abrir(item, btnRef.current);
    else setShowModal(true);
  }

  function handleConfirm(notes: string, quantity: number) {
    addItem(
      { id: item.id, name: item.name, price: item.price, imageUrl: item.imageUrl, notes: notes || undefined },
      quantity
    );
    if (btnRef.current) triggerCartFly(btnRef.current);
    setShowModal(false);
  }

  const fileira = variante === "fileira";

  return (
    <>
      <article
        className={`group flex h-full flex-col rounded-[20px] bg-loja-papel shadow-loja transition duration-200 hover:-translate-y-0.5 hover:shadow-loja-alta ${
          fileira ? "gap-1.5 p-2 pb-2.5" : "gap-2 p-2 pb-3 sm:p-2.5"
        }`}
      >
        {/* A foto também abre a folha, mas fica fora da ordem de tabulação:
            o botão "+" já é a mesma ação, e dois focos para ela só dobrariam
            o caminho de quem navega por teclado. */}
        <button
          type="button"
          tabIndex={-1}
          aria-hidden="true"
          onClick={abrir}
          disabled={!podeAdicionar}
          className={`relative block w-full overflow-hidden rounded-2xl bg-loja-pessego-claro disabled:cursor-default ${
            fileira ? "aspect-[8/7]" : "aspect-[4/3]"
          }`}
        >
          {item.imageUrl ? (
            <Image
              src={item.imageUrl}
            unoptimized={!imagemOtimizavel(item.imageUrl)}
              alt=""
              fill
              // Celular: duas colunas na grade, ~130px na fileira.
              sizes={fileira ? "140px" : "(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 25vw"}
              loading={prioridade ? "eager" : "lazy"}
              fetchPriority={prioridade ? "high" : undefined}
              className="object-cover transition-transform duration-300 group-hover:scale-105"
            />
          ) : (
            <span className="flex h-full w-full items-center justify-center text-loja-tinta-2/40">
              <svg className="h-9 w-9" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
              </svg>
            </span>
          )}
          {!item.available && (
            <span className="absolute inset-0 flex items-center justify-center bg-loja-papel/75">
              <span className="rounded-full bg-loja-papel px-3 py-1 text-xs font-semibold text-loja-tinta-2 shadow-loja">
                Indisponível
              </span>
            </span>
          )}
        </button>

        <div className="flex flex-1 flex-col px-0.5">
          <h3 className={`font-bold leading-tight text-loja-tinta line-clamp-2 ${fileira ? "text-[13px]" : "text-sm"}`}>
            {item.name}
          </h3>
          {!fileira && item.description && (
            <p className="mt-1 text-xs leading-relaxed text-loja-tinta-2 line-clamp-2">{item.description}</p>
          )}
          <div className="mt-auto flex items-center justify-between gap-2 pt-2">
            <span className={`font-extrabold text-loja-preco ${fileira ? "text-[13.5px]" : "text-[15px]"}`}>
              {precoCurto(item.price)}
            </span>
            {/* Alvo de 44px com o círculo de 36 dentro: o toque cabe no dedo
                sem o card ganhar altura. */}
            <button
              ref={btnRef}
              type="button"
              onClick={abrir}
              disabled={!podeAdicionar}
              aria-label={`Adicionar ${item.name}`}
              title={!restaurantOpen ? "Restaurante fechado no momento" : !item.available ? "Indisponível" : undefined}
              className="group/mais -m-1 flex h-11 w-11 shrink-0 items-center justify-center rounded-full disabled:cursor-not-allowed"
            >
              <span className="flex h-9 w-9 items-center justify-center rounded-full bg-brand text-white transition duration-150 group-hover:bg-loja-brasa group-active/mais:scale-90 group-disabled/mais:opacity-40">
                <Plus size={17} strokeWidth={3} aria-hidden="true" />
              </span>
            </button>
          </div>
        </div>
      </article>

      {showModal && (
        <AddToCartModal item={item} onConfirm={handleConfirm} onClose={() => setShowModal(false)} />
      )}
    </>
  );
}
