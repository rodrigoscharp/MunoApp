"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { MessageSquare, Printer, Search, X } from "lucide-react";
import { useCanalRealtime } from "@/hooks/useTopicoRealtime";
import { useAgora } from "@/hooks/useAgora";
import { iniciarPollingVisivel } from "@/lib/polling-visivel";
import { proximoStatus, statusAnterior } from "@/lib/kitchen-flow";
import { rotuloDePagamento, type TomDoPagamento } from "@/lib/pagamento-rotulo";
import {
  cn,
  formatCurrency,
  formatDate,
  getCustomerDisplayName,
  ORDER_STATUS_LABELS,
  PAYMENT_METHOD_LABELS,
} from "@/lib/utils";
import { CabecalhoDaTela } from "@/components/painel/CabecalhoDaTela";
import { Selo, type TomDoSelo } from "@/components/painel/Selo";
import { botaoBrasa, cartaoPainel, chip, kicker } from "@/components/painel/estilos";
import type { PrinterConfig } from "@/app/api/settings/printer/route";
import type { DeliveryType, OrderStatus, PaymentMethod, PaymentStatus } from "@/types";

interface OrderItem {
  id: string;
  quantity: number;
  unitPrice: number;
  notes: string | null;
  menuItem: { id: string; name: string; imageUrl: string | null };
}

interface Order {
  id: string;
  status: OrderStatus;
  paymentMethod: PaymentMethod;
  paymentStatus: PaymentStatus;
  deliveryType: string;
  total: number;
  deliveryFee?: number;
  discount?: number;
  couponCode?: string | null;
  notes: string | null;
  customerName: string | null;
  customerPhone: string | null;
  deliveryAddress?: string | null;
  estimatedDeliveryAt?: string | null;
  userId?: string | null;
  createdAt: string;
  updatedAt: string;
  items: OrderItem[];
  user: { name: string; email: string } | null;
  table: { number: number; name: string | null } | null;
}

const TODOS_OS_STATUS: OrderStatus[] = [
  "PENDING",
  "CONFIRMED",
  "IN_PREPARATION",
  "READY",
  "OUT_FOR_DELIVERY",
  "DELIVERED",
  "CANCELLED",
];

const STATUS_VALIDOS = new Set<string>(TODOS_OS_STATUS);
const SITUACOES_VALIDAS = new Set(["UNPAID", "PAID", "REFUNDED"]);
const METODOS_VALIDOS = new Set(["PIX", "CREDIT_CARD", "CASH"]);
const ENCERRADOS = new Set<OrderStatus>(["DELIVERED", "CANCELLED"]);

const TOM_DO_STATUS: Record<OrderStatus, TomDoSelo> = {
  PENDING: "novo",
  CONFIRMED: "andamento",
  IN_PREPARATION: "andamento",
  READY: "pronto",
  OUT_FOR_DELIVERY: "rua",
  DELIVERED: "neutro",
  CANCELLED: "neutro",
};

const TOM_DO_PAGAMENTO: Record<TomDoPagamento, TomDoSelo> = {
  pago: "pago",
  pendente: "andamento",
  "na-entrega": "neutro",
  neutro: "neutro",
};

const COMO: Record<string, string> = { DELIVERY: "Entrega", PICKUP: "Retirada", DINE_IN: "Mesa" };

/**
 * O que um order-updated muda numa linha. Lido com desconfiança: o id chega
 * como `orderId` ou `id`, e campo ausente ou desconhecido não sobrescreve nada.
 */
export function ajusteDoEvento(
  payload: Record<string, unknown>
): { id: string; ajuste: Partial<Order> } | null {
  const id = payload.id ?? payload.orderId;
  if (typeof id !== "string" || !id) return null;
  const ajuste: Partial<Order> = {};
  if (typeof payload.status === "string" && STATUS_VALIDOS.has(payload.status)) {
    ajuste.status = payload.status as OrderStatus;
  }
  if (typeof payload.paymentStatus === "string" && SITUACOES_VALIDAS.has(payload.paymentStatus)) {
    ajuste.paymentStatus = payload.paymentStatus as PaymentStatus;
  }
  if (typeof payload.paymentMethod === "string" && METODOS_VALIDOS.has(payload.paymentMethod)) {
    ajuste.paymentMethod = payload.paymentMethod as PaymentMethod;
  }
  return { id, ajuste };
}

