"use client";

import { useState } from "react";
import { Plus, Pencil, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { cn, formatCurrency } from "@/lib/utils";
import { CouponModal } from "./CouponModal";
import { Selo, type TomDoSelo } from "@/components/painel/Selo";
import { botaoBrasa, cartaoPainel, tituloDeSecao } from "@/components/painel/estilos";

export interface Coupon {
  id: string;
  code: string;
  type: "PERCENT" | "FIXED" | "FREE_SHIPPING";
  value: number;
  minOrder: number;
  validFrom: string | null;
  validUntil: string | null;
  active: boolean;
  destaque?: boolean;
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
function situacao(coupon: Coupon): { texto: string; tom: TomDoSelo } | null {
  if (!coupon.active) {
    return { texto: "Inativo", tom: "neutro" };
  }
  const agora = new Date();
  if (coupon.validUntil && new Date(coupon.validUntil) < agora) {
    return { texto: "Expirado", tom: "alerta" };
  }
  if (coupon.validFrom && new Date(coupon.validFrom) > agora) {
    return { texto: "Agendado", tom: "andamento" };
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
    setCoupons((prev) => {
      // O servidor desmarca os outros destaques; a lista acompanha sem buscar.
      const base = salvo.destaque
        ? prev.map((c) => (c.id === salvo.id ? c : { ...c, destaque: false }))
        : prev;
      return base.some((c) => c.id === salvo.id)
        ? base.map((c) => (c.id === salvo.id ? salvo : c))
        : [salvo, ...base];
    });
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
    <section aria-labelledby="titulo-cupons" className={cn(cartaoPainel, "flex flex-col gap-4 p-5")}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 id="titulo-cupons" className={tituloDeSecao}>
            Cupons de desconto
          </h2>
          <p className="mt-0.5 text-[13px] text-loja-tinta-2">
            O cliente digita o código no checkout de entrega e retirada.
          </p>
        </div>
        <button onClick={abrirNovo} className={cn(botaoBrasa, "h-11 px-5 text-[14px] font-extrabold")}>
          <Plus size={16} strokeWidth={2.6} aria-hidden="true" />
          Novo cupom
        </button>
      </div>

      {coupons.length === 0 ? (
        <p className="rounded-[18px] bg-loja-creme px-4 py-6 text-center text-[13px] text-loja-tinta-2">
          Nenhum cupom cadastrado. O campo de cupom só aparece no checkout de entrega e retirada.
        </p>
      ) : (
        <ul className="flex flex-col gap-2">
          {coupons.map((coupon) => {
            const badge = situacao(coupon);
            return (
              <li
                key={coupon.id}
                className="flex items-center gap-3 rounded-[18px] border border-[#F0E6DA] bg-loja-papel py-2 pl-4 pr-1.5"
              >
                <div className="min-w-0 flex-1 py-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-mono text-[14px] font-extrabold tracking-wide text-forest-dark">
                      {coupon.code}
                    </span>
                    {coupon.destaque && <Selo tom="rua">No cardápio</Selo>}
                    {badge && <Selo tom={badge.tom}>{badge.texto}</Selo>}
                  </div>
                  <p className="mt-0.5 truncate text-[12.5px] text-loja-tinta-2">{resumo(coupon)}</p>
                </div>

                <span className="hidden shrink-0 text-[12px] font-semibold text-loja-tinta-2 sm:block">
                  {coupon._count.orders === 0
                    ? "não usado"
                    : `${coupon._count.orders} uso${coupon._count.orders > 1 ? "s" : ""}`}
                </span>

                <button
                  onClick={() => abrirEdicao(coupon)}
                  className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-loja-tinta transition hover:bg-loja-creme"
                  aria-label={`Editar cupom ${coupon.code}`}
                >
                  <Pencil size={15} aria-hidden="true" />
                </button>
                <button
                  onClick={() => excluir(coupon)}
                  className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-loja-tinta-2 transition hover:bg-loja-pessego-claro hover:text-loja-preco"
                  aria-label={`Excluir cupom ${coupon.code}`}
                >
                  <Trash2 size={15} aria-hidden="true" />
                </button>
              </li>
            );
          })}
        </ul>
      )}

      <CouponModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        coupon={editing}
        onSaved={aoSalvar}
      />
    </section>
  );
}

