"use client";

import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { X } from "lucide-react";
import { toast } from "sonner";
import type { Coupon } from "./CouponsControl";

const schema = z
  .object({
    code: z.string().min(3, "Código deve ter pelo menos 3 caracteres"),
    type: z.enum(["PERCENT", "FIXED", "FREE_SHIPPING"]),
    value: z.string(),
    minOrder: z.string(),
    validFrom: z.string(),
    validUntil: z.string(),
    active: z.boolean(),
  })
  .superRefine((data, ctx) => {
    const value = Number(data.value.replace(",", "."));
    if (data.type === "PERCENT" && (isNaN(value) || value <= 0 || value > 100)) {
      ctx.addIssue({ code: "custom", path: ["value"], message: "Informe uma porcentagem entre 1 e 100" });
    }
    if (data.type === "FIXED" && (isNaN(value) || value <= 0)) {
      ctx.addIssue({ code: "custom", path: ["value"], message: "Informe o valor do desconto" });
    }
    if (data.validFrom && data.validUntil && data.validUntil < data.validFrom) {
      ctx.addIssue({ code: "custom", path: ["validUntil"], message: "A data final não pode ser antes da inicial" });
    }
  });

type FormData = z.infer<typeof schema>;

interface Props {
  open: boolean;
  onClose: () => void;
  coupon: Coupon | null;
  onSaved: (coupon: Coupon) => void;
}

/**
 * O <input type="date"> fala "AAAA-MM-DD" sem fuso. Interpretar isso como UTC
 * adiantaria a virada em 3 horas no Brasil: um cupom "até 31/08" morreria às
 * 21h do dia 30. Por isso a ida ancora no começo e no fim do dia local, e a
 * volta reformata no fuso local — "sv-SE" é o locale que já sai AAAA-MM-DD.
 */
function paraInputDate(iso: string | null): string {
  if (!iso) return "";
  return new Date(iso).toLocaleDateString("sv-SE");
}

function inicioDoDiaLocal(data: string): string | null {
  return data ? new Date(`${data}T00:00:00`).toISOString() : null;
}

function fimDoDiaLocal(data: string): string | null {
  return data ? new Date(`${data}T23:59:59.999`).toISOString() : null;
}

const TIPOS = [
  { value: "PERCENT", label: "Porcentagem" },
  { value: "FIXED", label: "Valor fixo" },
  { value: "FREE_SHIPPING", label: "Frete grátis" },
] as const;