/**
 * Sem previsão gravada (pedido antigo), vale o mesmo padrão que a criação do
 * pedido usa quando o restaurante não configurou o tempo de entrega.
 */
const PREVISAO_PADRAO_MIN = 45;

/**
 * Pedido atrasado: ainda aberto e já passou da previsão prometida ao cliente.
 * A previsão (`estimatedDeliveryAt`) é gravada na criação a partir do tempo
 * de entrega configurado em /adm, então "atrasado" aqui é a mesma promessa
 * que o cliente vê no acompanhamento, não um número inventado pela tela.
 */
export function estaAtrasado(
  pedido: { status: OrderStatus; createdAt: string; estimatedDeliveryAt?: string | null },
  agora: number
): boolean {
  if (ENCERRADOS.has(pedido.status)) return false;
  const limite = pedido.estimatedDeliveryAt
    ? new Date(pedido.estimatedDeliveryAt).getTime()
    : new Date(pedido.createdAt).getTime() + PREVISAO_PADRAO_MIN * 60_000;
  return agora > limite;
}

const semAcento = (s: string) =>
  s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

/** Número curto, cliente ou telefone. Telefone compara só os dígitos. */
export function casaComBusca(pedido: Order, busca: string): boolean {
  const termo = semAcento(busca.trim().replace(/^#/, ""));
  if (!termo) return true;
  if (idCurto(pedido.id).toLowerCase().includes(termo)) return true;
  const nome = getCustomerDisplayName(pedido);
  if (nome && semAcento(nome).includes(termo)) return true;
  if (pedido.table && semAcento(nomeDaMesa(pedido.table)).includes(termo)) return true;
  const digitos = termo.replace(/\D/g, "");
  if (digitos.length >= 3 && pedido.customerPhone?.replace(/\D/g, "").includes(digitos)) return true;
  return false;
}

const idCurto = (id: string) => id.slice(-6).toUpperCase();
const nomeDaMesa = (t: { number: number; name: string | null }) => t.name || `Mesa ${t.number}`;
const minutosDesde = (iso: string, agora: number) =>
  Math.max(0, Math.floor((agora - new Date(iso).getTime()) / 60_000));
const hora = (iso: string) =>
  new Date(iso).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });

function haQuanto(minutos: number) {
  if (minutos < 1) return "agora";
  if (minutos < 60) return `${minutos} min`;
  const h = Math.floor(minutos / 60);
  return `${h}h${minutos % 60 ? ` ${minutos % 60}min` : ""}`;
}

/** O texto do botão principal, pelo passo que ele grava. */
function rotuloDoAvanco(para: OrderStatus, deliveryType: string): string {
  switch (para) {
    case "CONFIRMED":
      return "Aceitar pedido";
    case "IN_PREPARATION":
      return "Começar o preparo";
    case "READY":
      return "Marcar como pronto";
    case "OUT_FOR_DELIVERY":
      return "Saiu para entrega";
    case "DELIVERED":
      return deliveryType === "DINE_IN"
        ? "Marcar como servido"
        : deliveryType === "PICKUP"
        ? "Marcar como retirado"
        : "Marcar como entregue";
    default:
      return ORDER_STATUS_LABELS[para];
  }
}

function passosDoPedido(deliveryType: string): OrderStatus[] {
  return deliveryType === "DELIVERY"
    ? ["PENDING", "CONFIRMED", "IN_PREPARATION", "READY", "OUT_FOR_DELIVERY", "DELIVERED"]
    : ["PENDING", "CONFIRMED", "IN_PREPARATION", "READY", "DELIVERED"];
}

type Filtro = OrderStatus | "ALL" | "ABERTOS";

// Rajada de pedidos (hora do almoço) vira um refresh só.
const ESPERA_DO_REFRESH_MS = 800;

