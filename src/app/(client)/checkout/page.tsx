"use client";

import { useState, useEffect } from "react";
import { useCart } from "@/hooks/useCart";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { formatCurrency } from "@/lib/utils";
import { PaymentMethodSelector } from "@/components/checkout/PaymentMethodSelector";
import { PaymentMethod } from "@/types";
import { ArrowLeft, Store, Truck, MapPin } from "lucide-react";
import Link from "next/link";

interface DeliveryZone {
  id: string;
  name: string;
  price: number;
}

const schema = z.object({
  customerName: z.string().min(2, "Nome deve ter pelo menos 2 caracteres"),
  customerPhone: z.string().min(8, "Telefone inválido").optional().or(z.literal("")),
  notes: z.string().optional(),
  rua: z.string().optional(),
  numero: z.string().optional(),
  complemento: z.string().optional(),
});

type FormData = z.infer<typeof schema>;
type DeliveryType = "PICKUP" | "DELIVERY";

export default function CheckoutPage() {
  const router = useRouter();
  const { items, total, clearCart } = useCart();
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>("CASH");
  const [enabledMethods, setEnabledMethods] = useState<PaymentMethod[] | null>(null);
  const [deliveryType, setDeliveryType] = useState<DeliveryType>("PICKUP");
  const [selectedZone, setSelectedZone] = useState<DeliveryZone | null>(null);
  const [zones, setZones] = useState<DeliveryZone[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const { register, handleSubmit, formState: { errors } } = useForm<FormData>({
    resolver: zodResolver(schema),
  });

  // Quais formas de pagamento este restaurante aceita depende do gateway que
  // ele conectou — sem conexão ativa, só dinheiro na entrega.
  useEffect(() => {
    fetch("/api/payments/methods")
      .then((res) => (res.ok ? res.json() : Promise.reject(res.statusText)))
      .then((data: { methods: PaymentMethod[] }) => {
        setEnabledMethods(data.methods);
        // Prefere PIX quando disponível; se o método selecionado deixou de
        // ser aceito, cai pra dinheiro em vez de travar o pedido.
        setPaymentMethod((current) =>
          data.methods.includes(current)
            ? data.methods.includes("PIX")
              ? "PIX"
              : current
            : "CASH"
        );
      })
      .catch(() => setEnabledMethods(["CASH"]));
  }, []);

  useEffect(() => {
    fetch("/api/delivery-zones")
      .then((r) => r.json())
      .then((data: DeliveryZone[]) => setZones(data.map((z) => ({ ...z, price: Number(z.price) }))))
      .catch(() => {});
  }, []);

  if (items.length === 0) {
    return (
      <div className="max-w-lg mx-auto px-4 py-16 text-center">
        <p className="text-neutral-500 mb-4">Seu carrinho está vazio.</p>
        <Link href="/" className="text-brand font-medium hover:underline">Ver cardápio</Link>
      </div>
    );
  }

  const itemsTotal = total();
  const deliveryFee = deliveryType === "DELIVERY" ? (selectedZone?.price ?? 0) : 0;
  const grandTotal = itemsTotal + deliveryFee;

  async function onSubmit(data: FormData) {
    if (deliveryType === "DELIVERY") {
      if (!selectedZone) { setError("Selecione o bairro de entrega."); return; }
      if (!data.rua || !data.numero) { setError("Preencha rua e número."); return; }
    }

    setLoading(true);
    setError("");

    let deliveryAddress: string | undefined;
    if (deliveryType === "DELIVERY") {
      deliveryAddress = [
        `${data.rua}, ${data.numero}`,
        data.complemento,
        selectedZone!.name,
      ].filter(Boolean).join(" - ");
    }

    try {
      const orderRes = await fetch("/api/orders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          items: items.map((item) => ({
            menuItemId: item.id,
            quantity: item.quantity,
            notes: item.notes,
          })),
          paymentMethod,
          notes: data.notes,
          customerName: data.customerName,
          customerPhone: data.customerPhone,
          deliveryType,
          deliveryAddress,
          deliveryFee: deliveryType === "DELIVERY" ? selectedZone?.price ?? 0 : 0,
        }),
      });

      if (!orderRes.ok) {
        const errBody = await orderRes.json().catch(() => ({}));
        throw new Error(errBody?.error ? JSON.stringify(errBody.error) : "Erro ao criar pedido");
      }
      const order = await orderRes.json();

      if (paymentMethod === "PIX" || paymentMethod === "CREDIT_CARD") {
        const paymentRes = await fetch("/api/payments/charge", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ orderId: order.id, paymentMethod, customerName: data.customerName }),
        });
        if (!paymentRes.ok) throw new Error("Erro ao iniciar pagamento");
        const payment = await paymentRes.json();
        clearCart();
        if (paymentMethod === "PIX") {
          router.push(`/track/${order.id}?pix=${encodeURIComponent(payment.pixQrCode)}&copy=${encodeURIComponent(payment.pixCopyPaste)}`);
        } else {
          window.location.href = payment.checkoutUrl;
        }
      } else {
        clearCart();
        router.push(`/track/${order.id}`);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro inesperado");
      setLoading(false);
    }
  }

  return (
    <div className="max-w-2xl mx-auto px-4 py-8">
      <Link href="/" className="flex items-center gap-2 text-sm text-neutral-500 hover:text-neutral-700 mb-6 transition">
        <ArrowLeft size={16} />
        Voltar ao cardápio
      </Link>

      <h1 className="text-2xl font-bold text-neutral-900 mb-6">Finalizar Pedido</h1>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">

          {/* Retirada / Entrega */}
          <div className="bg-white rounded-xl border border-neutral-200 p-5 space-y-4">
            <h2 className="font-semibold text-neutral-900">Como deseja receber?</h2>
            <div className="grid grid-cols-2 gap-3">
              {(["PICKUP", "DELIVERY"] as DeliveryType[]).map((type) => (
                <button
                  key={type}
                  type="button"
                  onClick={() => { setDeliveryType(type); setSelectedZone(null); }}
                  className={`flex flex-col items-center gap-2 p-4 rounded-xl border-2 transition ${
                    deliveryType === type
                      ? "border-brand bg-brand-light text-brand"
                      : "border-neutral-200 text-neutral-500 hover:border-neutral-300"
                  }`}
                >
                  {type === "PICKUP" ? <Store size={22} /> : <Truck size={22} />}
                  <span className="text-sm font-semibold">
                    {type === "PICKUP" ? "Retirar no local" : "Entrega"}
                  </span>
                </button>
              ))}
            </div>

            {deliveryType === "DELIVERY" && (
              <div className="space-y-3 pt-1">

                {/* Seletor de bairro */}
                <div>
                  <label className="block text-xs font-medium text-neutral-600 mb-2 flex items-center gap-1">
                    <MapPin size={11} /> Selecione seu bairro *
                  </label>
                  {zones.length === 0 ? (
                    <p className="text-xs text-neutral-400 italic py-2">Carregando bairros disponíveis...</p>
                  ) : (
                    <select
                      value={selectedZone?.id ?? ""}
                      onChange={(e) => {
                        const zone = zones.find((z) => z.id === e.target.value) ?? null;
                        setSelectedZone(zone);
                      }}
                      className="w-full px-3 py-2.5 rounded-lg border border-neutral-200 bg-neutral-50 text-sm text-neutral-700 focus:outline-none focus:ring-2 focus:ring-brand focus:border-transparent transition"
                    >
                      <option value="">Selecione seu bairro</option>
                      {zones.map((zone) => (
                        <option key={zone.id} value={zone.id}>{zone.name}</option>
                      ))}
                    </select>
                  )}
                </div>

                {/* Endereço */}
                <div className="grid grid-cols-3 gap-3">
                  <div className="col-span-2">
                    <label className="block text-xs font-medium text-neutral-600 mb-1">Rua *</label>
                    <input
                      {...register("rua")}
                      placeholder="Rua das Flores"
                      className="w-full px-3 py-2 rounded-lg border border-neutral-200 bg-neutral-50 text-sm focus:outline-none focus:ring-2 focus:ring-brand focus:border-transparent transition"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-neutral-600 mb-1">Número *</label>
                    <input
                      {...register("numero")}
                      placeholder="123"
                      className="w-full px-3 py-2 rounded-lg border border-neutral-200 bg-neutral-50 text-sm focus:outline-none focus:ring-2 focus:ring-brand focus:border-transparent transition"
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-medium text-neutral-600 mb-1">Complemento (opcional)</label>
                  <input
                    {...register("complemento")}
                    placeholder="Apto 12, Bloco B"
                    className="w-full px-3 py-2 rounded-lg border border-neutral-200 bg-neutral-50 text-sm focus:outline-none focus:ring-2 focus:ring-brand focus:border-transparent transition"
                  />
                </div>
              </div>
            )}
          </div>

          {/* Dados do cliente */}
          <div className="bg-white rounded-xl border border-neutral-200 p-5 space-y-4">
            <h2 className="font-semibold text-neutral-900">Seus dados</h2>
            <div>
              <label className="block text-sm font-medium text-neutral-700 mb-1">Nome *</label>
              <input
                {...register("customerName")}
                placeholder="Seu nome"
                className="w-full px-4 py-2.5 rounded-lg border border-neutral-200 bg-neutral-50 text-sm focus:outline-none focus:ring-2 focus:ring-brand focus:border-transparent transition"
              />
              {errors.customerName && <p className="text-brand text-xs mt-1">{errors.customerName.message}</p>}
            </div>
            <div>
              <label className="block text-sm font-medium text-neutral-700 mb-1">Telefone (opcional)</label>
              <input
                {...register("customerPhone")}
                placeholder="(11) 99999-9999"
                className="w-full px-4 py-2.5 rounded-lg border border-neutral-200 bg-neutral-50 text-sm focus:outline-none focus:ring-2 focus:ring-brand focus:border-transparent transition"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-neutral-700 mb-1">Observações (opcional)</label>
              <textarea
                {...register("notes")}
                placeholder="Sem cebola, ponto da carne, etc."
                rows={2}
                className="w-full px-4 py-2.5 rounded-lg border border-neutral-200 bg-neutral-50 text-sm focus:outline-none focus:ring-2 focus:ring-brand focus:border-transparent transition resize-none"
              />
            </div>
          </div>

          {/* Pagamento */}
          <div className="bg-white rounded-xl border border-neutral-200 p-5">
            <h2 className="font-semibold text-neutral-900 mb-3">Pagamento</h2>
            <PaymentMethodSelector
              value={paymentMethod}
              onChange={setPaymentMethod}
              enabled={enabledMethods}
            />
          </div>

          {error && (
            <div className="bg-brand-light border border-brand-muted rounded-lg px-4 py-3">
              <p className="text-brand-dark text-sm">{error}</p>
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-brand hover:bg-brand-dark disabled:opacity-50 disabled:cursor-not-allowed text-white font-semibold py-3 rounded-xl transition"
          >
            {loading ? "Processando..." : paymentMethod === "CASH" ? "Confirmar Pedido" : "Ir para Pagamento"}
          </button>
        </form>

        {/* Resumo */}
        <div className="bg-white rounded-xl border border-neutral-200 p-5 h-fit">
          <h2 className="font-semibold text-neutral-900 mb-4">Resumo do Pedido</h2>
          <ul className="space-y-3 mb-4">
            {items.map((item) => (
              <li key={item.cartId} className="flex items-start justify-between gap-2">
                <div className="flex gap-2 min-w-0">
                  <span className="text-sm font-bold text-brand flex-shrink-0">{item.quantity}x</span>
                  <span className="text-sm text-neutral-800 truncate">{item.name}</span>
                </div>
                <span className="text-sm font-medium text-neutral-700 flex-shrink-0">
                  {formatCurrency(item.price * item.quantity)}
                </span>
              </li>
            ))}
          </ul>
          <div className="border-t border-neutral-100 pt-3 space-y-1.5">
            <div className="flex items-center justify-between text-sm text-neutral-500">
              <span>Subtotal</span>
              <span>{formatCurrency(itemsTotal)}</span>
            </div>
            {deliveryType === "DELIVERY" && (
              <div className="flex items-center justify-between text-sm text-neutral-500">
                <span className="flex items-center gap-1">
                  Taxa de entrega
                  {selectedZone && <span className="text-neutral-400 text-xs">· {selectedZone.name}</span>}
                </span>
                <span>{selectedZone ? formatCurrency(selectedZone.price) : <span className="italic text-xs">selecione o bairro</span>}</span>
              </div>
            )}
            <div className="flex items-center justify-between pt-1">
              <span className="font-semibold text-neutral-700">Total</span>
              <span className="text-xl font-bold text-neutral-900">{formatCurrency(grandTotal)}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
