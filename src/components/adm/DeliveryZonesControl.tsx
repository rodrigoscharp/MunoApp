"use client";

import { useState } from "react";
import { MapPin, Plus, Trash2, Pencil, Check, X } from "lucide-react";
import { cn, formatCurrency } from "@/lib/utils";
import { botaoBrasa, campo, cartaoPainel, tituloDeSecao } from "@/components/painel/estilos";
import { Selo } from "@/components/painel/Selo";
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

  const botaoIcone =
    "flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-loja-tinta-2 transition hover:bg-loja-pessego-claro hover:text-loja-tinta";
  const rotuloDoCampo = "mb-1.5 block text-[13px] font-bold text-loja-tinta";

  return (
    <div className={`${cartaoPainel} p-5 sm:p-6`}>
      <div className="mb-4 flex items-center gap-2">
        <MapPin size={17} className="text-loja-preco" aria-hidden />
        <h3 className={tituloDeSecao}>Bairros e fretes</h3>
        {zones.length > 0 && (
          <Selo tom="neutro" className="ml-auto">
            {zones.length} {zones.length === 1 ? "bairro" : "bairros"}
          </Selo>
        )}
      </div>

      {/* Lista de zonas */}
      {zones.length === 0 ? (
        <p className="mb-4 rounded-2xl bg-loja-creme px-4 py-5 text-center text-[13px] text-loja-tinta-2">
          Nenhum bairro cadastrado ainda
        </p>
      ) : (
        <ul className="mb-4 grid grid-cols-1 gap-2 md:grid-cols-2">
          {zones.map((zone) => (
            <li key={zone.id} className="flex min-h-14 items-center gap-2 rounded-2xl border border-loja-linha bg-white py-1.5 pl-4 pr-1.5">
              {editingId === zone.id ? (
                <>
                  <input
                    value={editName}
                    onChange={(e) => setEditName(e.target.value)}
                    aria-label="Nome do bairro"
                    className={cn(campo, "h-11 min-w-0 flex-1 px-3 py-0 text-[14px]")}
                  />
                  <div className="flex shrink-0 items-center gap-1">
                    <span className="text-[12px] text-loja-tinta-2" aria-hidden>R$</span>
                    <input
                      value={editPrice}
                      onChange={(e) => setEditPrice(e.target.value)}
                      aria-label="Valor do frete, em reais"
                      inputMode="decimal"
                      className={cn(campo, "h-11 w-20 px-2 py-0 text-[14px]")}
                    />
                  </div>
                  <button type="button" onClick={() => saveEdit(zone.id)} aria-label="Salvar bairro" className={cn(botaoIcone, "text-forest-dark")}>
                    <Check size={17} aria-hidden />
                  </button>
                  <button type="button" onClick={() => setEditingId(null)} aria-label="Cancelar edição" className={botaoIcone}>
                    <X size={17} aria-hidden />
                  </button>
                </>
              ) : (
                <>
                  <span className="flex-1 truncate text-[14px] font-bold text-loja-tinta">{zone.name}</span>
                  <span className="shrink-0 text-[14px] font-extrabold text-loja-preco">{formatCurrency(zone.price)}</span>
                  <button type="button" onClick={() => startEdit(zone)} aria-label={`Editar ${zone.name}`} className={botaoIcone}>
                    <Pencil size={15} aria-hidden />
                  </button>
                  <button
                    type="button"
                    onClick={() => deleteZone(zone.id, zone.name)}
                    aria-label={`Remover ${zone.name}`}
                    className={cn(botaoIcone, "hover:bg-[#FBE3DC] hover:text-[#A3271A]")}
                  >
                    <Trash2 size={15} aria-hidden />
                  </button>
                </>
              )}
            </li>
          ))}
        </ul>
      )}

      {/* Adicionar novo bairro */}
      <div className="border-t border-[#F0E6DA] pt-4">
        <p className="mb-3 text-[13px] font-extrabold text-loja-tinta">Adicionar bairro</p>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
          <div className="min-w-0 flex-1">
            <label htmlFor="zona-nova-nome" className={rotuloDoCampo}>Nome do bairro</label>
            <input
              id="zona-nova-nome"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && addZone()}
              placeholder="Ex.: Centro"
              className={cn(campo, "h-12 py-0")}
            />
          </div>
          <div className="sm:w-36">
            <label htmlFor="zona-nova-preco" className={rotuloDoCampo}>Frete (R$)</label>
            <input
              id="zona-nova-preco"
              value={newPrice}
              onChange={(e) => setNewPrice(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && addZone()}
              placeholder="0,00"
              inputMode="decimal"
              className={cn(campo, "h-12 py-0")}
            />
          </div>
          <button
            type="button"
            onClick={addZone}
            className={cn(botaoBrasa, "h-12 shrink-0 px-5 text-[14px]")}
          >
            <Plus size={16} aria-hidden />
            Adicionar
          </button>
        </div>
      </div>
    </div>
  );
}