export function AdminOrdersTable({
  orders: doServidor,
  hoje,
  pedidosPorCliente = {},
  comConversa = [],
}: {
  orders: Order[];
  /** Pedidos e receita do dia em Brasília, contados no servidor. */
  hoje?: { pedidos: number; receita: number };
  /** Total de pedidos de cada cliente com conta, por userId. */
  pedidosPorCliente?: Record<string, number>;
  /** Pedidos que têm conversa: o atalho para o chat só aparece neles. */
  comConversa?: string[];
}) {
  // Pelo id, não o objeto: o objeto guardado era um retrato do clique e não
  // acompanhava as mudanças que chegam pelo canal.
  const [selectedId, setSelectedId] = useState<string | null>(null);
  // Abre no que ainda pede ação: é a pergunta da hora do movimento. O
  // histórico continua a um toque, em "Todos" e nos status encerrados.
  const [filter, setFilter] = useState<Filtro>("ABERTOS");
  const [busca, setBusca] = useState("");
  const router = useRouter();
  const agora = useAgora();

  // A lista era um retrato do carregamento: o dono via "Pendente" num pedido
  // já entregue até recarregar a página. Agora a tela escuta o canal da
  // cozinha. Mudança de pedido que já está na lista é remendada aqui; pedido
  // novo (ou que a tela não conhece) pede um router.refresh, que traz a linha
  // completa pelo servidor.
  const [ajustes, setAjustes] = useState<Record<string, Partial<Order>>>({});
  // Lista nova do servidor zera os remendos: ela já é mais nova que eles, e um
  // remendo velho por cima esconderia uma mudança que o aviso não trouxe.
  const [base, setBase] = useState(doServidor);
  if (base !== doServidor) {
    setBase(doServidor);
    setAjustes({});
  }
  const orders = useMemo(
    () => doServidor.map((o) => (ajustes[o.id] ? { ...o, ...ajustes[o.id] } : o)),
    [doServidor, ajustes]
  );
  const selected = orders.find((o) => o.id === selectedId) ?? null;

  const idsRef = useRef<Set<string>>(new Set());
  useEffect(() => {
    idsRef.current = new Set(doServidor.map((o) => o.id));
  }, [doServidor]);

  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(() => () => clearTimeout(timer.current), []);
  const recarregarEmBreve = () => {
    clearTimeout(timer.current);
    timer.current = setTimeout(() => router.refresh(), ESPERA_DO_REFRESH_MS);
  };

  const remendar = (id: string, ajuste: Partial<Order>) =>
    setAjustes((a) => ({ ...a, [id]: { ...a[id], ...ajuste } }));

  const estado = useCanalRealtime("kitchen", null, {
    "order-created": () => recarregarEmBreve(),
    "order-updated": (payload) => {
      const evento = ajusteDoEvento(payload);
      if (!evento || !idsRef.current.has(evento.id)) {
        recarregarEmBreve();
        return;
      }
      remendar(evento.id, evento.ajuste);
    },
  });

  // Sem tempo real, a lista se renova sozinha a cada minuto com a aba visível.
  // É histórico, não fila: um minuto de atraso não custa pedido.
  const conectado = estado === "conectado";
  useEffect(() => {
    if (conectado) return;
    return iniciarPollingVisivel(() => router.refresh(), 60_000);
  }, [conectado, router]);

  // A impressora é a mesma configuração do quadro da cozinha. Lida na
  // montagem, e não no clique: o window.open da impressão precisa sair do
  // gesto do usuário, e um await antes dele cai no bloqueador de pop-up.
  const [papel, setPapel] = useState<PrinterConfig["paperWidth"]>("80mm");
  useEffect(() => {
    fetch("/api/settings/printer")
      .then((r) => (r.ok ? r.json() : null))
      .then((cfg: PrinterConfig | null) => cfg?.paperWidth && setPapel(cfg.paperWidth))
      .catch(() => {});
  }, []);

  // Pedidos com PATCH em andamento: os botões travam, e o `if` no começo da
  // ação cobre o segundo toque que chega antes da repintura — o mesmo cuidado
  // do quadro da cozinha, onde um toque duplo pulava uma etapa.
  const [emAndamento, setEmAndamento] = useState<ReadonlySet<string>>(new Set());

  async function mudarStatus(pedido: Order, para: OrderStatus, aviso: string) {
    if (emAndamento.has(pedido.id)) return;
    const antes = pedido.status;
    setEmAndamento((s) => new Set(s).add(pedido.id));
    remendar(pedido.id, { status: para });
    let ok = false;
    let conflito = false;
    try {
      const res = await fetch(`/api/orders/${pedido.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: para }),
      });
      ok = res.ok;
      conflito = res.status === 409;
    } catch {
      ok = false;
    } finally {
      setEmAndamento((s) => {
        const n = new Set(s);
        n.delete(pedido.id);
        return n;
      });
    }
    if (ok) {
      toast.success(aviso);
      return;
    }
    remendar(pedido.id, { status: antes });
    if (conflito) {
      // Outra tela (a cozinha, o motoboy) mexeu antes: a lista do servidor
      // diz onde o pedido está de verdade.
      toast.error("O pedido mudou em outra tela. A lista foi atualizada.");
      router.refresh();
    } else {
      toast.error("Não foi possível atualizar o pedido.");
    }
  }

  const buscados = useMemo(() => orders.filter((o) => casaComBusca(o, busca)), [orders, busca]);
  const contagem = useMemo(() => {
    const c: Record<string, number> = { ALL: buscados.length, ABERTOS: 0 };
    for (const o of buscados) {
      c[o.status] = (c[o.status] ?? 0) + 1;
      if (!ENCERRADOS.has(o.status)) c.ABERTOS++;
    }
    return c;
  }, [buscados]);

  const filtered = buscados.filter((o) =>
    filter === "ALL" ? true : filter === "ABERTOS" ? !ENCERRADOS.has(o.status) : o.status === filter
  );

  // Esc fecha o detalhe: no celular ele cobre a tela inteira.
  useEffect(() => {
    if (!selectedId) return;
    const aoTeclar = (e: KeyboardEvent) => e.key === "Escape" && setSelectedId(null);
    window.addEventListener("keydown", aoTeclar);
    return () => window.removeEventListener("keydown", aoTeclar);
  }, [selectedId]);

  /*
    OUT_FOR_DELIVERY faltava nos filtros: a coluna de status sabe exibi-lo, mas
    não havia botão para filtrá-lo, e o pedido em rua ficava inalcançável na
    hora exata em que o cliente liga perguntando dele. É o mesmo esquecimento
    que já tinha acontecido na lista de status aceitos pelo PATCH do pedido.
  */
  const filtros: { valor: Filtro; nome: string }[] = [
    { valor: "ABERTOS", nome: "Em andamento" },
    ...TODOS_OS_STATUS.map((s) => ({ valor: s, nome: ORDER_STATUS_LABELS[s] })),
    { valor: "ALL", nome: "Todos" },
  ];

  const contexto = hoje
    ? `Hoje · ${hoje.pedidos} ${hoje.pedidos === 1 ? "pedido" : "pedidos"} · ${formatCurrency(hoje.receita)}`
    : undefined;

  return (
    <div>
      <CabecalhoDaTela contexto={contexto} titulo="Pedidos">
        <label className="flex h-11 w-[300px] max-w-full items-center gap-2.5 rounded-full bg-loja-papel px-4 shadow-loja focus-within:ring-2 focus-within:ring-brand/30">
          <Search size={16} className="shrink-0 text-loja-tinta-2" aria-hidden="true" />
          <input
            type="search"
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            placeholder="Número, cliente ou telefone"
            aria-label="Buscar pedido"
            className="min-w-0 flex-1 bg-transparent text-[13.5px] text-loja-tinta outline-none placeholder:text-loja-tinta-2"
          />
        </label>
      </CabecalhoDaTela>

      <nav aria-label="Filtrar por status" className="mb-4 flex flex-wrap gap-2">
        {filtros.map(({ valor, nome }) => {
          const ativo = filter === valor;
          return (
            <button
              key={valor}
              type="button"
              onClick={() => setFilter(valor)}
              aria-pressed={ativo}
              className={cn(chip, "min-h-11 pr-1.5 sm:min-h-[38px]")}
            >
              {nome}
              <span
                className={cn(
                  "inline-flex h-[26px] min-w-6 items-center justify-center rounded-full px-[7px] text-[11.5px] font-extrabold",
                  ativo ? "bg-forest text-white" : "bg-loja-creme text-loja-tinta"
                )}
              >
                {contagem[valor] ?? 0}
              </span>
            </button>
          );
        })}
      </nav>

      <div className="flex flex-col gap-4 lg:flex-row lg:items-start">
        <section aria-label="Lista de pedidos" className="flex min-w-0 flex-1 flex-col gap-2">
          {filtered.map((order) => {
            const atrasado = estaAtrasado(order, agora);
            const escolhido = order.id === selectedId;
            const nome = getCustomerDisplayName(order);
            const quem = order.table ? nomeDaMesa(order.table) : nome;
            return (
              <button
                key={order.id}
                type="button"
                onClick={() => setSelectedId(order.id)}
                aria-current={escolhido ? "true" : undefined}
                className={cn(
                  "flex w-full items-center gap-4 rounded-[18px] border-2 bg-loja-papel px-4 py-3.5 text-left shadow-loja transition hover:bg-white",
                  escolhido
                    ? "border-brand"
                    : atrasado || order.status === "PENDING"
                    ? "border-[#F2A67F]"
                    : "border-transparent"
                )}
              >
                <div className="flex min-w-[70px] flex-col gap-1">
                  <span className="manchete text-[22px] leading-none text-forest-dark">
                    #{idCurto(order.id)}
                  </span>
                  <span className="text-[11.5px] text-loja-tinta-2">
                    {ENCERRADOS.has(order.status)
                      ? hora(order.createdAt)
                      : haQuanto(minutosDesde(order.createdAt, agora))}
                  </span>
                </div>
                <div className="flex min-w-0 flex-1 flex-col gap-1">
                  <span className="truncate text-[13.5px] font-extrabold text-loja-tinta">
                    {quem ?? "—"}
                    {order.table && nome && (
                      <span className="font-medium text-loja-tinta-2"> · {nome}</span>
                    )}
                    <span className="font-medium text-loja-tinta-2">
                      {" "}
                      · {COMO[order.deliveryType] ?? order.deliveryType}
                    </span>
                  </span>
                  <span className="truncate text-[12.5px] text-[#4E4038]">
                    {order.items
                      .map((i) => `${i.quantity}× ${i.menuItem.name}${i.notes ? ` (${i.notes})` : ""}`)
                      .join(", ")}
                  </span>
                </div>
                <div className="flex shrink-0 flex-col items-end gap-1.5">
                  <div className="flex flex-wrap justify-end gap-1">
                    {atrasado && <Selo tom="alerta">Atrasado</Selo>}
                    <Selo tom={TOM_DO_STATUS[order.status]}>{ORDER_STATUS_LABELS[order.status]}</Selo>
                  </div>
                  <span className="text-[13.5px] font-extrabold text-loja-tinta">
                    {formatCurrency(order.total)}
                  </span>
                </div>
              </button>
            );
          })}
          {filtered.length === 0 && (
            <p className={cn(cartaoPainel, "px-6 py-12 text-center text-[14px] text-loja-tinta-2")}>
              Nenhum pedido encontrado.
            </p>
          )}
        </section>

        {selected ? (
          <DetalheDoPedido
            key={selected.id}
            pedido={selected}
            agora={agora}
            ocupado={emAndamento.has(selected.id)}
            pedidosDoCliente={selected.userId ? pedidosPorCliente[selected.userId] : undefined}
            temConversa={comConversa.includes(selected.id)}
            papel={papel}
            aoFechar={() => setSelectedId(null)}
            aoMudar={(para, aviso) => mudarStatus(selected, para, aviso)}
          />
        ) : (
          <aside
            className={cn(
              cartaoPainel,
              "hidden w-full max-w-[440px] flex-col items-center gap-2 px-6 py-12 text-center lg:flex"
            )}
          >
            <span className="manchete text-[26px] text-forest-dark">Nenhum pedido selecionado</span>
            <span className="text-[13px] text-loja-tinta-2">
              Escolha um pedido na lista para ver os itens e avançar o status.
            </span>
          </aside>
        )}
      </div>
    </div>
  );
}

function DetalheDoPedido({
  pedido,
  agora,
  ocupado,
  pedidosDoCliente,
  temConversa,
  papel,
  aoFechar,
  aoMudar,
}: {
  pedido: Order;
  agora: number;
  ocupado: boolean;
  pedidosDoCliente?: number;
  temConversa: boolean;
  papel: PrinterConfig["paperWidth"];
  aoFechar: () => void;
  aoMudar: (para: OrderStatus, aviso: string) => void;
}) {
  // Confirmação no próprio painel, não window.confirm: o diálogo nativo trava
  // a aba inteira, e com ela o canal e o polling.
  const [confirmandoCancelamento, setConfirmandoCancelamento] = useState(false);
  const curto = idCurto(pedido.id);
  const tipo = pedido.deliveryType as DeliveryType;
  const encerrado = ENCERRADOS.has(pedido.status);
  const proximo = proximoStatus(pedido.status, tipo);
  const anterior = statusAnterior(pedido.status);
  const pagamento = rotuloDePagamento(pedido.paymentMethod, pedido.paymentStatus);
  const nome = getCustomerDisplayName(pedido);
  const atrasado = estaAtrasado(pedido, agora);
  const deliveryFee = Number(pedido.deliveryFee ?? 0);
  const discount = Number(pedido.discount ?? 0);
  const pagoOnline =
    pedido.paymentStatus === "PAID" && pedido.paymentMethod !== "CASH";

  const passos = passosDoPedido(pedido.deliveryType);
  const indiceAtual = passos.indexOf(pedido.status);

  async function imprimir() {
    const { printOrder } = await import("@/lib/printOrder");
    printOrder(
      {
        ...pedido,
        deliveryType: tipo,
        createdAt: new Date(pedido.createdAt),
        updatedAt: new Date(pedido.updatedAt),
      } as Parameters<typeof printOrder>[0],
      papel
    );
  }

  return (
    <aside
      aria-label={`Detalhe do pedido #${curto}`}
      className={cn(
        // No celular é uma tela cheia por cima da lista; no desktop, a coluna
        // ao lado, presa no topo enquanto a lista rola.
        "fixed inset-0 z-50 overflow-y-auto bg-loja-creme p-4",
        "lg:sticky lg:top-4 lg:z-auto lg:w-full lg:max-w-[440px] lg:overflow-visible lg:bg-transparent lg:p-0"
      )}
    >
      <div className={cn(cartaoPainel, "flex flex-col gap-4 p-5")}>
        <div className="flex items-start justify-between gap-3">
          <div className="flex min-w-0 flex-col gap-1">
            <span className={cn(kicker, atrasado ? "text-[#8A3A12]" : "text-loja-preco")}>
              {encerrado
                ? formatDate(pedido.createdAt)
                : `${ORDER_STATUS_LABELS[pedido.status]} · há ${haQuanto(minutosDesde(pedido.createdAt, agora))}${atrasado ? " · atrasado" : ""}`}
            </span>
            <h2 className="manchete text-[36px] leading-[0.95] text-forest-dark">Pedido #{curto}</h2>
          </div>
          <div className="flex shrink-0 items-start gap-2">
            {pagamento && (
              <Selo tom={TOM_DO_PAGAMENTO[pagamento.tom]} className="mt-1">
                {pagamento.texto}
              </Selo>
            )}
            <button
              type="button"
              onClick={aoFechar}
              aria-label="Fechar detalhe"
              className="flex h-11 w-11 items-center justify-center rounded-full text-loja-tinta transition hover:bg-loja-creme"
            >
              <X size={18} aria-hidden="true" />
            </button>
          </div>
        </div>

        <div className="flex items-center gap-3 rounded-2xl bg-loja-creme p-3">
          <span
            aria-hidden="true"
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-forest-dark font-extrabold text-white"
          >
            {(nome ?? "?").charAt(0).toUpperCase()}
          </span>
          <div className="flex min-w-0 flex-1 flex-col gap-0.5 text-[12px] text-[#4E4038]">
            <span className="text-[13.5px] font-extrabold text-loja-tinta">
              {nome ?? "Cliente sem identificação"}
              {pedidosDoCliente !== undefined && (
                <span className="font-semibold text-loja-tinta-2">
                  {" "}
                  · {pedidosDoCliente === 1 ? "1º pedido" : `${pedidosDoCliente} pedidos`}
                </span>
              )}
            </span>
            {pedido.table && <span>{nomeDaMesa(pedido.table)}</span>}
            {pedido.deliveryAddress && <span>{pedido.deliveryAddress}</span>}
            {!pedido.deliveryAddress && !pedido.table && (
              <span>{COMO[pedido.deliveryType] ?? pedido.deliveryType}</span>
            )}
            {pedido.customerPhone && <span>{pedido.customerPhone}</span>}
            {pedido.user?.email && <span className="truncate">{pedido.user.email}</span>}
          </div>
          {temConversa && (
            <Link
              href={`/adm/chats?pedido=${pedido.id}`}
              aria-label={`Abrir conversa do pedido #${curto}`}
              className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-loja-papel text-forest-dark transition hover:bg-white"
            >
              <MessageSquare size={18} aria-hidden="true" />
            </Link>
          )}
        </div>

        <ul className="flex flex-col gap-2.5">
          {pedido.items.map((item) => (
            <li key={item.id} className="flex items-center gap-3">
              {item.menuItem.imageUrl ? (
                // eslint-disable-next-line @next/next/no-img-element -- foto pode vir de host não listado no next.config
                <img
                  src={item.menuItem.imageUrl}
                  alt=""
                  className="h-[46px] w-[46px] shrink-0 rounded-xl object-cover"
                />
              ) : (
                <span aria-hidden="true" className="h-[46px] w-[46px] shrink-0 rounded-xl bg-loja-creme" />
              )}
              <div className="flex min-w-0 flex-1 flex-col">
                <span className="text-[13.5px] font-extrabold text-loja-tinta">
                  <span>{item.quantity}x</span> <span>{item.menuItem.name}</span>
                </span>
                {item.notes && (
                  <span className="text-[12px] font-semibold text-loja-preco">{item.notes}</span>
                )}
              </div>
              <span className="shrink-0 text-[13px] font-bold text-loja-tinta">
                {formatCurrency(item.unitPrice * item.quantity)}
              </span>
            </li>
          ))}
        </ul>

        {pedido.notes && (
          <div className="rounded-2xl bg-loja-pessego-claro px-3.5 py-3">
            <p className={cn(kicker, "text-[#8A3A12]")}>Observação</p>
            <p className="mt-1 text-[13px] text-loja-tinta">{pedido.notes}</p>
          </div>
        )}

        <div className="flex flex-col gap-1.5 border-t border-dashed border-[#E2D2BF] pt-2.5 text-[12.5px] text-[#4E4038]">
          {(deliveryFee > 0 || discount > 0) && (
            <>
              <div className="flex justify-between">
                <span>Subtotal</span>
                <span>{formatCurrency(Number(pedido.total) - deliveryFee + discount)}</span>
              </div>
              {deliveryFee > 0 && (
                <div className="flex justify-between">
                  <span>Taxa de entrega</span>
                  <span>{formatCurrency(deliveryFee)}</span>
                </div>
              )}
              {discount > 0 && (
                <div className="flex justify-between font-bold text-forest-dark">
                  <span>
                    Desconto
                    {pedido.couponCode && <span> · {pedido.couponCode}</span>}
                  </span>
                  <span>-{formatCurrency(discount)}</span>
                </div>
              )}
            </>
          )}
          <div className="flex items-baseline justify-between text-loja-tinta">
            <span className="font-extrabold">Total</span>
            <span className="manchete text-[26px] text-forest-dark">{formatCurrency(pedido.total)}</span>
          </div>
          <span className="text-[11.5px] text-loja-tinta-2">
            {PAYMENT_METHOD_LABELS[pedido.paymentMethod] ?? pedido.paymentMethod}
          </span>
        </div>

        {pedido.status === "CANCELLED" ? (
          <Selo tom="neutro" className="self-start">
            Pedido cancelado
          </Selo>
        ) : (
          <ol aria-label="Andamento" className="flex gap-1.5">
            {passos.map((passo, i) => {
              const feito = i < indiceAtual || (i === indiceAtual && pedido.status === "DELIVERED");
              const atual = i === indiceAtual && pedido.status !== "DELIVERED";
              return (
                <li
                  key={passo}
                  aria-current={atual ? "step" : undefined}
                  className="flex min-w-0 flex-1 flex-col gap-1.5"
                >
                  <span
                    className={cn(
                      "h-1.5 rounded-full",
                      feito ? "bg-forest" : atual ? "bg-brand" : "bg-[#EADCCB]"
                    )}
                  />
                  <span
                    className={cn(
                      "text-[11px] leading-tight",
                      feito
                        ? "font-bold text-forest-dark"
                        : atual
                        ? "font-extrabold text-loja-preco"
                        : "text-loja-tinta-2"
                    )}
                  >
                    {ORDER_STATUS_LABELS[passo]}
                    {i === 0 && <span className="block font-semibold">{hora(pedido.createdAt)}</span>}
                  </span>
                </li>
              );
            })}
          </ol>
        )}

        <div className="flex gap-2">
          {proximo && (
            <button
              type="button"
              disabled={ocupado}
              onClick={() =>
                aoMudar(proximo, `#${curto} → ${ORDER_STATUS_LABELS[proximo]}`)
              }
              className={cn(botaoBrasa, "h-[52px] flex-1 text-[14.5px] font-extrabold")}
            >
              {rotuloDoAvanco(proximo, pedido.deliveryType)}
            </button>
          )}
          <button
            type="button"
            onClick={imprimir}
            aria-label={`Imprimir pedido #${curto}`}
            className={cn(
              "flex h-[52px] items-center justify-center gap-2 rounded-full border-[1.5px] border-loja-linha bg-loja-papel text-loja-tinta transition hover:bg-white",
              proximo ? "w-[52px] shrink-0" : "flex-1 text-[14px] font-bold"
            )}
          >
            <Printer size={18} aria-hidden="true" />
            {!proximo && <span>Imprimir</span>}
          </button>
        </div>

        {!encerrado &&
          (confirmandoCancelamento ? (
            <div role="group" aria-label="Confirmar cancelamento" className="flex flex-col gap-2 rounded-2xl bg-loja-pessego-claro p-3">
              <p className="text-[13px] font-semibold text-loja-tinta">
                Cancelar o pedido #{curto}?
                {pagoOnline && " Ele foi pago online: o estorno é feito à parte, no gateway."}
              </p>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setConfirmandoCancelamento(false)}
                  className="h-11 flex-1 rounded-full bg-loja-papel text-[13px] font-bold text-loja-tinta transition hover:bg-white"
                >
                  Manter pedido
                </button>
                <button
                  type="button"
                  disabled={ocupado}
                  onClick={() => {
                    setConfirmandoCancelamento(false);
                    aoMudar("CANCELLED", `Pedido #${curto} cancelado`);
                  }}
                  className="h-11 flex-1 rounded-full bg-[#8A3A12] text-[13px] font-bold text-white transition hover:bg-[#6E2E0E] disabled:opacity-50"
                >
                  Sim, cancelar
                </button>
              </div>
            </div>
          ) : (
            <div className="flex flex-wrap justify-center gap-x-2">
              {anterior && (
                <button
                  type="button"
                  disabled={ocupado}
                  onClick={() => aoMudar(anterior, `#${curto} ← ${ORDER_STATUS_LABELS[anterior]}`)}
                  className="h-11 rounded-full px-4 text-[13px] font-bold text-loja-tinta-2 transition hover:bg-loja-creme disabled:opacity-50"
                >
                  Voltar para {ORDER_STATUS_LABELS[anterior].toLowerCase()}
                </button>
              )}
              <button
                type="button"
                disabled={ocupado}
                onClick={() => setConfirmandoCancelamento(true)}
                className="h-11 rounded-full px-4 text-[13px] font-bold text-[#8A3A12] transition hover:bg-loja-pessego-claro disabled:opacity-50"
              >
                Cancelar pedido
              </button>
            </div>
          ))}
      </div>
    </aside>
  );
}
