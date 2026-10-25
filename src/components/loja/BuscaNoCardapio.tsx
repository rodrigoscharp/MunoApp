"use client";

import { useId, useMemo, useState } from "react";
import { Search, X } from "lucide-react";
import { ProductCard } from "@/components/menu/ProductCard";
import type { ItemDaVitrine } from "@/components/loja/tipos";

function normalizar(texto: string): string {
  return texto
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase();
}

/**
 * Os itens que casam com o que a pessoa digitou, sobre o cardápio que a
 * página já carregou: sem rede, sem acento e sem caixa ("pao" acha "Pão de
 * queijo"). Cada palavra precisa aparecer no nome ou na descrição, em qualquer
 * ordem, para que "queijo pao" ache o mesmo item.
 */
export function buscarNoCardapio<T extends Pick<ItemDaVitrine, "name" | "description">>(
  itens: T[],
  termo: string
): T[] {
  const palavras = normalizar(termo).split(/\s+/).filter(Boolean);
  if (palavras.length === 0) return [];
  return itens.filter((item) => {
    const texto = normalizar(`${item.name} ${item.description ?? ""}`);
    return palavras.every((p) => texto.includes(p));
  });
}

export function BuscaNoCardapio({
  itens,
  restaurantOpen,
}: {
  itens: ItemDaVitrine[];
  restaurantOpen: boolean;
}) {
  const [termo, setTermo] = useState("");
  const resultados = useMemo(() => buscarNoCardapio(itens, termo), [itens, termo]);
  const idDosResultados = useId();
  const buscando = termo.trim().length > 0;

  // O exemplo do campo sai do próprio cardápio, como no mockup ("Smash,
  // batata, milkshake…"), em vez de um texto fixo que não fala da casa.
  const exemplo =
    itens.length > 0
      ? `${itens
          .slice(0, 3)
          .map((i) => i.name.toLowerCase())
          .join(", ")}…`
      : "Buscar no cardápio";

  return (
    <div role="search" className="space-y-3">
      <div className="flex h-12 items-center gap-2 rounded-full bg-loja-papel pl-4 pr-1.5 shadow-loja focus-within:ring-2 focus-within:ring-brand/30">
        <input
          type="search"
          value={termo}
          onChange={(e) => setTermo(e.target.value)}
          placeholder={exemplo}
          aria-label="Buscar no cardápio"
          aria-controls={idDosResultados}
          enterKeyHint="search"
          className="min-w-0 flex-1 bg-transparent text-[15px] text-loja-tinta outline-none placeholder:text-loja-tinta-2 [&::-webkit-search-cancel-button]:hidden"
        />
        {buscando ? (
          <button
            type="button"
            onClick={() => setTermo("")}
            aria-label="Limpar busca"
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-loja-creme text-loja-tinta transition hover:bg-loja-pessego-claro"
          >
            <X size={18} aria-hidden="true" />
          </button>
        ) : (
          <span aria-hidden="true" className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-loja-creme text-loja-tinta">
            <Search size={18} />
          </span>
        )}
      </div>

      <div id={idDosResultados}>
        {/* O número de resultados é dito ao leitor de tela a cada letra; a
            lista em si não, para não ler o cardápio inteiro de novo. */}
        <p aria-live="polite" className={buscando ? "text-sm font-semibold text-loja-tinta-2" : "sr-only"}>
          {buscando
            ? resultados.length === 0
              ? `Nada encontrado para “${termo.trim()}”.`
              : `${resultados.length} ${resultados.length === 1 ? "resultado" : "resultados"}`
            : ""}
        </p>
        {buscando && resultados.length > 0 && (
          <ul className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4 lg:grid-cols-4">
            {resultados.map((item) => (
              <li key={item.id}>
                <ProductCard item={item} restaurantOpen={restaurantOpen} />
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
