"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useCart, useCarrinhoHidratado } from "@/hooks/useCart";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { formatCurrency } from "@/lib/utils";
import { PaymentMethodSelector } from "@/components/checkout/PaymentMethodSelector";
import { PaymentMethod } from "@/types";
import { isValidCpf, formatCpf, stripCpf } from "@/lib/cpf";
import { ArrowLeft, Store, Truck, MapPin, TicketPercent, X } from "lucide-react";
import Link from "next/link";

interface DeliveryZone {
  id: string;
  name: string;
  price: number;
}

// Os três estados da lista de bairros. Antes era só a lista, e lista vazia
// queria dizer ao mesmo tempo "carregando", "a busca falhou" e "o restaurante
// não cadastrou bairro": o cliente via "Carregando bairros..." para sempre.
type EstadoDasZonas =
  | { estado: "carregando" }
  | { estado: "erro" }
  | { estado: "pronto"; zonas: DeliveryZone[] };

// O que /api/coupons/validate devolve. É prévia: quem decide o desconto de
// verdade é o POST /api/orders, que revalida tudo antes de gravar o total.
interface AppliedCoupon {
  code: string;
  discount: number;
  freeShipping: boolean;
}

// O jeito de receber e o bairro moram no formulário, e não em estado solto,
// para que o schema possa exigir endereço e telefone só na entrega. Antes essa
// conferência era feita à mão no submit, e o erro aparecia num bloco no fim da
// página, longe do campo que faltava.
const schema = z
  .object({
    deliveryType: z.enum(["PICKUP", "DELIVERY"]),
    zonaId: z.string().optional(),
    customerName: z.string().min(2, "Nome deve ter pelo menos 2 caracteres"),
    customerPhone: z.string().min(8, "Telefone inválido").optional().or(z.literal("")),
    notes: z.string().optional(),
    rua: z.string().optional(),
    numero: z.string().optional(),
    complemento: z.string().optional(),
  })
  .superRefine((dados, ctx) => {
    if (dados.deliveryType !== "DELIVERY") return;
    const falta = (path: string, message: string) => ctx.addIssue({ code: "custom", path: [path], message });
    if (!dados.zonaId) falta("zonaId", "Selecione o bairro de entrega.");
    if (!dados.rua?.trim()) falta("rua", "Informe a rua.");
    if (!dados.numero?.trim()) falta("numero", "Informe o número.");
    if (!dados.customerPhone?.trim()) {
      falta("customerPhone", "Informe um telefone para contato na entrega.");
    }
  });

type FormData = z.infer<typeof schema>;
type DeliveryType = FormData["deliveryType"];

