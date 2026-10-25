"use client";

import Image from "next/image";
import { imagemOtimizavel } from "@/lib/imagem-otimizavel";
import { useMemo, useRef, useState, useSyncExternalStore } from "react";
import { ChevronDown, Leaf, Plus, X } from "lucide-react";
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

/**
 * Só o que o card do filtro mostra e o que o filtro lê. A lista inteira do
 * cardápio vai no payload da página uma segunda vez para este componente, e
 * descrição, slug e ids de categoria pesariam ali sem ninguém usar.
 */
export type ItemDoFiltro = Pick<
  MenuItemWithCategory,
  "id" | "name" | "price" | "imageUrl" | "containsGluten" | "containsLactose" | "isVegan"
> & { category: Pick<MenuItemWithCategory["category"], "name"> };

interface FiltroDeRestricoesProps {
  menuItems: ItemDoFiltro[];
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

function ItemCard({ item, restaurantOpen }: { item: ItemDoFiltro; restaurantOpen: boolean }) {
  const addItem = useCart((s) => s.addItem);
  const btnRef = useRef<HTMLButtonElement>(null);

  function handleAdd() {
    addItem({ id: item.id, name: item.name, price: item.price, imageUrl: item.imageUrl }, 1);
    if (btnRef.current) triggerCartFly(btnRef.current);
  }

  return (
    <li className="flex items-center gap-2.5 rounded-2xl bg-loja-papel p-2 shadow-loja">
      <div className="relative h-12 w-12 shrink-0 overflow-hidden rounded-xl bg-loja-pessego-claro">
        {item.imageUrl ? (
          <Image src={item.imageUrl}
            unoptimized={!imagemOtimizavel(item.imageUrl)} alt="" fill sizes="48px" className="object-cover" />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-loja-tinta-2/40">
            <svg aria-hidden="true" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
            </svg>
          </div>
        )}
      </div>
      <div className="min-w-0 flex-1">
        <p className="truncate text-[13px] font-bold leading-tight text-loja-tinta">{item.name}</p>
        <p className="text-xs text-loja-tinta-2">{item.category.name}</p>
        <p className="text-xs font-extrabold text-loja-preco">{formatCurrency(item.price)}</p>
      </div>
      <button
        ref={btnRef}
        type="button"
        onClick={handleAdd}
        disabled={!restaurantOpen}
        aria-label={`Adicionar ${item.name}`}
        title={!restaurantOpen ? "Restaurante fechado" : undefined}
        className="flex h-11 shrink-0 items-center gap-1 rounded-full bg-loja-brasa px-3.5 text-xs font-bold text-white transition hover:bg-loja-brasa-escura active:scale-95 disabled:cursor-not-allowed disabled:opacity-40"
      >
        <Plus size={14} strokeWidth={3} aria-hidden="true" />
        Adicionar
      </button>
    </li>
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

  // O cardápio vem de cache e pode mudar com o card aberto. Um filtro
  // ligado NUNCA é descartado por baixo do cliente: ele continua visível,
  // pressionado e valendo. Descartar alargaria a lista em silêncio, e quem pediu
  // "sem lactose" passaria a ver item sem essa declaração. Sem item que o
  // atenda, a lista fica vazia e a mensagem diz por quê.
  const resultado = useMemo(() => filtrarPorRestricoes(menuItems, ativas), [menuItems, ativas]);

  // Algum filtro ligado que ninguém declarou: a lista vazia vem de "o restaurante
  // ainda não informou", e não de "nenhum prato serve". Dizer o contrário seria
  // afirmar algo que ninguém verificou.
  const algumSemDeclaracao = ativas.some((id) => !disponiveis.includes(id));

  // Sem item no cardápio não há o que filtrar: nem o wrapper, que carrega margem.
  // Os botões, ao contrário, NÃO dependem de o dono já ter declarado algo. Eles
  // são o atalho de quem tem restrição, e esconder o card até alguém preencher o
  // formulário faz o filtro parecer inexistente.
  if (menuItems.length === 0) return null;

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
      <div className="flex justify-center">
        <button
          type="button"
          onClick={reabrir}
          className="flex min-h-11 items-center gap-1.5 rounded-full px-4 text-xs font-bold text-forest-dark transition hover:bg-loja-papel"
        >
          <Leaf size={14} aria-hidden="true" />
          Filtrar por restrição
          <ChevronDown size={14} aria-hidden="true" />
        </button>
      </div>
    );
  }

  return (
    <section aria-label="Filtrar por restrição" className="overflow-hidden rounded-[20px] bg-loja-papel shadow-loja">
      <div className="flex items-center justify-between gap-3 px-4 pb-2 pt-3">
        <div className="flex items-center gap-2.5">
          <div aria-hidden="true" className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-loja-folha text-forest">
            <Leaf size={18} />
          </div>
          <div>
            <p className="text-[13.5px] font-extrabold leading-none text-forest-dark">Filtrar por restrição</p>
            <p className="mt-1 text-xs text-loja-tinta-2">Veja só o que serve para você</p>
          </div>
        </div>
        <button
          type="button"
          onClick={dispensar}
          aria-label="Fechar filtro"
          className="flex h-11 w-11 items-center justify-center rounded-full text-loja-tinta-2 transition hover:bg-loja-creme hover:text-loja-tinta"
        >
          <X size={18} aria-hidden="true" />
        </button>
      </div>

      <div className="space-y-3 px-4 pb-4">
        <div className="flex flex-wrap gap-2">
          {RESTRICOES.map(({ id, label }) => {
            const ligado = ativas.includes(id);
            return (
              <button
                key={id}
                type="button"
                aria-pressed={ligado}
                onClick={() => alternar(id)}
                className={`min-h-10 rounded-full border-[1.5px] px-4 text-sm font-semibold transition active:scale-95 ${
                  ligado
                    ? "border-forest-dark bg-forest-dark text-white"
                    : "border-loja-linha bg-loja-creme text-loja-tinta hover:border-forest"
                }`}
              >
                {label}
              </button>
            );
          })}
        </div>

        {ativas.length > 0 && (
          <div className="space-y-2">
            {resultado.length > 0 ? (
              <ul className="no-scrollbar max-h-80 space-y-2 overflow-y-auto">
                {resultado.map((item) => (
                  <ItemCard key={item.id} item={item} restaurantOpen={restaurantOpen} />
                ))}
              </ul>
            ) : (
              <p className="text-sm text-loja-tinta">
                {algumSemDeclaracao
                  ? "Este restaurante ainda não informou quais itens atendem a esse filtro."
                  : "Nenhum item atende a todos os filtros marcados."}
              </p>
            )}
            <p className="text-xs text-loja-tinta-2">
              Informado pelo restaurante. Em caso de alergia, confirme com a equipe antes de pedir.
            </p>
            <button
              type="button"
              onClick={() => setAtivas([])}
              className="min-h-9 text-xs font-semibold text-loja-preco underline"
            >
              Limpar filtros
            </button>
          </div>
        )}
      </div>
    </section>
  );
}
