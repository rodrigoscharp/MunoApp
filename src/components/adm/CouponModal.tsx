"use client";

import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { X } from "lucide-react";
import { toast } from "sonner";
import type { Coupon } from "./CouponsControl";
import { cn } from "@/lib/utils";
import { botaoBrasa, botaoContorno, campo, kicker, rotulo } from "@/components/painel/estilos";

const schema = z
  .object({
    code: z.string().min(3, "Código deve ter pelo menos 3 caracteres"),
    type: z.enum(["PERCENT", "FIXED", "FREE_SHIPPING"]),
    value: z.string(),
    minOrder: z.string(),
    validFrom: z.string(),
    validUntil: z.string(),
    active: z.boolean(),
    destaque: z.boolean(),
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
        destaque: coupon.destaque ?? false,
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
        destaque: false,
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
      destaque: data.destaque,
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

  useEffect(() => {
    if (!open) return;
    const aoTeclar = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", aoTeclar);
    return () => window.removeEventListener("keydown", aoTeclar);
  }, [open, onClose]);

  if (!open) return null;

  const erroDoCampo = "mt-1.5 text-[12.5px] font-semibold text-loja-preco";
  const rotuloDoCampo = cn(rotulo, "mb-1.5 block text-[13px]");
  const ajuda = "mt-1.5 text-[12px] text-loja-tinta-2";
  const caixa = "flex min-h-11 cursor-pointer items-start gap-3 text-[14px] font-semibold text-loja-tinta";

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center sm:p-4">
      <div className="absolute inset-0 bg-forest-dark/40 backdrop-blur-[2px]" onClick={onClose} />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="titulo-do-cupom"
        className="relative flex max-h-[92dvh] w-full flex-col overflow-hidden rounded-t-[26px] bg-loja-creme shadow-loja-alta sm:max-w-md sm:rounded-[26px]"
      >
        <div className="flex items-center justify-between gap-3 border-b border-loja-linha bg-loja-papel px-5 py-4">
          <div className="flex flex-col gap-1">
            <span className={`${kicker} text-loja-preco`}>Cupons</span>
            <h2 id="titulo-do-cupom" className="manchete text-[1.9rem] text-forest-dark">
              {coupon ? "Editar cupom" : "Novo cupom"}
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Fechar"
            className="flex h-11 w-11 items-center justify-center rounded-full text-loja-tinta transition hover:bg-loja-creme"
          >
            <X size={18} aria-hidden="true" />
          </button>
        </div>

        {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
        <form onSubmit={(handleSubmit as any)(onSubmit)} className="flex min-h-0 flex-1 flex-col">
          <div className="flex-1 space-y-4 overflow-y-auto px-5 py-5">
            <section className="space-y-4 rounded-[22px] bg-loja-papel p-4 shadow-loja">
              <div>
                <label htmlFor="cupom-codigo" className={rotuloDoCampo}>
                  Código *
                </label>
                <input
                  id="cupom-codigo"
                  {...register("code")}
                  placeholder="PRIMEIRACOMPRA"
                  autoCapitalize="characters"
                  className={cn(campo, "font-mono uppercase tracking-wide")}
                />
                <p className={ajuda}>
                  É o que o cliente digita no checkout. Espaços e maiúsculas são ajustados sozinhos.
                </p>
                {errors.code && <p className={erroDoCampo}>{errors.code.message}</p>}
              </div>

              <div>
                <label htmlFor="cupom-tipo" className={rotuloDoCampo}>
                  Tipo *
                </label>
                <select id="cupom-tipo" {...register("type")} className={cn(campo, "h-[50px] py-0")}>
                  {TIPOS.map((t) => (
                    <option key={t.value} value={t.value}>
                      {t.label}
                    </option>
                  ))}
                </select>
              </div>

              {type !== "FREE_SHIPPING" && (
                <div>
                  <label htmlFor="cupom-valor" className={rotuloDoCampo}>
                    {type === "PERCENT" ? "Desconto (%) *" : "Desconto (R$) *"}
                  </label>
                  <input
                    id="cupom-valor"
                    {...register("value")}
                    type="number"
                    step={type === "PERCENT" ? "1" : "0.01"}
                    min="0"
                    inputMode="decimal"
                    placeholder={type === "PERCENT" ? "10" : "15,00"}
                    className={campo}
                  />
                  {errors.value && <p className={erroDoCampo}>{errors.value.message}</p>}
                </div>
              )}

              {type === "FREE_SHIPPING" && (
                <p className="rounded-2xl bg-loja-folha px-3.5 py-3 text-[12.5px] font-semibold text-forest-dark">
                  Zera a taxa de entrega. Em pedidos de retirada o cupom é recusado, já que não há frete.
                </p>
              )}

              <div>
                <label htmlFor="cupom-minimo" className={rotuloDoCampo}>
                  Pedido mínimo (R$)
                </label>
                <input
                  id="cupom-minimo"
                  {...register("minOrder")}
                  type="number"
                  step="0.01"
                  min="0"
                  inputMode="decimal"
                  placeholder="0,00"
                  className={campo}
                />
                <p className={ajuda}>
                  Sobre o valor dos itens, sem contar a taxa de entrega. Deixe vazio para não exigir mínimo.
                </p>
              </div>
            </section>

            <section className="space-y-4 rounded-[22px] bg-loja-papel p-4 shadow-loja">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label htmlFor="cupom-de" className={rotuloDoCampo}>
                    Válido de
                  </label>
                  <input id="cupom-de" {...register("validFrom")} type="date" className={cn(campo, "px-3")} />
                </div>
                <div>
                  <label htmlFor="cupom-ate" className={rotuloDoCampo}>
                    Válido até
                  </label>
                  <input id="cupom-ate" {...register("validUntil")} type="date" className={cn(campo, "px-3")} />
                  {errors.validUntil && <p className={erroDoCampo}>{errors.validUntil.message}</p>}
                </div>
              </div>

              <label htmlFor="coupon-active" className={cn(caixa, "items-center")}>
                <input {...register("active")} type="checkbox" id="coupon-active" className="h-5 w-5 shrink-0 accent-[#2B5240]" />
                Cupom ativo
              </label>

              <label htmlFor="coupon-destaque" className={caixa}>
                <input
                  {...register("destaque")}
                  type="checkbox"
                  id="coupon-destaque"
                  className="mt-0.5 h-5 w-5 shrink-0 accent-[#2B5240]"
                />
                <span>
                  Anunciar no cardápio
                  <span className="mt-0.5 block text-[12.5px] font-normal text-loja-tinta-2">
                    Aparece num card para todo cliente. Só um cupom por vez: marcar este tira o destaque do outro.
                  </span>
                </span>
              </label>
            </section>

            {error && (
              <div role="alert" className="rounded-2xl bg-loja-pessego-claro px-4 py-3">
                <p className="text-[13.5px] font-semibold text-[#8A3A12]">{error}</p>
              </div>
            )}
          </div>

          <div className="flex gap-3 border-t border-loja-linha bg-loja-papel px-5 py-4">
            <button type="button" onClick={onClose} className={cn(botaoContorno, "h-12 flex-1 px-4 text-[14px]")}>
              Cancelar
            </button>
            <button type="submit" disabled={loading} className={cn(botaoBrasa, "h-12 flex-1 px-4 text-[14px] font-extrabold")}>
              {loading ? "Salvando..." : "Salvar"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
