"use client";

import Image from "next/image";
import { useMemo, useRef, useState, useSyncExternalStore } from "react";
import { ChevronDown, Leaf, X } from "lucide-react";
import { useCart } from "@/hooks/useCart";
import { triggerCartFly } from "@/components/menu/CartFlyAnimation";
import { formatCurrency } from "@/lib/utils";
import {
  RESTRICOES,
  filtrarPorRestricoes,
  restricoesDisponiveis,
  type RestricaoDeCardapio,
} from "@/lib/restricoes";
import { MenuItemWithCategory } from "@/types";

// Chave nova de propósito: quem fechou o assistente de IA (`muno-ai-dismissed`)
// não fechou este card, e herdar o estado esconderia o filtro de quem nunca o viu.
const CHAVE_DISPENSA = "muno-filtro-dispensado";

interface FiltroDeRestricoesProps {
  menuItems: MenuItemWithCategory[];
  restaurantOpen: boolean;
}

// O "fui dispensado" mora no localStorage, que o servidor não enxerga. Ler isso
// num efeito e chamar setState lá dentro causa uma renderização em cascata (e é
// erro de lint no React 19); useSyncExternalStore resolve sem isso e é seguro
// na hidratação, porque o servidor responde `false` e o cliente corrige depois.
const ouvintes = new Set<() => void>();

function assinar(aviso: () => void) {
  ouvintes.add(aviso);
  // `storage` cobre outra aba do mesmo navegador dispensando o card.
  window.addEventListener("storage", aviso);
  return () => {
    ouvintes.delete(aviso);
    window.removeEventListener("storage", aviso);
  };
}

// O localStorage pode lançar (janela privada, política do navegador). O card
// precisa funcionar do mesmo jeito sem ele.
function foiDispensado(): boolean {
  try {
    return localStorage.getItem(CHAVE_DISPENSA) === "1";
  } catch {
    return false;
  }
}

const dispensadoNoServidor = () => false;

function gravarDispensa(dispensar: boolean) {
  try {
    if (dispensar) localStorage.setItem(CHAVE_DISPENSA, "1");
    else localStorage.removeItem(CHAVE_DISPENSA);
  } catch {
    /* sem armazenamento: o card só não lembra a escolha na próxima visita */
  }
  ouvintes.forEach((aviso) => aviso());
}

function ItemCard({ item, restaurantOpen }: { item: MenuItemWithCategory; restaurantOpen: boolean }) {
  const addItem = useCart((s) => s.addItem);
  const btnRef = useRef<HTMLButtonElement>(null);

  function handleAdd() {
    addItem({ id: item.id, name: item.name, price: item.price, imageUrl: item.imageUrl }, 1);
    if (btnRef.current) triggerCartFly(btnRef.current);
  }

  return (
    <div className="flex items-center gap-2 bg-white rounded-xl border border-neutral-200 p-2.5 mt-2">
      <div className="relative w-12 h-12 shrink-0 rounded-lg overflow-hidden bg-neutral-100">
        {item.imageUrl ? (
          <Image src={item.imageUrl} alt={item.name} fill sizes="48px" className="object-cover" />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-neutral-300">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
            </svg>
          </div>
        )}
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-xs font-semibold text-neutral-900 leading-tight truncate">{item.name}</p>
        <p className="text-xs text-neutral-400">{item.category.name}</p>
        <p className="text-xs font-bold text-brand">{formatCurrency(item.price)}</p>
      </div>
      <button
        ref={btnRef}
        onClick={handleAdd}
        disabled={!restaurantOpen}
        title={!restaurantOpen ? "Restaurante fechado" : undefined}
        className="shrink-0 px-2.5 py-1 rounded-full bg-brand hover:bg-brand-dark active:scale-90 disabled:opacity-40 disabled:cursor-not-allowed text-white text-xs font-semibold transition-all duration-150 shadow-sm"
      >
        + Adicionar
      </button>
    </div>
  );
}

