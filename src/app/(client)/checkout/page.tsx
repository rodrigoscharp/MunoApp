"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useCart, useCarrinhoHidratado, tirarDoCarrinho } from "@/hooks/useCart";
import { avisoDeIndisponiveis, lerErroDoPedido, mensagemDaCobrancaQueFalhou } from "@/lib/erro-do-pedido";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { formatCurrency } from "@/lib/utils";
import { PaymentMethodSelector } from "@/components/checkout/PaymentMethodSelector";
import { PaymentMethod } from "@/types";
import { isValidCpf, formatCpf, stripCpf } from "@/lib/cpf";
import { ArrowLeft, ArrowRight, Store, Truck, MapPin, TicketPercent, X } from "lucide-react";
import Link from "next/link";
import { botaoBrasa, botaoContorno, botaoFloresta, campo, cartao } from "@/components/loja/estilos";
import { Miniatura } from "@/components/cart/LinhaDaSacola";

const tituloDoBloco = "text-[15px] font-extrabold text-loja-tinta";
const rotulo = "mb-1.5 block text-[13px] font-bold text-loja-tinta";
const erroDoCampo = "mt-1 text-[12px] font-semibold text-loja-preco";
const caixaDeErro =
  "rounded-2xl border border-loja-pessego bg-loja-pessego-claro px-4 py-3 text-[13px] font-semibold text-loja-preco";

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
  // mesmo pedido em vez de criar outro. Nova visita à página, nova chave. A
  // cobrança que falha também troca a chave: o servidor cancela o pedido, e
  // com a chave antiga o "tentar de novo" recebia o pedido cancelado de volta
  // e esbarrava no 409 da cobrança até a pessoa recarregar a página.
  const [idempotencyKey, setIdempotencyKey] = useState(() => crypto.randomUUID());
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

  const {
    register,
    handleSubmit,
    setValue,
    watch,
    setError: setErroNoCampo,
    formState: { errors, isSubmitted },
  } = useForm<FormData>({
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
      <div className="mx-auto max-w-lg px-4 py-16 text-center">
        <p className="text-sm text-loja-tinta-2">Carregando seu pedido...</p>
      </div>
    );
  }

  if (items.length === 0) {
    return (
      <div className="mx-auto flex max-w-lg flex-col items-center gap-3 px-4 py-16 text-center">
        {/* O carrinho pode ter esvaziado agora, pelo 422 de item fora do ar:
            o aviso de quais itens saíram continua aqui. */}
        {error && <p className={`${caixaDeErro} mb-2 w-full`}>{error}</p>}
        <p className="text-[15px] font-bold text-loja-tinta">Seu carrinho está vazio.</p>
        <Link href="/" className={`${botaoContorno} h-11`}>Ver cardápio</Link>
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
        const erro = lerErroDoPedido(await orderRes.json().catch(() => null));
        // Item que saiu do ar sai do carrinho, e o cliente fica sabendo qual.
        // Reenviar o mesmo carrinho só devolveria o mesmo 422.
        const removidos = tirarDoCarrinho(erro.indisponiveis);
        if (removidos.length > 0) {
          setError(avisoDeIndisponiveis(removidos));
          setLoading(false);
          return;
        }
        for (const [campo, mensagem] of Object.entries(erro.campos)) {
          setErroNoCampo(campo as keyof FormData, { message: mensagem });
        }
        throw new Error(erro.mensagem);
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
        if (!paymentRes.ok) {
          setIdempotencyKey(crypto.randomUUID());
          throw new Error(mensagemDaCobrancaQueFalhou(await paymentRes.json().catch(() => null)));
        }
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
    <div className="mx-auto max-w-5xl px-4 pb-12 pt-5">
      <div className="mb-5 flex items-center gap-3">
        <Link
          href="/"
          aria-label="Voltar ao cardápio"
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-loja-papel text-loja-tinta shadow-loja transition hover:bg-loja-pessego-claro"
        >
          <ArrowLeft size={20} aria-hidden="true" />
        </Link>
        <h1 className="manchete text-[32px] text-forest-dark md:text-[40px]">Finalizar Pedido</h1>
      </div>

      <form
        onSubmit={handleSubmit(onSubmit)}
        className="grid grid-cols-1 items-start gap-5 md:grid-cols-[minmax(0,1fr)_360px] md:gap-6"
      >
        <div className="space-y-5">
          {/* Retirada / Entrega */}
          <section className="space-y-3" aria-labelledby="titulo-receber">
            <h2 id="titulo-receber" className={tituloDoBloco}>Como deseja receber?</h2>
            <div className="grid grid-cols-2 gap-1 rounded-[22px] bg-loja-linha p-1">
              {(["PICKUP", "DELIVERY"] as DeliveryType[]).map((type) => {
                const marcado = deliveryType === type;
                return (
                  <button
                    key={type}
                    type="button"
                    aria-pressed={marcado}
                    disabled={type === "DELIVERY" && semEntrega}
                    onClick={() => setDeliveryType(type)}
                    className={`flex h-11 items-center justify-center gap-2 rounded-[18px] text-[13.5px] transition disabled:cursor-not-allowed disabled:opacity-45 ${
                      marcado
                        ? "bg-loja-papel font-extrabold text-forest-dark shadow-[0_4px_10px_-6px_rgba(74,48,28,0.35)]"
                        : "font-semibold text-loja-tinta-2 hover:text-loja-tinta"
                    }`}
                  >
                    {type === "PICKUP" ? (
                      <Store size={17} aria-hidden="true" />
                    ) : (
                      <Truck size={17} aria-hidden="true" />
                    )}
                    {type === "PICKUP" ? "Retirar no local" : "Entrega"}
                  </button>
                );
              })}
            </div>

            {semEntrega && (
              <p className="px-1 text-[12.5px] text-loja-tinta-2">
                Este restaurante não está fazendo entregas pelo app no momento. Você pode retirar
                no local.
              </p>
            )}

            {deliveryType === "DELIVERY" && (
              <div className={`${cartao} space-y-4 p-4`}>
                {/* Seletor de bairro */}
                <div>
                  <label htmlFor="zonaId" className={`${rotulo} flex items-center gap-1.5`}>
                    <MapPin size={14} className="text-forest" aria-hidden="true" /> Bairro *
                  </label>
                  {estadoDasZonas.estado === "carregando" ? (
                    <p className="py-2 text-[13px] italic text-loja-tinta-2">Carregando bairros disponíveis...</p>
                  ) : estadoDasZonas.estado === "erro" ? (
                    <div className="flex items-center justify-between gap-3 rounded-2xl bg-loja-pessego-claro py-1.5 pl-3.5 pr-1.5">
                      <p className="text-[12.5px] font-semibold text-loja-preco">
                        Não conseguimos carregar os bairros de entrega.
                      </p>
                      <button
                        type="button"
                        onClick={carregarZonas}
                        className="h-11 shrink-0 rounded-full px-3 text-[13px] font-extrabold text-forest-dark hover:bg-loja-papel"
                      >
                        Tentar de novo
                      </button>
                    </div>
                  ) : (
                    <select id="zonaId" {...register("zonaId")} className={campo}>
                      <option value="">Selecione seu bairro</option>
                      {zones.map((zone) => (
                        <option key={zone.id} value={zone.id}>{zone.name}</option>
                      ))}
                    </select>
                  )}
                  {errors.zonaId && <p className={erroDoCampo}>{errors.zonaId.message}</p>}
                </div>

                {/* Endereço */}
                <div className="grid grid-cols-3 gap-3">
                  <div className="col-span-2">
                    <label htmlFor="rua" className={rotulo}>Rua *</label>
                    <input
                      id="rua"
                      {...register("rua")}
                      autoComplete="address-line1"
                      placeholder="Rua das Flores"
                      className={campo}
                    />
                    {errors.rua && <p className={erroDoCampo}>{errors.rua.message}</p>}
                  </div>
                  <div>
                    <label htmlFor="numero" className={rotulo}>Número *</label>
                    <input
                      id="numero"
                      {...register("numero")}
                      inputMode="numeric"
                      placeholder="123"
                      className={campo}
                    />
                    {errors.numero && <p className={erroDoCampo}>{errors.numero.message}</p>}
                  </div>
                </div>
                <div>
                  <label htmlFor="complemento" className={rotulo}>Complemento (opcional)</label>
                  <input
                    id="complemento"
                    {...register("complemento")}
                    autoComplete="address-line2"
                    placeholder="Apto 12, Bloco B"
                    className={campo}
                  />
                </div>
              </div>
            )}
          </section>

          {/* Dados do cliente */}
          <section className={`${cartao} space-y-4 p-4`} aria-labelledby="titulo-dados">
            <h2 id="titulo-dados" className={tituloDoBloco}>Seus dados</h2>
            <div>
              <label htmlFor="customerName" className={rotulo}>Nome *</label>
              <input
                id="customerName"
                {...register("customerName")}
                autoComplete="name"
                placeholder="Seu nome"
                className={campo}
              />
              {errors.customerName && <p className={erroDoCampo}>{errors.customerName.message}</p>}
            </div>
            <div>
              <label htmlFor="customerPhone" className={rotulo}>
                Telefone {deliveryType === "DELIVERY" ? "*" : "(opcional)"}
              </label>
              <input
                id="customerPhone"
                {...register("customerPhone")}
                type="tel"
                inputMode="tel"
                autoComplete="tel"
                placeholder="(11) 99999-9999"
                className={campo}
              />
              {errors.customerPhone && <p className={erroDoCampo}>{errors.customerPhone.message}</p>}
            </div>
            <div>
              <label htmlFor="notes" className={rotulo}>Observações (opcional)</label>
              <textarea
                id="notes"
                {...register("notes")}
                placeholder="Sem cebola, ponto da carne, etc."
                rows={2}
                className={`${campo} resize-none`}
              />
              {errors.notes && <p className={erroDoCampo}>{errors.notes.message}</p>}
            </div>
          </section>

          {/* Pagamento */}
          <section className="space-y-3" aria-labelledby="titulo-pagamento">
            <h2 id="titulo-pagamento" className={tituloDoBloco}>Pagamento</h2>
            <PaymentMethodSelector
              value={paymentMethod}
              onChange={setPaymentMethod}
              enabled={enabledMethods}
            />

            {requiresPayerDocument &&
              (paymentMethod === "PIX" || paymentMethod === "CREDIT_CARD") && (
                <div className={`${cartao} space-y-1.5 p-4`}>
                  <label htmlFor="payerDocument" className={rotulo}>
                    CPF *
                  </label>
                  <input
                    id="payerDocument"
                    inputMode="numeric"
                    autoComplete="off"
                    placeholder="000.000.000-00"
                    value={payerDocument}
                    onChange={(e) => setPayerDocument(formatCpf(e.target.value))}
                    className={campo}
                  />
                  <p className="text-[12px] text-loja-tinta-2">
                    Exigido pelo meio de pagamento deste restaurante para emitir a cobrança.
                  </p>
                </div>
              )}
          </section>

          {/* Cupom de desconto */}
          <section className="space-y-2.5">
            {appliedCoupon ? (
              <>
                <h2 className={tituloDoBloco}>Cupom de desconto</h2>
                <Bilhete>
                  <p className="min-w-0 flex-1 truncate text-[13.5px] font-extrabold text-forest-dark">
                    <span className="font-mono tracking-wide">{appliedCoupon.code}</span>{" "}
                    <span className="font-semibold text-loja-tinta-2">aplicado</span>
                  </p>
                  <span className="shrink-0 text-[13.5px] font-extrabold text-forest-dark">
                    {appliedCoupon.freeShipping
                      ? "frete grátis"
                      : `− ${formatCurrency(appliedCoupon.discount)}`}
                  </span>
                  <button
                    type="button"
                    onClick={removerCupom}
                    aria-label="Remover cupom"
                    className="-mr-2 flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-loja-tinta-2 transition hover:bg-loja-creme hover:text-loja-tinta"
                  >
                    <X size={17} aria-hidden="true" />
                  </button>
                </Bilhete>
              </>
            ) : (
              <>
                <label htmlFor="cupom" className={`${tituloDoBloco} block`}>Cupom de desconto</label>
                <Bilhete>
                  <input
                    id="cupom"
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
                    className="h-11 min-w-0 flex-1 bg-transparent font-mono text-[14px] font-bold uppercase tracking-wide text-forest-dark outline-none placeholder:font-sans placeholder:font-medium placeholder:normal-case placeholder:tracking-normal placeholder:text-loja-tinta-2/80"
                  />
                  <button
                    type="button"
                    onClick={aplicarCupom}
                    disabled={checkingCoupon || !couponCode.trim()}
                    className={`${botaoFloresta} -mr-1.5 h-10 shrink-0 px-4 text-[13px]`}
                  >
                    {checkingCoupon ? "..." : "Aplicar"}
                  </button>
                </Bilhete>
              </>
            )}

            {couponError && <p className={`${erroDoCampo} px-1`}>{couponError}</p>}
          </section>
        </div>

        {/* Resumo e confirmação. No desktop acompanha a rolagem do formulário. */}
        <aside className="space-y-3 md:sticky md:top-32">
          <section className={`${cartao} p-4`} aria-labelledby="titulo-resumo">
            <h2 id="titulo-resumo" className={`${tituloDoBloco} mb-3`}>Resumo do Pedido</h2>
            <ul className="mb-3 space-y-2.5">
              {items.map((item) => (
                <li key={item.cartId} className="flex items-center gap-3">
                  <Miniatura src={item.imageUrl} tamanho={44} />
                  <div className="flex min-w-0 flex-1 gap-1.5">
                    <span className="shrink-0 text-[13px] font-extrabold text-loja-preco">{item.quantity}x</span>
                    <span className="truncate text-[13px] font-semibold text-loja-tinta">{item.name}</span>
                  </div>
                  <span className="shrink-0 text-[13px] font-bold text-loja-tinta">
                    {formatCurrency(item.price * item.quantity)}
                  </span>
                </li>
              ))}
            </ul>
            <div className="space-y-1.5 border-t border-dashed border-loja-linha pt-3 text-[13px] text-loja-tinta-2">
              <div className="flex items-center justify-between">
                <span>Subtotal</span>
                <span>{formatCurrency(itemsTotal)}</span>
              </div>
              {deliveryType === "DELIVERY" && (
                <div className="flex items-center justify-between gap-2">
                  <span className="flex min-w-0 items-center gap-1">
                    Taxa de entrega
                    {selectedZone && <span className="truncate text-[12px]">· {selectedZone.name}</span>}
                  </span>
                  <span className="shrink-0">
                    {!selectedZone ? (
                      <span className="text-[12px] italic">selecione o bairro</span>
                    ) : appliedCoupon?.freeShipping ? (
                      <>
                        <span className="mr-1.5 line-through">{formatCurrency(baseFee)}</span>
                        <span className="font-bold text-forest-dark">Grátis</span>
                      </>
                    ) : (
                      formatCurrency(baseFee)
                    )}
                  </span>
                </div>
              )}
              {discount > 0 && (
                <div className="flex items-center justify-between font-bold text-forest-dark">
                  <span className="flex items-center gap-1">
                    Desconto
                    {appliedCoupon && (
                      <span className="font-mono text-[12px] font-semibold">· {appliedCoupon.code}</span>
                    )}
                  </span>
                  <span>− {formatCurrency(discount)}</span>
                </div>
              )}
              <div className="flex items-baseline justify-between pt-2">
                <span className="text-[13px] font-bold text-loja-tinta-2">Total</span>
                <span className="manchete text-[32px] text-forest-dark">{formatCurrency(grandTotal)}</span>
              </div>
            </div>
          </section>

          {error && <p className={caixaDeErro}>{error}</p>}

          <button
            type="submit"
            disabled={loading}
            className={`${botaoBrasa} h-14 w-full text-[15px]`}
          >
            {loading ? "Processando..." : paymentMethod === "CASH" ? "Confirmar Pedido" : "Ir para Pagamento"}
            {!loading && <ArrowRight size={17} strokeWidth={2.4} aria-hidden="true" />}
          </button>
          <p className="px-2 text-center text-[11.5px] text-loja-tinta-2">
            Seu nome, telefone e endereço são usados só para este pedido, conforme a{" "}
            <a href="/privacidade" target="_blank" rel="noopener noreferrer" className="font-semibold underline">
              Política de Privacidade
            </a>
            .
          </p>
        </aside>
      </form>
    </div>
  );
}

/**
 * O cupom em forma de bilhete: borda tracejada e dois recortes nas laterais,
 * da cor do fundo da página, como o picote de um ingresso.
 */
function Bilhete({ children }: { children: React.ReactNode }) {
  return (
    <div className="relative flex min-h-[56px] items-center gap-2.5 rounded-2xl border-[1.5px] border-dashed border-forest/45 bg-loja-papel py-1.5 pl-4 pr-3">
      <span aria-hidden="true" className="absolute -left-[9px] top-1/2 h-4 w-4 -translate-y-1/2 rounded-full bg-loja-creme" />
      <span aria-hidden="true" className="absolute -right-[9px] top-1/2 h-4 w-4 -translate-y-1/2 rounded-full bg-loja-creme" />
      <TicketPercent size={20} strokeWidth={1.8} className="shrink-0 text-forest" aria-hidden="true" />
      {children}
    </div>
  );
}
