"use client";

import { useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { formatCurrency, cn } from "@/lib/utils";
import { imagemOtimizavel } from "@/lib/imagem-otimizavel";
import { MenuItemModal } from "./MenuItemModal";
import { CabecalhoDaTela } from "@/components/painel/CabecalhoDaTela";
import { Selo } from "@/components/painel/Selo";
import { botaoBrasa, cartaoPainel, chip, kicker } from "@/components/painel/estilos";
import { Pencil, Trash2, Plus, Search, ImageOff } from "lucide-react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

interface MenuItem {
  id: string;
  name: string;
  description: string | null;
  price: number;
  imageUrl: string | null;
  imagemRecortadaUrl?: string | null;
  available: boolean;
  categoryId: string;
  containsGluten?: boolean | null;
  containsLactose?: boolean | null;
  isVegan?: boolean | null;
}

interface Category {
  id: string;
  name: string;
  slug: string;
  position: number;
  items: MenuItem[];
}

/** O item que a loja mostra no banner agora, e por qual regra. */
export interface NoBannerAgora {
  itemId: string;
  modo: "mais-vendido" | "item" | "destaque";
}

interface Props {
  initialCategories: Category[];
  allCategories: { id: string; name: string; slug: string }[];
  noBanner?: NoBannerAgora | null;
}

const MOTIVO_DO_BANNER: Record<NoBannerAgora["modo"], string> = {
  "mais-vendido": "mais vendido, automático",
  destaque: "destaque da casa, automático",
  item: "escolhido por você",
};

function plural(n: number, um: string, varios: string): string {
  return `${n} ${n === 1 ? um : varios}`;
}

/** Busca sem acento e sem caixa: "acai" acha "Açaí". */
function normalizar(texto: string): string {
  return texto.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
}

export function MenuManager({ initialCategories, allCategories, noBanner = null }: Props) {
  const router = useRouter();
  const [modalOpen, setModalOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<MenuItem | null>(null);
  // Lista local, e não as props direto: ativar, desativar e excluir mudam a
  // tela na hora, e o servidor confirma depois. Antes cada clique esperava a
  // resposta e um router.refresh(), que refazia a página inteira (todas as
  // categorias e itens) para mudar um ícone.
  const [categories, setCategories] = useState(initialCategories);
  // Quando o servidor manda uma lista nova (o refresh depois de salvar no
  // modal), ela substitui a local. Comparar com a anterior durante o render é o
  // jeito que o React recomenda de derivar estado de prop, sem efeito.
  const [anteriores, setAnteriores] = useState(initialCategories);
  if (anteriores !== initialCategories) {
    setAnteriores(initialCategories);
    setCategories(initialCategories);
  }
  // Um conjunto, e não um id só: com a resposta otimista dá para mexer em
  // outro item antes de o primeiro voltar, e cada botão trava só o seu.
  const [pendentes, setPendentes] = useState<ReadonlySet<string>>(new Set());
  const [busca, setBusca] = useState("");
  // null é "todas": a seleção só filtra a tela, não muda nada no cardápio.
  const [categoriaAtiva, setCategoriaAtiva] = useState<string | null>(null);

  function openCreate() {
    setEditingItem(null);
    setModalOpen(true);
  }

  function openEdit(item: MenuItem) {
    setEditingItem(item);
    setModalOpen(true);
  }

  function marcar(id: string, pendente: boolean) {
    setPendentes((atual) => {
      const novo = new Set(atual);
      if (pendente) novo.add(id);
      else novo.delete(id);
      return novo;
    });
  }

  function mudarItem(id: string, mudar: (item: MenuItem) => MenuItem) {
    setCategories((atual) =>
      atual.map((c) => ({
        ...c,
        items: c.items.map((i) => (i.id === id ? mudar(i) : i)),
      }))
    );
  }

  async function deleteItem(item: MenuItem) {
    if (!confirm("Tem certeza que deseja excluir este item?")) return;
    const posicao = categories
      .find((c) => c.id === item.categoryId)
      ?.items.findIndex((i) => i.id === item.id) ?? -1;

    marcar(item.id, true);
    setCategories((atual) =>
      atual.map((c) => ({ ...c, items: c.items.filter((i) => i.id !== item.id) }))
    );

    const res = await fetch(`/api/menu/${item.id}`, { method: "DELETE" }).catch(() => null);
    marcar(item.id, false);
    if (res?.ok) {
      toast.success("Item excluído");
      return;
    }

    // Volta para o lugar de onde saiu. Item já pedido não pode ser excluído, e
    // é justamente o caso comum de recusa: sumir e reaparecer em outra posição
    // pareceria que a lista mudou sozinha.
    setCategories((atual) =>
      atual.map((c) => {
        if (c.id !== item.categoryId || c.items.some((i) => i.id === item.id)) return c;
        const items = [...c.items];
        items.splice(posicao < 0 ? items.length : posicao, 0, item);
        return { ...c, items };
      })
    );
    // A rota explica o que aconteceu — item já pedido não pode ser excluído,
    // e o caminho é desativar. Um "Erro ao excluir item" fixo escondia a
    // instrução e deixava o dono tentando de novo.
    const body = await res?.json().catch(() => null);
    toast.error(body?.error ?? "Erro ao excluir item");
  }

  async function toggleAvailable(item: MenuItem) {
    const disponivel = !item.available;
    marcar(item.id, true);
    mudarItem(item.id, (i) => ({ ...i, available: disponivel }));

    const res = await fetch(`/api/menu/${item.id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ available: disponivel }),
    }).catch(() => null);
    marcar(item.id, false);
    if (res?.ok) {
      toast.success(disponivel ? "Item ativado" : "Item desativado");
      return;
    }

    // Desfaz só o campo que este clique mudou, e não a lista inteira de antes:
    // outro item alterado no meio tempo continua como está.
    mudarItem(item.id, (i) => ({ ...i, available: item.available }));
    toast.error("Erro ao atualizar item");
  }

  const todosOsItens = categories.flatMap((c) => c.items);
  const esgotados = todosOsItens.filter((i) => !i.available).length;
  const contexto = [
    plural(categories.length, "categoria", "categorias"),
    plural(todosOsItens.length, "item", "itens"),
    plural(esgotados, "esgotado", "esgotados"),
  ].join(" · ");

  const itemDoBanner = noBanner ? todosOsItens.find((i) => i.id === noBanner.itemId) ?? null : null;

  const termo = normalizar(busca.trim());
  const visiveis = categories
    .filter((c) => categoriaAtiva === null || c.id === categoriaAtiva)
    .map((c) => ({
      ...c,
      items: termo ? c.items.filter((i) => normalizar(i.name).includes(termo)) : c.items,
    }))
    // Na busca, categoria sem resultado some; sem busca, a vazia continua
    // aparecendo, para o dono saber que ela existe.
    .filter((c) => !termo || c.items.length > 0);

  return (
    <>
      <CabecalhoDaTela contexto={contexto} titulo="Cardápio">
        <label className="flex h-11 w-[260px] max-w-full items-center gap-2.5 rounded-full bg-loja-papel px-4 shadow-loja focus-within:ring-2 focus-within:ring-brand/40">
          <Search size={16} className="shrink-0 text-loja-tinta-2" aria-hidden="true" />
          <span className="sr-only">Buscar item</span>
          <input
            type="search"
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            placeholder="Buscar item"
            className="min-w-0 flex-1 bg-transparent text-[13.5px] text-loja-tinta outline-none placeholder:text-loja-tinta-2"
          />
        </label>
        <button onClick={openCreate} className={cn(botaoBrasa, "h-11 px-5 text-[14px] font-extrabold")}>
          <Plus size={16} strokeWidth={2.6} aria-hidden="true" />
          Novo item
        </button>
      </CabecalhoDaTela>

      {itemDoBanner && noBanner && (
        <Link
          href="/adm/banner-cupons"
          className="mb-4 flex min-h-[68px] items-center gap-3.5 rounded-[18px] bg-loja-pessego px-4 py-3 transition hover:bg-loja-pessego-claro"
        >
          <FotoPequena item={itemDoBanner} />
          <span className="flex min-w-0 flex-1 flex-col gap-0.5">
            <span className={`${kicker} text-[#6A3A1E]`}>No banner agora</span>
            <span className="truncate text-[13.5px] font-extrabold text-forest-dark">
              {itemDoBanner.name} · {MOTIVO_DO_BANNER[noBanner.modo]}
            </span>
          </span>
          <span className="shrink-0 text-[12.5px] font-extrabold text-loja-preco">Trocar</span>
        </Link>
      )}

      <div className="flex flex-col gap-4 lg:flex-row lg:items-start">
        <nav
          aria-label="Categorias"
          className={cn(
            cartaoPainel,
            "flex gap-1 overflow-x-auto p-2 lg:w-[240px] lg:shrink-0 lg:flex-col lg:overflow-visible lg:p-3"
          )}
        >
          <BotaoDeCategoria
            nome="Todas"
            quantos={todosOsItens.length}
            ativa={categoriaAtiva === null}
            onClick={() => setCategoriaAtiva(null)}
          />
          {categories.map((c) => (
            <BotaoDeCategoria
              key={c.id}
              nome={c.name}
              quantos={c.items.length}
              ativa={categoriaAtiva === c.id}
              onClick={() => setCategoriaAtiva(c.id)}
            />
          ))}
        </nav>

        <div className="flex min-w-0 flex-1 flex-col gap-6">
          {visiveis.length === 0 && (
            <p className={cn(cartaoPainel, "px-5 py-6 text-[13.5px] text-loja-tinta-2")}>
              {termo ? `Nenhum item com “${busca.trim()}”.` : "Nenhuma categoria cadastrada ainda."}
            </p>
          )}

          {visiveis.map((category) => (
            <section key={category.id} aria-labelledby={`cat-${category.id}`} className="flex flex-col gap-3">
              <div className="flex items-baseline justify-between gap-3">
                <h2 id={`cat-${category.id}`} className="manchete text-[1.75rem] text-forest-dark">
                  {category.name}
                </h2>
                <span className="text-[12px] text-loja-tinta-2">{plural(category.items.length, "item", "itens")}</span>
              </div>

              {category.items.length === 0 ? (
                <p className={cn(cartaoPainel, "px-5 py-4 text-[13.5px] text-loja-tinta-2")}>
                  Nenhum item nesta categoria.
                </p>
              ) : (
                <div className="grid grid-cols-[repeat(auto-fill,minmax(230px,1fr))] gap-3">
                  {category.items.map((item) => (
                    <CartaoDoItem
                      key={item.id}
                      item={item}
                      noBanner={item.id === itemDoBanner?.id}
                      pendente={pendentes.has(item.id)}
                      onToggle={() => toggleAvailable(item)}
                      onEditar={() => openEdit(item)}
                      onExcluir={() => deleteItem(item)}
                    />
                  ))}
                </div>
              )}
            </section>
          ))}
        </div>
      </div>

      <MenuItemModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        item={editingItem}
        categories={allCategories}
        onSaved={() => {
          setModalOpen(false);
          // Aqui o refresh fica: item novo nasce com id, posição e imagem que
          // só o servidor conhece, e a edição pode trocar o item de categoria.
          router.refresh();
        }}
      />
    </>
  );
}

function BotaoDeCategoria({
  nome,
  quantos,
  ativa,
  onClick,
}: {
  nome: string;
  quantos: number;
  ativa: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={ativa}
      className={cn(
        chip,
        "h-11 shrink-0 justify-between bg-transparent lg:w-full lg:rounded-xl lg:px-3",
        "lg:aria-pressed:bg-loja-creme lg:aria-pressed:text-forest-dark"
      )}
    >
      <span className="truncate">{nome}</span>
      <span className="text-[12px] font-semibold opacity-80">{quantos}</span>
    </button>
  );
}

/** A foto do item, ou o recorte quando é só ele que existe. */
function fotoDo(item: MenuItem): { src: string; recorte: boolean } | null {
  if (item.imageUrl) return { src: item.imageUrl, recorte: false };
  if (item.imagemRecortadaUrl) return { src: item.imagemRecortadaUrl, recorte: true };
  return null;
}

function FotoPequena({ item }: { item: MenuItem }) {
  const foto = item.imagemRecortadaUrl
    ? { src: item.imagemRecortadaUrl, recorte: true }
    : fotoDo(item);
  return (
    <span className="relative h-11 w-11 shrink-0 overflow-hidden rounded-xl bg-loja-pessego-claro">
      {foto && (
        <Image
          src={foto.src}
          unoptimized={!imagemOtimizavel(foto.src)}
          alt=""
          fill
          sizes="44px"
          className={foto.recorte ? "object-contain p-0.5" : "object-cover"}
        />
      )}
    </span>
  );
}

function CartaoDoItem({
  item,
  noBanner,
  pendente,
  onToggle,
  onEditar,
  onExcluir,
}: {
  item: MenuItem;
  noBanner: boolean;
  pendente: boolean;
  onToggle: () => void;
  onEditar: () => void;
  onExcluir: () => void;
}) {
  const foto = fotoDo(item);
  const idDoNome = `item-${item.id}`;

  return (
    <article aria-labelledby={idDoNome} className={cn(cartaoPainel, "flex flex-col overflow-hidden rounded-[20px]")}>
      <div className="relative h-[150px] bg-loja-pessego">
        {foto ? (
          <Image
            src={foto.src}
            unoptimized={!imagemOtimizavel(foto.src)}
            alt={item.name}
            fill
            sizes="(min-width: 1024px) 280px, 50vw"
            // Esgotado apaga só a foto: apagar o cartão inteiro baixaria o
            // contraste do nome e do preço abaixo de 4,5:1.
            className={cn(foto.recorte ? "object-contain p-2.5" : "object-cover", !item.available && "opacity-50 grayscale")}
          />
        ) : (
          <span className="flex h-full items-center justify-center text-loja-tinta-2">
            <ImageOff size={22} aria-hidden="true" />
            <span className="sr-only">Sem foto</span>
          </span>
        )}
        <div className="absolute left-2.5 top-2.5 flex flex-wrap gap-1.5">
          {noBanner && <Selo tom="rua">No banner</Selo>}
          {item.imagemRecortadaUrl && <Selo tom="neutro" className="bg-loja-papel text-forest-dark">Foto sem fundo</Selo>}
          {!item.available && <Selo tom="alerta">Esgotado</Selo>}
        </div>
      </div>

      <div className="flex flex-1 flex-col gap-2 px-3.5 pb-3.5 pt-3">
        <div className="flex justify-between gap-2">
          <h3 id={idDoNome} className="min-w-0 text-[14px] font-extrabold text-loja-tinta">
            {item.name}
          </h3>
          <span className="shrink-0 text-[14px] font-extrabold text-loja-preco">{formatCurrency(item.price)}</span>
        </div>
        {item.description && (
          <p className="line-clamp-2 text-[12px] text-loja-tinta-2">{item.description}</p>
        )}

        <div className="mt-auto flex items-center justify-between gap-1 border-t border-[#F0E6DA] pt-2">
          <button
            type="button"
            role="switch"
            aria-checked={item.available}
            aria-label={`${item.name} no cardápio`}
            onClick={onToggle}
            disabled={pendente}
            className="-ml-1 flex h-11 items-center gap-2 rounded-full px-1 text-[12.5px] font-bold text-[#4E4038] disabled:opacity-60"
          >
            <span
              aria-hidden="true"
              className={cn(
                "flex h-[22px] w-[38px] rounded-full p-[2px] transition",
                item.available ? "justify-end bg-forest" : "justify-start bg-[#8A7A6D]"
              )}
            >
              <span className="h-[18px] w-[18px] rounded-full bg-white" />
            </span>
            {item.available ? "No cardápio" : "Esgotado"}
          </button>

          <div className="flex items-center">
            <button
              type="button"
              onClick={onEditar}
              aria-label={`Editar ${item.name}`}
              className="flex h-11 w-11 items-center justify-center rounded-full text-loja-tinta transition hover:bg-loja-creme"
            >
              <Pencil size={15} aria-hidden="true" />
            </button>
            <button
              type="button"
              onClick={onExcluir}
              disabled={pendente}
              aria-label={`Excluir ${item.name}`}
              className="flex h-11 w-11 items-center justify-center rounded-full text-loja-tinta-2 transition hover:bg-loja-pessego-claro hover:text-loja-preco disabled:opacity-50"
            >
              <Trash2 size={15} aria-hidden="true" />
            </button>
          </div>
        </div>
      </div>
    </article>
  );
}
