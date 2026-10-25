"use client";

import { useState, useEffect } from "react";
import { useCart, useCarrinhoHidratado, tirarDoCarrinho } from "@/hooks/useCart";
import { avisoDeIndisponiveis, lerErroDoPedido } from "@/lib/erro-do-pedido";
import { useTable } from "@/hooks/useTable";
import { useRouter, useParams } from "next/navigation";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { formatCurrency } from "@/lib/utils";
import { ArrowLeft, ArrowRight, UtensilsCrossed } from "lucide-react";
import Link from "next/link";
import { botaoBrasa, botaoContorno, campo, cartao } from "@/components/loja/estilos";
import { Miniatura } from "@/components/cart/LinhaDaSacola";

const tituloDoBloco = "text-[15px] font-extrabold text-loja-tinta";
const rotulo = "mb-1.5 block text-[13px] font-bold text-loja-tinta";
const erroDoCampo = "mt-1 text-[12px] font-semibold text-loja-preco";
const caixaDeErro =
  "rounded-2xl border border-loja-pessego bg-loja-pessego-claro px-4 py-3 text-[13px] font-semibold text-loja-preco";

const schema = z.object({
  customerName: z.string().min(2, "Nome deve ter pelo menos 2 caracteres"),
  customerPhone: z.string().optional().or(z.literal("")),
  notes: z.string().optional(),
});

type FormData = z.infer<typeof schema>;

export default function MesaCheckoutPage() {
  const params = useParams<{ token: string }>();
  const router = useRouter();
  const { items, total, clearCart } = useCart();
  const carrinhoHidratado = useCarrinhoHidratado();
  const { getTable } = useTable();
  // Uma chave por tentativa de finalizar: reenvio ou segundo clique devolvem o
  // mesmo pedido em vez de criar outro. Nova visita à página, nova chave.
  const [idempotencyKey] = useState(() => crypto.randomUUID());
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [tableInfo, setTableInfo] = useState<{ tableId: string; tableNumber: number; tableName: string | null } | null>(null);

  const { register, handleSubmit, setError: setErroNoCampo, formState: { errors } } = useForm<FormData>({
    resolver: zodResolver(schema),
  });

  useEffect(() => {
    // getTable só devolve a mesa guardada se ela for a do token da URL. Mesa de
    // outro QR lido antes nesta aba cai no fetch, e o token da URL decide.
    const ctx = getTable(params.token);
    if (ctx) {
      setTableInfo({ tableId: ctx.tableId, tableNumber: ctx.tableNumber, tableName: ctx.tableName });
    } else {
      fetch(`/api/tables/token/${params.token}`)
        .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
        .then((t) => setTableInfo({ tableId: t.id, tableNumber: t.number, tableName: t.name }))
        .catch(() => setError("Não conseguimos identificar a mesa. Leia o QR code de novo."));
    }
  }, [params.token, getTable]);

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
        <Link href={`/mesa/${params.token}/cardapio`} className={`${botaoContorno} h-11`}>
          Ver cardápio
        </Link>
      </div>
    );
  }

  const itemsTotal = total();
  const tableLabel = tableInfo?.tableName || `Mesa ${tableInfo?.tableNumber ?? ""}`;

  async function onSubmit(data: FormData) {
    // Sem a mesa resolvida, o pedido iria sem tableId. Melhor não enviar do
    // que deixar o servidor adivinhar a mesa.
    if (!tableInfo) {
      setError("Ainda identificando a mesa. Tente de novo em instantes.");
      return;
    }
    setLoading(true);
    setError("");

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
          paymentMethod: "CASH",
          notes: data.notes,
          customerName: data.customerName,
          customerPhone: data.customerPhone,
          deliveryType: "DINE_IN",
          deliveryFee: 0,
          idempotencyKey,
          tableId: tableInfo.tableId,
        }),
      });

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
        // A mesa só mostra nome, telefone e observações; o resto fica na
        // mensagem geral.
        for (const campo of ["customerName", "customerPhone", "notes"] as const) {
          const mensagem = erro.campos[campo];
          if (mensagem) setErroNoCampo(campo, { message: mensagem });
        }
        throw new Error(erro.mensagem);
      }

      const order = await orderRes.json();
      clearCart();
      router.push(`/mesa/${params.token}/pedido/${order.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro inesperado");
      setLoading(false);
    }
  }

  return (
    <div className="mx-auto max-w-5xl px-4 pb-12 pt-5">
      <div className="mb-5 flex items-center gap-3">
        <Link
          href={`/mesa/${params.token}/cardapio`}
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
          {/* Mesa info */}
          <div className="flex items-center gap-3 rounded-[20px] bg-loja-folha p-4">
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-forest-dark text-white">
              <UtensilsCrossed size={19} aria-hidden="true" />
            </span>
            <div className="min-w-0">
              <p className="manchete truncate text-[24px] text-forest-dark">{tableLabel}</p>
              <p className="text-[12.5px] font-medium text-forest-dark">O pagamento é feito no balcão ao final</p>
            </div>
          </div>

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
              {errors.customerName ? (
                <p className={erroDoCampo}>{errors.customerName.message}</p>
              ) : (
                <p className="mt-1 text-[12px] text-loja-tinta-2">
                  Usaremos para identificar seu pedido na conta da mesa.
                </p>
              )}
            </div>
            <div>
              <label htmlFor="customerPhone" className={rotulo}>Telefone (opcional)</label>
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
        </div>

        {/* Resumo e confirmação. No desktop acompanha a rolagem do formulário. */}
        <aside className="space-y-3 md:sticky md:top-24">
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
            <div className="border-t border-dashed border-loja-linha pt-3">
              <div className="flex items-baseline justify-between">
                <span className="text-[13px] font-bold text-loja-tinta-2">Total</span>
                <span className="manchete text-[32px] text-forest-dark">{formatCurrency(itemsTotal)}</span>
              </div>
              <p className="mt-1 text-[12px] text-loja-tinta-2">Pagamento no balcão</p>
            </div>
          </section>

          {error && <p className={caixaDeErro}>{error}</p>}

          <button
            type="submit"
            disabled={loading || !tableInfo}
            className={`${botaoBrasa} h-14 w-full text-[15px]`}
          >
            {loading ? "Enviando pedido..." : "Confirmar Pedido"}
            {!loading && <ArrowRight size={17} strokeWidth={2.4} aria-hidden="true" />}
          </button>
        </aside>
      </form>
    </div>
  );
}
