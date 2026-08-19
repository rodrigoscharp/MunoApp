"use client";

import { useState } from "react";
import { MapPin, Plus, Trash2, Pencil, Check, X } from "lucide-react";
import { formatCurrency } from "@/lib/utils";
import { toast } from "sonner";

interface Zone {
  id: string;
  name: string;
  price: number;
  active: boolean;
}

interface Props {
  initialZones: Zone[];
}

export function DeliveryZonesControl({ initialZones }: Props) {
  const [zones, setZones] = useState<Zone[]>(initialZones);
  const [newName, setNewName] = useState("");
  const [newPrice, setNewPrice] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [editPrice, setEditPrice] = useState("");

  async function addZone() {
    const price = parseFloat(newPrice.replace(",", "."));
    if (!newName.trim() || isNaN(price)) {
      toast.error("Preencha o bairro e o valor do frete");
      return;
    }

    const res = await fetch("/api/delivery-zones", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: newName.trim(), price }),
    });

    if (res.ok) {
      const zone = await res.json() as Zone;
      setZones((prev) => [...prev, zone]);
      setNewName("");
      setNewPrice("");
      toast.success(`Bairro "${zone.name}" adicionado`);
    } else {
      toast.error("Erro ao adicionar bairro");
    }
  }

  async function saveEdit(id: string) {
    const price = parseFloat(editPrice.replace(",", "."));
    if (!editName.trim() || isNaN(price)) return;

    const res = await fetch(`/api/delivery-zones/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: editName.trim(), price }),
    });

    if (res.ok) {
      setZones((prev) => prev.map((z) => z.id === id ? { ...z, name: editName.trim(), price } : z));
      setEditingId(null);
      toast.success("Bairro atualizado");
    } else {
      toast.error("Erro ao salvar");
    }
  }

  async function deleteZone(id: string, name: string) {
    const res = await fetch(`/api/delivery-zones/${id}`, { method: "DELETE" });
    if (res.ok) {
      setZones((prev) => prev.filter((z) => z.id !== id));
      toast.success(`Bairro "${name}" removido`);
    } else {
      toast.error("Erro ao remover");
    }
  }

  function startEdit(zone: Zone) {
    setEditingId(zone.id);
    setEditName(zone.name);
    setEditPrice(String(zone.price));
  }

  return (
    <div className="bg-white rounded-xl border border-neutral-200 p-5">
      <div className="flex items-center gap-2 mb-4">
        <MapPin size={15} className="text-neutral-400" />
        <p className="text-xs text-neutral-400 font-medium uppercase tracking-wide">
          Bairros e Fretes
        </p>
      </div>

      {/* Lista de zonas */}
      <div className="space-y-2 mb-4">
        {zones.length === 0 && (
          <p className="text-xs text-neutral-400 italic text-center py-3">
            Nenhum bairro cadastrado ainda
          </p>
        )}

        {zones.map((zone) => (
          <div key={zone.id} className="flex items-center gap-2 rounded-lg border border-neutral-100 bg-neutral-50 px-3 py-2">
            {editingId === zone.id ? (
              <>
                <input
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  className="flex-1 min-w-0 border border-neutral-200 rounded-lg px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-brand/30"
                />
                <div className="flex items-center gap-1 shrink-0">
                  <span className="text-xs text-neutral-400">R$</span>
                  <input
                    value={editPrice}
                    onChange={(e) => setEditPrice(e.target.value)}
                    className="w-16 border border-neutral-200 rounded-lg px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-brand/30"
                  />
                </div>
                <button onClick={() => saveEdit(zone.id)} className="text-green-500 hover:text-green-600 p-1">
                  <Check size={15} />
                </button>
                <button onClick={() => setEditingId(null)} className="text-neutral-400 hover:text-neutral-600 p-1">
                  <X size={15} />
                </button>
              </>
            ) : (
              <>
                <span className="flex-1 text-sm text-neutral-800 font-medium truncate">{zone.name}</span>
                <span className="text-sm font-semibold text-brand shrink-0">{formatCurrency(zone.price)}</span>
                <button onClick={() => startEdit(zone)} className="text-neutral-400 hover:text-neutral-600 p-1">
                  <Pencil size={13} />
                </button>
                <button onClick={() => deleteZone(zone.id, zone.name)} className="text-neutral-400 hover:text-red-500 p-1">
                  <Trash2 size={13} />
                </button>
              </>
            )}
          </div>
        ))}
      </div>

      {/* Adicionar novo bairro */}
      <div className="border-t border-neutral-100 pt-4 space-y-2">
        <p className="text-xs font-medium text-neutral-600">Adicionar bairro</p>
        <div className="flex gap-2">
          <input
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && addZone()}
            placeholder="Nome do bairro"
            className="flex-1 min-w-0 border border-neutral-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand/30"
          />
          <div className="flex items-center gap-1 border border-neutral-200 rounded-lg px-2 shrink-0">
            <span className="text-xs text-neutral-400">R$</span>
            <input
              value={newPrice}
              onChange={(e) => setNewPrice(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && addZone()}
              placeholder="0,00"
              className="w-14 py-2 text-sm focus:outline-none"
            />
          </div>
          <button
            onClick={addZone}
            className="flex items-center gap-1.5 bg-brand hover:bg-brand-dark text-white text-sm font-semibold px-3 py-2 rounded-lg transition shrink-0"
          >
            <Plus size={14} />
            Add
          </button>
        </div>
      </div>
    </div>
  );
}