export default function CheckoutPage() {
  const router = useRouter();
  const { data: session } = useSession();
  const { items, total, clearCart } = useCart();
  const carrinhoHidratado = useCarrinhoHidratado();
  // Uma chave por tentativa de finalizar: reenvio ou segundo clique devolvem o
  // mesmo pedido em vez de criar outro. Nova visita à página, nova chave.
  const [idempotencyKey] = useState(() => crypto.randomUUID());
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>("CASH");
  const [enabledMethods, setEnabledMethods] = useState<PaymentMethod[] | null>(null);
  const [requiresPayerDocument, setRequiresPayerDocument] = useState(false);
  const [payerDocument, setPayerDocument] = useState("");
  const [estadoDasZonas, setEstadoDasZonas] = useState<EstadoDasZonas>({ estado: "carregando" });
  const zones = estadoDasZonas.estado === "pronto" ? estadoDasZonas.zonas : [];
  const semEntrega = estadoDasZonas.estado === "pronto" && zones.length === 0;
  const [couponCode, setCouponCode] = useState("");
  const [appliedCoupon, setAppliedCoupon] = useState<AppliedCoupon | null>(null);
  const [couponError, setCouponError] = useState("");
  const [checkingCoupon, setCheckingCoupon] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const { register, handleSubmit, setValue, watch, formState: { errors, isSubmitted } } = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: { deliveryType: "PICKUP", zonaId: "" },
  });
  const deliveryType = watch("deliveryType");
  const zonaId = watch("zonaId");
  const selectedZone = zones.find((z) => z.id === zonaId) ?? null;
  // Revalida na troca depois do primeiro envio, para o erro de entrega sumir
  // quando o cliente muda para retirada.
  const setDeliveryType = useCallback(
    (tipo: DeliveryType) => {
      setValue("deliveryType", tipo, { shouldValidate: isSubmitted });
      setValue("zonaId", "", { shouldValidate: isSubmitted });
    },
    [setValue, isSubmitted]
  );

  // A sessão chega de forma assíncrona, então o prefill é feito por efeito em vez
  // de defaultValues. O ref garante que isso rode uma única vez: o next-auth
  // refaz a sessão a cada foco na aba, e sem a trava o efeito sobrescreveria um
  // nome que o cliente tivesse editado.
  const prefilled = useRef(false);
  useEffect(() => {
    if (prefilled.current) return;
    if (session?.user?.name) {
      setValue("customerName", session.user.name);
      prefilled.current = true;
    }
  }, [session, setValue]);

  // Quais formas de pagamento este restaurante aceita depende do gateway que
  // ele conectou — sem conexão ativa, só dinheiro na entrega.
  useEffect(() => {
    fetch("/api/payments/methods")
      .then((res) => (res.ok ? res.json() : Promise.reject(res.statusText)))
      .then((data: { methods: PaymentMethod[]; requiresPayerDocument: boolean }) => {
        setEnabledMethods(data.methods);
        setRequiresPayerDocument(data.requiresPayerDocument);
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

  const carregarZonas = useCallback(() => {
    setEstadoDasZonas({ estado: "carregando" });
    fetch("/api/delivery-zones")
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((data: DeliveryZone[]) =>
        setEstadoDasZonas({
          estado: "pronto",
          zonas: data.map((z) => ({ ...z, price: Number(z.price) })),
        })
      )
      .catch(() => setEstadoDasZonas({ estado: "erro" }));
  }, []);

  useEffect(() => {
    carregarZonas();
  }, [carregarZonas]);

  // Restaurante sem bairro cadastrado não entrega pelo app: se a entrega
  // estava escolhida quando a lista chegou vazia, volta para retirada.
  useEffect(() => {
    if (semEntrega) setDeliveryType("PICKUP");
  }, [semEntrega, setDeliveryType]);

  // Trocar entrega por retirada derruba um cupom de frete grátis, e mexer no
  // carrinho pode derrubar o pedido mínimo. Em vez de adivinhar qual regra caiu,
  // solta o cupom e deixa o cliente aplicar de novo — assim o valor na tela
  // nunca fica prometendo um desconto que o servidor vai recusar no submit.
  useEffect(() => {
    setAppliedCoupon(null);
    setCouponError("");
  }, [items, deliveryType]);

  // Antes de ler o localStorage o carrinho parece vazio para todo mundo.
  if (!carrinhoHidratado) {
    return (
      <div className="max-w-lg mx-auto px-4 py-16 text-center">
        <p className="text-neutral-400 text-sm">Carregando seu pedido...</p>
      </div>
    );
  }

  if (items.length === 0) {
    return (
      <div className="max-w-lg mx-auto px-4 py-16 text-center">
        <p className="text-neutral-500 mb-4">Seu carrinho está vazio.</p>
        <Link href="/" className="text-brand font-medium hover:underline">Ver cardápio</Link>
      </div>
    );
  }

  const itemsTotal = total();
  const baseFee = deliveryType === "DELIVERY" ? (selectedZone?.price ?? 0) : 0;
  const deliveryFee = appliedCoupon?.freeShipping ? 0 : baseFee;
  const discount = appliedCoupon?.discount ?? 0;
  const grandTotal = itemsTotal + deliveryFee - discount;

  async function aplicarCupom() {
    const code = couponCode.trim();
    if (!code) return;

    setCheckingCoupon(true);
    setCouponError("");

    try {
      const res = await fetch("/api/coupons/validate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          code,
          items: items.map((item) => ({ menuItemId: item.id, quantity: item.quantity })),
          deliveryType,
          deliveryZoneId: deliveryType === "DELIVERY" ? selectedZone?.id : undefined,
        }),
      });

      const json = await res.json().catch(() => ({}));

      if (!res.ok) {
        setAppliedCoupon(null);
        setCouponError(json?.error ?? "Não foi possível aplicar este cupom.");
        return;
      }

      setAppliedCoupon({
        code: json.code,
        discount: Number(json.discount),
        freeShipping: Boolean(json.freeShipping),
      });
      setCouponCode("");
    } catch {
      setCouponError("Não foi possível validar o cupom agora.");
    } finally {
      setCheckingCoupon(false);
    }
  }

  function removerCupom() {
    setAppliedCoupon(null);
    setCouponError("");
  }

  async function onSubmit(data: FormData) {
    // Endereço e telefone da entrega já passaram pelo schema. O bairro também,
    // mas a lista pode ter sido recarregada sem ele.
    if (data.deliveryType === "DELIVERY" && !selectedZone) {
      setError("Selecione o bairro de entrega.");
      return;
    }

    // Só bloqueia quando o gateway do restaurante realmente precisa do CPF
    // e o cliente escolheu pagar online.
    const onlinePayment = paymentMethod === "PIX" || paymentMethod === "CREDIT_CARD";
    if (onlinePayment && requiresPayerDocument && !isValidCpf(payerDocument)) {
      setError("Informe um CPF válido para pagar online.");
      return;
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
          idempotencyKey,
          paymentMethod,
          notes: data.notes,
          customerName: data.customerName,
          customerPhone: data.customerPhone,
          deliveryType,
          deliveryAddress,
          // Manda o id da zona, não o preço: quem decide o valor do frete é o
          // servidor, a partir do que está cadastrado.
          deliveryZoneId: deliveryType === "DELIVERY" ? selectedZone?.id : undefined,
          // Mesma coisa com o cupom: vai o código, não o desconto. O que está
          // na tela veio de /api/coupons/validate e é só prévia.
          couponCode: appliedCoupon?.code,
        }),
      });

      // Sessão expirou entre o login e a confirmação. O carrinho sobrevive ao
      // redirect (zustand/persist), então basta reautenticar e voltar.
      if (orderRes.status === 401) {
        setError("Sua sessão expirou. Faça login novamente para concluir o pedido.");
        router.push("/login?callbackUrl=/checkout");
        return;
      }

      if (!orderRes.ok) {
        const errBody = await orderRes.json().catch(() => ({}));
        throw new Error(errBody?.error ? JSON.stringify(errBody.error) : "Erro ao criar pedido");
      }
      const order = await orderRes.json();

      if (paymentMethod === "PIX" || paymentMethod === "CREDIT_CARD") {
        const paymentRes = await fetch("/api/payments/charge", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            orderId: order.id,
            paymentMethod,
            customerName: data.customerName,
            ...(requiresPayerDocument ? { payerDocument: stripCpf(payerDocument) } : {}),
          }),
        });
        if (!paymentRes.ok) throw new Error("Erro ao iniciar pagamento");
        const payment = await paymentRes.json();
        clearCart();
        // Decide pelo que a cobrança devolveu, não pelo método: alguns
        // gateways entregam QR code, outros só uma URL de checkout
        // hospedado, e isso varia por gateway e não por forma de pagamento.
        // O copia-e-cola basta pra pagar; a imagem do QR é conveniência.
        // Alguns gateways devolvem só um dos dois.
        if (payment.pixCopyPaste || payment.pixQrCode) {
          const qs = new URLSearchParams();
          if (payment.pixQrCode) qs.set("pix", payment.pixQrCode);
          if (payment.pixCopyPaste) qs.set("copy", payment.pixCopyPaste);
          router.push(`/track/${order.id}?${qs}`);
        } else if (payment.checkoutUrl) {
          window.location.href = payment.checkoutUrl;
        } else {
          router.push(`/track/${order.id}`);
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
                  disabled={type === "DELIVERY" && semEntrega}
                  onClick={() => setDeliveryType(type)}
                  className={`flex flex-col items-center gap-2 p-4 rounded-xl border-2 transition disabled:opacity-40 disabled:cursor-not-allowed ${
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

            {semEntrega && (
              <p className="text-xs text-neutral-500">
                Este restaurante não está fazendo entregas pelo app no momento. Você pode retirar
                no local.
              </p>
            )}

            {deliveryType === "DELIVERY" && (
              <div className="space-y-3 pt-1">

                {/* Seletor de bairro */}
                <div>
                  <label className="block text-xs font-medium text-neutral-600 mb-2 flex items-center gap-1">
                    <MapPin size={11} /> Selecione seu bairro *
                  </label>
                  {estadoDasZonas.estado === "carregando" ? (
                    <p className="text-xs text-neutral-400 italic py-2">Carregando bairros disponíveis...</p>
                  ) : estadoDasZonas.estado === "erro" ? (
                    <div className="flex items-center justify-between gap-3 py-2">
                      <p className="text-xs text-brand-dark">
                        Não conseguimos carregar os bairros de entrega.
                      </p>
                      <button
                        type="button"
                        onClick={carregarZonas}
                        className="text-xs font-semibold text-brand hover:underline shrink-0"
                      >
                        Tentar de novo
                      </button>
                    </div>
                  ) : (
                    <select
                      {...register("zonaId")}
                      className="w-full px-3 py-2.5 rounded-lg border border-neutral-200 bg-neutral-50 text-sm text-neutral-700 focus:outline-none focus:ring-2 focus:ring-brand focus:border-transparent transition"
                    >
                      <option value="">Selecione seu bairro</option>
                      {zones.map((zone) => (
                        <option key={zone.id} value={zone.id}>{zone.name}</option>
                      ))}
                    </select>
                  )}
                  {errors.zonaId && <p className="text-brand text-xs mt-1">{errors.zonaId.message}</p>}
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
                    {errors.rua && <p className="text-brand text-xs mt-1">{errors.rua.message}</p>}
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-neutral-600 mb-1">Número *</label>
                    <input
                      {...register("numero")}
                      placeholder="123"
                      className="w-full px-3 py-2 rounded-lg border border-neutral-200 bg-neutral-50 text-sm focus:outline-none focus:ring-2 focus:ring-brand focus:border-transparent transition"
                    />
                    {errors.numero && <p className="text-brand text-xs mt-1">{errors.numero.message}</p>}
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
              <label className="block text-sm font-medium text-neutral-700 mb-1">
                Telefone {deliveryType === "DELIVERY" ? "*" : "(opcional)"}
              </label>
              <input
                {...register("customerPhone")}
                placeholder="(11) 99999-9999"
                className="w-full px-4 py-2.5 rounded-lg border border-neutral-200 bg-neutral-50 text-sm focus:outline-none focus:ring-2 focus:ring-brand focus:border-transparent transition"
              />
              {errors.customerPhone && <p className="text-brand text-xs mt-1">{errors.customerPhone.message}</p>}
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

            {requiresPayerDocument &&
              (paymentMethod === "PIX" || paymentMethod === "CREDIT_CARD") && (
                <div className="mt-3 space-y-1">
                  <label htmlFor="payerDocument" className="block text-sm font-medium text-neutral-700">
                    CPF *
                  </label>
                  <input
                    id="payerDocument"
                    inputMode="numeric"
                    autoComplete="off"
                    placeholder="000.000.000-00"
                    value={payerDocument}
                    onChange={(e) => setPayerDocument(formatCpf(e.target.value))}
                    className="w-full border border-neutral-200 rounded-lg px-3 py-2 text-sm"
                  />
                  <p className="text-xs text-neutral-400">
                    Exigido pelo meio de pagamento deste restaurante para emitir a cobrança.
                  </p>
                </div>
              )}
          </div>

          {/* Cupom de desconto */}
          <div className="bg-white rounded-xl border border-neutral-200 p-5">
            <h2 className="font-semibold text-neutral-900 mb-3 flex items-center gap-2">
              <TicketPercent size={17} className="text-neutral-400" />
              Cupom de desconto
            </h2>

            {appliedCoupon ? (
              <div className="flex items-center gap-2 rounded-lg border border-green-200 bg-green-50 px-3 py-2.5">
                <span className="font-mono text-sm font-semibold tracking-wide text-green-800">
                  {appliedCoupon.code}
                </span>
                <span className="text-sm text-green-700 flex-1 truncate">
                  {appliedCoupon.freeShipping
                    ? "frete grátis aplicado"
                    : `${formatCurrency(appliedCoupon.discount)} de desconto`}
                </span>
                <button
                  type="button"
                  onClick={removerCupom}
                  aria-label="Remover cupom"
                  className="text-green-700 hover:text-green-900 p-1 shrink-0"
                >
                  <X size={15} />
                </button>
              </div>
            ) : (
              <div className="flex gap-2">
                <input
                  value={couponCode}
                  onChange={(e) => setCouponCode(e.target.value)}
                  // Enter dentro do form dispararia o submit do pedido; aqui ele
                  // só aplica o cupom.
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      aplicarCupom();
                    }
                  }}
                  placeholder="Digite seu cupom"
                  autoCapitalize="characters"
                  className="flex-1 min-w-0 px-4 py-2.5 rounded-lg border border-neutral-200 bg-neutral-50 text-sm uppercase font-mono tracking-wide focus:outline-none focus:ring-2 focus:ring-brand focus:border-transparent transition"
                />
                <button
                  type="button"
                  onClick={aplicarCupom}
                  disabled={checkingCoupon || !couponCode.trim()}
                  className="px-4 py-2.5 rounded-lg border border-neutral-200 text-sm font-semibold text-neutral-700 hover:bg-neutral-50 disabled:opacity-40 disabled:cursor-not-allowed transition shrink-0"
                >
                  {checkingCoupon ? "..." : "Aplicar"}
                </button>
              </div>
            )}

            {couponError && <p className="text-brand text-xs mt-2">{couponError}</p>}
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
          <p className="text-center text-xs text-neutral-400">
            Seu nome, telefone e endereço são usados só para este pedido, conforme a{" "}
            <a href="/privacidade" target="_blank" rel="noopener noreferrer" className="underline">
              Política de Privacidade
            </a>
            .
          </p>
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
                <span>
                  {!selectedZone ? (
                    <span className="italic text-xs">selecione o bairro</span>
                  ) : appliedCoupon?.freeShipping ? (
                    <>
                      <span className="line-through text-neutral-400 mr-1.5">{formatCurrency(baseFee)}</span>
                      <span className="text-green-600 font-medium">Grátis</span>
                    </>
                  ) : (
                    formatCurrency(baseFee)
                  )}
                </span>
              </div>
            )}
            {discount > 0 && (
              <div className="flex items-center justify-between text-sm text-green-600">
                <span className="flex items-center gap-1">
                  Desconto
                  {appliedCoupon && (
                    <span className="text-green-500 text-xs font-mono">· {appliedCoupon.code}</span>
                  )}
                </span>
                <span>-{formatCurrency(discount)}</span>
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