export function FiltroDeRestricoes({ menuItems, restaurantOpen }: FiltroDeRestricoesProps) {
  const [ativas, setAtivas] = useState<RestricaoDeCardapio[]>([]);
  // Sem esta memória local, um storage bloqueado deixaria o card aberto mesmo
  // depois de a pessoa clicar em fechar.
  const [fechadoAgora, setFechadoAgora] = useState(false);
  const dispensadoAntes = useSyncExternalStore(assinar, foiDispensado, dispensadoNoServidor);
  const dispensado = fechadoAgora || dispensadoAntes;

  const disponiveis = useMemo(() => restricoesDisponiveis(menuItems), [menuItems]);

  // O cardápio vem de um cache de 60s e pode mudar com o card aberto. Um filtro
  // ligado cujo botão sumiu não pode seguir filtrando sem o cliente ver por quê.
  const ligadas = useMemo(
    () => ativas.filter((id) => disponiveis.includes(id)),
    [ativas, disponiveis]
  );
  const resultado = useMemo(() => filtrarPorRestricoes(menuItems, ligadas), [menuItems, ligadas]);

  // Nada declarado, nada a mostrar: nem o wrapper, que carrega margem.
  if (disponiveis.length === 0) return null;

  function alternar(id: RestricaoDeCardapio) {
    setAtivas((atuais) => (atuais.includes(id) ? atuais.filter((x) => x !== id) : [...atuais, id]));
  }

  function dispensar() {
    setFechadoAgora(true);
    gravarDispensa(true);
  }

  function reabrir() {
    setFechadoAgora(false);
    gravarDispensa(false);
  }

  if (dispensado) {
    return (
      <div className="flex justify-center pb-2">
        <button
          type="button"
          onClick={reabrir}
          className="flex items-center gap-1.5 text-xs text-neutral-400 hover:text-brand transition-colors"
        >
          <Leaf size={13} />
          Filtrar por restrição
          <ChevronDown size={13} />
        </button>
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-neutral-200 bg-white overflow-hidden shadow-sm mb-6">
      <div className="flex items-center justify-between gap-3 px-4 py-3 border-b border-neutral-100 bg-neutral-50">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-full bg-brand flex items-center justify-center shrink-0">
            <Leaf size={15} className="text-white" />
          </div>
          <div>
            <p className="text-sm font-bold text-neutral-900 leading-none">Filtrar por restrição</p>
            <p className="text-xs text-neutral-400 mt-0.5">Veja só o que serve para você</p>
          </div>
        </div>
        <button
          type="button"
          onClick={dispensar}
          aria-label="Fechar filtro"
          className="text-neutral-400 hover:text-neutral-600 transition-colors p-1"
        >
          <X size={16} />
        </button>
      </div>

      <div className="px-4 py-4 space-y-3">
        <div className="flex flex-wrap gap-2">
          {RESTRICOES.filter((r) => disponiveis.includes(r.id)).map(({ id, label, emoji }) => {
            const ligado = ligadas.includes(id);
            return (
              <button
                key={id}
                type="button"
                aria-pressed={ligado}
                onClick={() => alternar(id)}
                className={`px-3 py-1.5 rounded-full border text-sm font-medium transition-all duration-150 active:scale-95 ${
                  ligado
                    ? "border-brand bg-brand text-white"
                    : "border-neutral-200 text-neutral-600 hover:border-brand hover:text-brand hover:bg-brand/5"
                }`}
              >
                <span aria-hidden="true">{emoji}</span> {label}
              </button>
            );
          })}
        </div>

        {ligadas.length > 0 && (
          <div className="space-y-2">
            {resultado.length > 0 ? (
              <div className="max-h-80 overflow-y-auto no-scrollbar">
                {resultado.map((item) => (
                  <ItemCard key={item.id} item={item} restaurantOpen={restaurantOpen} />
                ))}
              </div>
            ) : (
              <p className="text-sm text-neutral-500">Nenhum item atende a todos os filtros marcados.</p>
            )}
            <p className="text-xs text-neutral-400">
              Informado pelo restaurante. Em caso de alergia, confirme com a equipe antes de pedir.
            </p>
            <button
              type="button"
              onClick={() => setAtivas([])}
              className="text-xs text-neutral-500 hover:text-brand underline"
            >
              Limpar filtros
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
