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
  available: boolean;
  categoryId: string;
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
  const [loading, setLoading] = useState<string | null>(null);

  function openCreate() {
    setEditingItem(null);
    setModalOpen(true);
  }

  function openEdit(item: MenuItem) {
    setEditingItem(item);
    setModalOpen(true);
  }

  async function deleteItem(id: string) {
    if (!confirm("Tem certeza que deseja excluir este item?")) return;
    setLoading(id);
    const res = await fetch(`/api/menu/${id}`, { method: "DELETE" });
    setLoading(null);
    if (res.ok) {
      toast.success("Item excluído");
      router.refresh();
    } else {
      // A rota explica o que aconteceu — item já pedido não pode ser excluído,
      // e o caminho é desativar. Um "Erro ao excluir item" fixo escondia a
      // instrução e deixava o dono tentando de novo.
      const body = await res.json().catch(() => null);
      toast.error(body?.error ?? "Erro ao excluir item");
    }
  }

  async function toggleAvailable(item: MenuItem) {
    setLoading(item.id);
    const res = await fetch(`/api/menu/${item.id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ available: !item.available }),
    });
    setLoading(null);
    if (res.ok) {
      toast.success(item.available ? "Item desativado" : "Item ativado");
      router.refresh();
    } else {
      toast.error("Erro ao atualizar item");
    }
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
        {initialCategories.map((category) => (
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
                      disabled={loading === item.id}
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
                      onClick={() => deleteItem(item.id)}
                      disabled={loading === item.id}
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
          router.refresh();
        }}
      />
    </>
  );
}
