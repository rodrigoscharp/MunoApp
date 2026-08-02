"use client";

import { useState } from "react";
import { Plus, Pencil, Trash2, TicketPercent } from "lucide-react";
import { toast } from "sonner";
import { formatCurrency } from "@/lib/utils";
import { CouponModal } from "./CouponModal";

export interface Coupon {
  id: string;
  code: string;
  type: "PERCENT" | "FIXED" | "FREE_SHIPPING";
  value: number;
  minOrder: number;
  validFrom: string | null;
  validUntil: string | null;
  active: boolean;
  _count: { orders: number };
}

interface Props {
  initialCoupons: Coupon[];
}

function formatarDia(iso: string): string {
  return new Date(iso).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });
}

/** "10% · mín. R$ 40,00 · até 31/08" — a regra inteira numa linha. */
function resumo(coupon: Coupon): string {
  const partes: string[] = [];

  if (coupon.type === "PERCENT") partes.push(`${coupon.value}% de desconto`);
  else if (coupon.type === "FIXED") partes.push(`${formatCurrency(coupon.value)} de desconto`);
  else partes.push("Frete grátis");

  if (coupon.minOrder > 0) partes.push(`mín. ${formatCurrency(coupon.minOrder)}`);

  if (coupon.validFrom && coupon.validUntil) {
    partes.push(`${formatarDia(coupon.validFrom)} a ${formatarDia(coupon.validUntil)}`);
  } else if (coupon.validUntil) {
    partes.push(`até ${formatarDia(coupon.validUntil)}`);
  } else if (coupon.validFrom) {
    partes.push(`a partir de ${formatarDia(coupon.validFrom)}`);
  }

  return partes.join(" · ");
}

/**
 * Por que o cupom não está pegando é a primeira pergunta do dono do
 * restaurante, então o motivo aparece na lista em vez de só "ativo/inativo".
 */
function situacao(coupon: Coupon): { texto: string; classe: string } | null {
  if (!coupon.active) {
    return { texto: "Inativo", classe: "bg-neutral-100 text-neutral-500" };
  }
  const agora = new Date();
  if (coupon.validUntil && new Date(coupon.validUntil) < agora) {
    return { texto: "Expirado", classe: "bg-amber-50 text-amber-700" };
  }
  if (coupon.validFrom && new Date(coupon.validFrom) > agora) {
    return { texto: "Agendado", classe: "bg-blue-50 text-blue-700" };
  }
  return null;
}

export function CouponsControl({ initialCoupons }: Props) {
  const [coupons, setCoupons] = useState<Coupon[]>(initialCoupons);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Coupon | null>(null);

  function abrirNovo() {
    setEditing(null);
    setModalOpen(true);
  }

  function abrirEdicao(coupon: Coupon) {
    setEditing(coupon);
    setModalOpen(true);
  }

  function aoSalvar(salvo: Coupon) {
    setCoupons((prev) =>
      prev.some((c) => c.id === salvo.id)
        ? prev.map((c) => (c.id === salvo.id ? salvo : c))
        : [salvo, ...prev]
    );
    setModalOpen(false);
  }

  async function excluir(coupon: Coupon) {
    const aviso =
      coupon._count.orders > 0
        ? `O cupom "${coupon.code}" já foi usado em ${coupon._count.orders} pedido(s). Os pedidos continuam no histórico. Excluir mesmo assim?`
        : `Excluir o cupom "${coupon.code}"?`;
    if (!confirm(aviso)) return;

    const res = await fetch(`/api/coupons/${coupon.id}`, { method: "DELETE" });
    if (res.ok) {
      setCoupons((prev) => prev.filter((c) => c.id !== coupon.id));
      toast.success(`Cupom "${coupon.code}" removido`);
    } else {
      toast.error("Erro ao remover cupom");
    }
  }

  return (
    <div className="bg-white rounded-xl border border-neutral-200 p-5">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <TicketPercent size={15} className="text-neutral-400" />
          <p className="text-xs text-neutral-400 font-medium uppercase tracking-wide">
            Cupons de Desconto
          </p>
        </div>
        <button
          onClick={abrirNovo}
          className="flex items-center gap-1.5 bg-brand hover:bg-brand-dark text-white text-sm font-semibold px-3 py-1.5 rounded-lg transition"
        >
          <Plus size={14} />
          Novo cupom
        </button>
      </div>

      {coupons.length === 0 ? (
        <p className="text-xs text-neutral-400 italic text-center py-6">
          Nenhum cupom cadastrado. O campo de cupom só aparece no checkout de entrega e retirada.
        </p>
      ) : (
        <div className="space-y-2">
          {coupons.map((coupon) => {
            const badge = situacao(coupon);
            return (
              <div
                key={coupon.id}
                className="flex items-center gap-3 rounded-lg border border-neutral-100 bg-neutral-50 px-3 py-2.5"
              >
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-mono text-sm font-semibold tracking-wide text-neutral-800">
                      {coupon.code}
                    </span>
                    {badge && (
                      <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded ${badge.classe}`}>
                        {badge.texto}
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-neutral-500 mt-0.5 truncate">{resumo(coupon)}</p>
                </div>

                <span className="text-xs text-neutral-400 shrink-0 hidden sm:block">
                  {coupon._count.orders === 0
                    ? "não usado"
                    : `${coupon._count.orders} uso${coupon._count.orders > 1 ? "s" : ""}`}
                </span>

                <button
                  onClick={() => abrirEdicao(coupon)}
                  className="text-neutral-400 hover:text-neutral-600 p-1 shrink-0"
                  aria-label={`Editar cupom ${coupon.code}`}
                >
                  <Pencil size={13} />
                </button>
                <button
                  onClick={() => excluir(coupon)}
                  className="text-neutral-400 hover:text-red-500 p-1 shrink-0"
                  aria-label={`Excluir cupom ${coupon.code}`}
                >
                  <Trash2 size={13} />
                </button>
              </div>
            );
          })}
        </div>
      )}

      <CouponModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        coupon={editing}
        onSaved={aoSalvar}
      />
    </div>
  );
}