export function CouponModal({ open, onClose, coupon, onSaved }: Props) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const {
    register,
    handleSubmit,
    reset,
    watch,
    formState: { errors },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } = useForm<FormData>({ resolver: zodResolver(schema) as any });

  const type = watch("type");

  useEffect(() => {
    if (coupon) {
      reset({
        code: coupon.code,
        type: coupon.type,
        value: String(coupon.value),
        minOrder: coupon.minOrder ? String(coupon.minOrder) : "",
        validFrom: paraInputDate(coupon.validFrom),
        validUntil: paraInputDate(coupon.validUntil),
        active: coupon.active,
      });
    } else {
      reset({
        code: "",
        type: "PERCENT",
        value: "",
        minOrder: "",
        validFrom: "",
        validUntil: "",
        active: true,
      });
    }
    setError("");
  }, [coupon, open, reset]);

  async function onSubmit(data: FormData) {
    setLoading(true);
    setError("");

    const payload = {
      code: data.code,
      type: data.type,
      // Frete grátis não tem valor: quanto ele abate depende da zona do pedido.
      value: data.type === "FREE_SHIPPING" ? 0 : Number(data.value.replace(",", ".")),
      minOrder: data.minOrder ? Number(data.minOrder.replace(",", ".")) : 0,
      validFrom: inicioDoDiaLocal(data.validFrom),
      validUntil: fimDoDiaLocal(data.validUntil),
      active: data.active,
    };

    const res = coupon
      ? await fetch(`/api/coupons/${coupon.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        })
      : await fetch("/api/coupons", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });

    if (!res.ok) {
      const json = await res.json().catch(() => ({}));
      const msg = json.error?.[0]?.message ?? "Erro ao salvar";
      setError(msg);
      toast.error(msg);
      setLoading(false);
      return;
    }

    const salvo = (await res.json()) as Coupon;
    toast.success(coupon ? "Cupom atualizado!" : "Cupom criado!");
    setLoading(false);
    onSaved(salvo);
  }

  if (!open) return null;

  const campoClasse =
    "w-full px-4 py-2.5 rounded-lg border border-neutral-200 bg-neutral-50 text-sm focus:outline-none focus:ring-2 focus:ring-brand focus:border-transparent transition";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-md max-h-[90vh] overflow-y-auto">
        <div className="sticky top-0 bg-white border-b border-neutral-200 px-6 py-4 flex items-center justify-between rounded-t-2xl">
          <h2 className="text-lg font-semibold">{coupon ? "Editar Cupom" : "Novo Cupom"}</h2>
          <button
            onClick={onClose}
            className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-neutral-100 transition"
          >
            <X size={18} />
          </button>
        </div>

        {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
        <form onSubmit={(handleSubmit as any)(onSubmit)} className="p-6 space-y-4">
          <div>
            <label className="block text-sm font-medium text-neutral-700 mb-1">Código *</label>
            <input
              {...register("code")}
              placeholder="PRIMEIRACOMPRA"
              autoCapitalize="characters"
              className={`${campoClasse} uppercase font-mono tracking-wide`}
            />
            <p className="text-xs text-neutral-400 mt-1">
              É o que o cliente digita no checkout. Espaços e maiúsculas são ajustados sozinhos.
            </p>
            {errors.code && <p className="text-brand text-xs mt-1">{errors.code.message}</p>}
          </div>

          <div>
            <label className="block text-sm font-medium text-neutral-700 mb-1">Tipo *</label>
            <select {...register("type")} className={campoClasse}>
              {TIPOS.map((t) => (
                <option key={t.value} value={t.value}>
                  {t.label}
                </option>
              ))}
            </select>
          </div>

          {type !== "FREE_SHIPPING" && (
            <div>
              <label className="block text-sm font-medium text-neutral-700 mb-1">
                {type === "PERCENT" ? "Desconto (%) *" : "Desconto (R$) *"}
              </label>
              <input
                {...register("value")}
                type="number"
                step={type === "PERCENT" ? "1" : "0.01"}
                min="0"
                placeholder={type === "PERCENT" ? "10" : "15,00"}
                className={campoClasse}
              />
              {errors.value && <p className="text-brand text-xs mt-1">{errors.value.message}</p>}
            </div>
          )}

          {type === "FREE_SHIPPING" && (
            <p className="text-xs text-neutral-500 bg-neutral-50 border border-neutral-200 rounded-lg px-3 py-2">
              Zera a taxa de entrega. Em pedidos de retirada o cupom é recusado, já que não há frete.
            </p>
          )}

          <div>
            <label className="block text-sm font-medium text-neutral-700 mb-1">
              Pedido mínimo (R$)
            </label>
            <input
              {...register("minOrder")}
              type="number"
              step="0.01"
              min="0"
              placeholder="0,00"
              className={campoClasse}
            />
            <p className="text-xs text-neutral-400 mt-1">
              Sobre o valor dos itens, sem contar a taxa de entrega. Deixe vazio para não exigir mínimo.
            </p>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-neutral-700 mb-1">Válido de</label>
              <input {...register("validFrom")} type="date" className={campoClasse} />
            </div>
            <div>
              <label className="block text-sm font-medium text-neutral-700 mb-1">Válido até</label>
              <input {...register("validUntil")} type="date" className={campoClasse} />
              {errors.validUntil && (
                <p className="text-brand text-xs mt-1">{errors.validUntil.message}</p>
              )}
            </div>
          </div>

          <div className="flex items-center gap-3">
            <input {...register("active")} type="checkbox" id="coupon-active" className="w-4 h-4 accent-red-500" />
            <label htmlFor="coupon-active" className="text-sm text-neutral-700">
              Cupom ativo
            </label>
          </div>

          {error && (
            <div className="bg-brand-light border border-brand-muted rounded-lg px-4 py-2.5">
              <p className="text-brand-dark text-sm">{error}</p>
            </div>
          )}

          <div className="flex gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 px-4 py-2.5 rounded-lg border border-neutral-200 text-sm text-neutral-700 hover:bg-neutral-50 transition"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={loading}
              className="flex-1 bg-brand hover:bg-brand-dark disabled:opacity-50 text-white text-sm font-semibold py-2.5 rounded-lg transition"
            >
              {loading ? "Salvando..." : "Salvar"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
