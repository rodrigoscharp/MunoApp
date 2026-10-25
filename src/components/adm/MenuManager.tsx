"use client";

import { useState } from "react";
import { formatCurrency } from "@/lib/utils";
import { MenuItemModal } from "./MenuItemModal";
import { Pencil, Trash2, Plus, ToggleLeft, ToggleRight } from "lucide-react";
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

interface Props {
  initialCategories: Category[];
  allCategories: { id: string; name: string; slug: string }[];
}

export function MenuManager({ initialCategories, allCategories }: Props) {
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

  return (
    <>
      <div className="flex justify-end mb-4">
        <button
          onClick={openCreate}
          className="flex items-center gap-2 bg-brand hover:bg-brand-dark text-white text-sm font-medium px-4 py-2 rounded-lg transition"
        >
          <Plus size={16} />
          Novo Item
        </button>
      </div>

      <div className="space-y-6">
        {categories.map((category) => (
          <div
            key={category.id}
            className="bg-white rounded-xl border border-neutral-200 overflow-hidden"
          >
            <div className="flex items-center justify-between px-5 py-3 bg-neutral-50 border-b border-neutral-200">
              <h2 className="font-semibold text-neutral-900">{category.name}</h2>
              <span className="text-xs text-neutral-500">{category.items.length} itens</span>
            </div>

            <div className="divide-y divide-neutral-100">
              {category.items.map((item) => (
                <div
                  key={item.id}
                  className={`flex items-center gap-4 px-5 py-3 transition ${
                    !item.available ? "opacity-60" : ""
                  }`}
                >
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-neutral-900">{item.name}</p>
                    {item.description && (
                      <p className="text-xs text-neutral-400 mt-0.5 truncate">
                        {item.description}
                      </p>
                    )}
                  </div>

                  <span className="font-semibold text-sm text-neutral-700">
                    {formatCurrency(item.price)}
                  </span>

                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => toggleAvailable(item)}
                      disabled={pendentes.has(item.id)}
                      className="p-1.5 rounded-lg hover:bg-neutral-100 transition text-neutral-500"
                      title={item.available ? "Desativar" : "Ativar"}
                    >
                      {item.available ? (
                        <ToggleRight size={18} className="text-green-500" />
                      ) : (
                        <ToggleLeft size={18} />
                      )}
                    </button>
                    <button
                      onClick={() => openEdit(item)}
                      className="p-1.5 rounded-lg hover:bg-neutral-100 transition text-neutral-500"
                    >
                      <Pencil size={15} />
                    </button>
                    <button
                      onClick={() => deleteItem(item)}
                      disabled={pendentes.has(item.id)}
                      className="p-1.5 rounded-lg hover:bg-brand-light transition text-neutral-400 hover:text-brand"
                    >
                      <Trash2 size={15} />
                    </button>
                  </div>
                </div>
              ))}

              {category.items.length === 0 && (
                <p className="px-5 py-4 text-sm text-neutral-400">
                  Nenhum item nesta categoria.
                </p>
              )}
            </div>
          </div>
        ))}
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
