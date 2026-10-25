"use client";

import { useState, useEffect } from "react";
import { flushSync } from "react-dom";
import { createRoot } from "react-dom/client";
import dynamic from "next/dynamic";
import { Plus, Trash2, QrCode, Download, X, TableProperties, Receipt, ClipboardList, Check, Printer, Percent, ArrowLeft, LayoutGrid, Map as MapIcon } from "lucide-react";
import { cn, formatCurrency, formatDate } from "@/lib/utils";
import { toast } from "sonner";
import type { PrinterConfig } from "@/app/api/settings/printer/route";
import { CabecalhoDaTela } from "@/components/painel/CabecalhoDaTela";
import { Selo } from "@/components/painel/Selo";
import {
  botaoBrasa,
  botaoContorno,
  botaoFloresta,
  campo,
  cartaoPainel,
  chip,
  kicker,
  rotulo,
  tituloDeSecao,
} from "@/components/painel/estilos";
import { TableMapView } from "./TableMapView";

// O qrcode.react só é preciso quando o dono abre ou baixa um QR, e não para
// listar as mesas. Carregado sob demanda, ele sai do bundle da tela.
const QRCodeSVG = dynamic(() => import("qrcode.react").then((m) => m.QRCodeSVG), {
  ssr: false,
  loading: () => <div className="h-[200px] w-[200px] animate-pulse rounded-xl bg-loja-creme" />,
});

/** O par QR (ver e baixar): ação de apoio, mais quieta que as da conta. */
const botaoSecundario =
  "inline-flex items-center justify-center gap-2 rounded-full bg-loja-creme px-3 text-[13px] font-bold text-loja-tinta transition hover:bg-loja-pessego-claro";

interface Table {
  id: string;
  number: number;
  name: string | null;
  token: string;
  active: boolean;
  openOrdersCount: number;
  openTotal: number;
  posX: number | null;
  posY: number | null;
}

interface TableOrderItem {
  id: string;
  quantity: number;
  unitPrice: number;
  menuItem: { name: string };
}

interface TableOrder {
  id: string;
  status: string;
  paymentStatus: "UNPAID" | "PAID" | "REFUNDED";
  total: number;
  customerName: string | null;
  createdAt: string;
  items: TableOrderItem[];
}

type PaymentMethodOption = "CASH" | "CREDIT_CARD" | "PIX";

const PAYMENT_METHOD_OPTIONS: { value: PaymentMethodOption; label: string }[] = [
  { value: "CASH", label: "Dinheiro" },
  { value: "CREDIT_CARD", label: "Cartão" },
  { value: "PIX", label: "Pix" },
];

interface BillPersonGroup {
  name: string;
  items: { quantity: number; name: string; unitPrice: number }[];
  subtotal: number;
}

function buildPersonGroups(orders: TableOrder[]): BillPersonGroup[] {
  const map = new Map<string, BillPersonGroup>();
  for (const order of orders) {
    const name = order.customerName?.trim() || "Cliente";
    const group = map.get(name) ?? { name, items: [], subtotal: 0 };
    for (const item of order.items) {
      group.items.push({
        quantity: item.quantity,
        name: item.menuItem.name,
        unitPrice: Number(item.unitPrice),
      });
    }
    group.subtotal += order.total;
    map.set(name, group);
  }
  return Array.from(map.values());
}

export function TableManager() {
  const [tables, setTables] = useState<Table[]>([]);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState<"lista" | "mapa">("lista");
  const [adding, setAdding] = useState(false);
  const [newNumber, setNewNumber] = useState("");
  const [newName, setNewName] = useState("");
  const [saving, setSaving] = useState(false);
  const [qrTable, setQrTable] = useState<Table | null>(null);
  const [origin, setOrigin] = useState("");

  const [ordersTable, setOrdersTable] = useState<Table | null>(null);
  const [tableOrders, setTableOrders] = useState<TableOrder[]>([]);
  const [ordersLoading, setOrdersLoading] = useState(false);

  const [closeBillTable, setCloseBillTable] = useState<Table | null>(null);
  const [closeBillOrders, setCloseBillOrders] = useState<TableOrder[]>([]);
  const [closeBillLoading, setCloseBillLoading] = useState(false);
  const [includeService, setIncludeService] = useState(false);
  const [closing, setClosing] = useState(false);
  const [printerPaperWidth, setPrinterPaperWidth] = useState<"58mm" | "80mm">("80mm");
  const [closeStep, setCloseStep] = useState<"review" | "payment">("review");
  const [paymentLines, setPaymentLines] = useState<{ method: PaymentMethodOption; amount: string }[]>([]);

  useEffect(() => {
    fetch("/api/settings/printer")
      .then((r) => r.json())
      .then((cfg: PrinterConfig) => setPrinterPaperWidth(cfg.paperWidth ?? "80mm"))
      .catch(() => {});
  }, []);

  useEffect(() => {
    setOrigin(window.location.origin);
    load();
  }, []);

  async function load() {
    setLoading(true);
    try {
      const res = await fetch("/api/tables");
      if (res.ok) setTables(await res.json());
    } finally {
      setLoading(false);
    }
  }

  async function handleAdd() {
    const num = parseInt(newNumber);
    if (!num || num < 1) return;
    setSaving(true);
    try {
      const res = await fetch("/api/tables", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ number: num, name: newName || undefined }),
      });
      if (res.ok) {
        setNewNumber("");
        setNewName("");
        setAdding(false);
        await load();
      } else {
        // Sem isto o clique em "Criar mesa" não produzia efeito nenhum na tela:
        // o servidor recusa com 409 e uma mensagem útil ("Já existe uma mesa com
        // esse número") e ela era descartada, deixando o admin sem saber por quê.
        const err = await res.json().catch(() => ({}));
        toast.error(err.error ?? "Erro ao criar mesa");
      }
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id: string) {
    if (!confirm("Excluir esta mesa?")) return;
    await fetch(`/api/tables/${id}`, { method: "DELETE" });
    await load();
  }

  function handlePositionChange(id: string, posX: number, posY: number) {
    setTables((prev) => prev.map((t) => (t.id === id ? { ...t, posX, posY } : t)));
  }

  async function openCloseBill(table: Table) {
    setCloseBillTable(table);
    setIncludeService(false);
    setCloseStep("review");
    setPaymentLines([]);
    setCloseBillLoading(true);
    try {
      const res = await fetch(`/api/tables/${table.id}/orders`);
      if (res.ok) {
        const data = await res.json();
        setCloseBillOrders(data.map((o: TableOrder) => ({ ...o, total: Number(o.total) })));
      }
    } finally {
      setCloseBillLoading(false);
    }
  }

  async function handlePrintBill() {
    if (!closeBillTable) return;
    const { printTableBill } = await import("@/lib/printTableBill");
    const tableLabel = closeBillTable.name || `Mesa ${closeBillTable.number}`;
    printTableBill(tableLabel, buildPersonGroups(closeBillOrders), includeService, printerPaperWidth);
  }

  function goToPayment() {
    setPaymentLines([{ method: "CASH", amount: closeBillGrandTotal.toFixed(2) }]);
    setCloseStep("payment");
  }

  function addPaymentLine() {
    setPaymentLines((prev) => [...prev, { method: "CASH", amount: "" }]);
  }

  function removePaymentLine(index: number) {
    setPaymentLines((prev) => prev.filter((_, i) => i !== index));
  }

  function updatePaymentLine(index: number, patch: Partial<{ method: PaymentMethodOption; amount: string }>) {
    setPaymentLines((prev) => prev.map((line, i) => (i === index ? { ...line, ...patch } : line)));
  }

  async function confirmCloseBill() {
    if (!closeBillTable) return;
    setClosing(true);
    try {
      const res = await fetch(`/api/tables/${closeBillTable.id}/close-bill`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          payments: paymentLines.map((line) => ({
            method: line.method,
            amount: parseFloat(line.amount.replace(",", ".")) || 0,
          })),
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        toast.error(err.error ?? "Erro ao fechar conta");
        return;
      }
      toast.success("Conta fechada");
      const closedTableId = closeBillTable.id;
      setCloseBillTable(null);
      // `openOrdersCount` e `openTotal` do card vêm de /api/tables, e ficavam
      // congelados: depois de fechar, a mesa continuava anunciando "1 pedido em
      // aberto · R$ 100,00" e o garçom achava que o fechamento não pegou.
      // handleAdd e handleDelete já recarregavam; só o caminho do dinheiro não.
      await load();
      if (ordersTable?.id === closedTableId) await loadTableOrders(closedTableId);
    } finally {
      setClosing(false);
    }
  }

  async function openOrders(table: Table) {
    setOrdersTable(table);
    await loadTableOrders(table.id);
  }

  async function loadTableOrders(tableId: string) {
    setOrdersLoading(true);
    try {
      const res = await fetch(`/api/tables/${tableId}/orders`);
      if (res.ok) {
        const data = await res.json();
        setTableOrders(data.map((o: TableOrder) => ({ ...o, total: Number(o.total) })));
      }
    } finally {
      setOrdersLoading(false);
    }
  }

  async function markOrderPaid(order: TableOrder) {
    await fetch(`/api/orders/${order.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ paymentStatus: "PAID" }),
    });
    // A API só devolve pedidos em aberto, então uma vez pago ele sai da lista
    // (a mesa "reseta" pra receber novos clientes/pedidos).
    setTableOrders((prev) => prev.filter((o) => o.id !== order.id));
  }

  async function handleDownloadQR(table: Table) {
    // O SVG é desenhado na hora, fora da tela, em vez de ficar escondido no
    // cartão de cada mesa. Antes eram N QRs renderizados no carregamento para
    // um botão que se aperta de vez em quando, e eles prendiam a biblioteca
    // ao bundle inicial.
    const { QRCodeSVG: Qr } = await import("qrcode.react");
    const container = document.createElement("div");
    const root = createRoot(container);
    flushSync(() => root.render(<Qr value={`${origin}/mesa/${table.token}`} size={256} level="M" />));
    const svg = container.querySelector("svg");
    const svgData = svg ? new XMLSerializer().serializeToString(svg) : null;
    root.unmount();
    if (!svgData) return;

    const canvas = document.createElement("canvas");
    const size = 400;
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext("2d")!;
    const img = new Image();
    img.onload = () => {
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, size, size);
      ctx.drawImage(img, 0, 0, size, size);
      const link = document.createElement("a");
      link.download = `mesa-${table.number}.png`;
      link.href = canvas.toDataURL("image/png");
      link.click();
    };
    img.src = "data:image/svg+xml;base64," + btoa(unescape(encodeURIComponent(svgData)));
  }

  const closeBillGroups = buildPersonGroups(closeBillOrders);
  const closeBillItemsTotal = closeBillGroups.reduce((sum, g) => sum + g.subtotal, 0);
  const closeBillServiceTotal = includeService ? closeBillItemsTotal * 0.1 : 0;
  const closeBillGrandTotal = closeBillItemsTotal + closeBillServiceTotal;
  const paymentSum = paymentLines.reduce((sum, l) => sum + (parseFloat(l.amount.replace(",", ".")) || 0), 0);
  const paymentDiff = closeBillGrandTotal - paymentSum;
  const paymentMatches = Math.abs(paymentDiff) < 0.01;

  const occupiedCount = tables.filter((t) => t.openOrdersCount > 0).length;
  const freeCount = tables.length - occupiedCount;

  const openTotalAll = tables.reduce((sum, t) => sum + t.openTotal, 0);

  const contexto =
    tables.length === 0
      ? "Salão"
      : `${tables.length} mesa${tables.length !== 1 ? "s" : ""} · ${freeCount} livre${freeCount !== 1 ? "s" : ""} · ${occupiedCount} ocupada${occupiedCount !== 1 ? "s" : ""}${occupiedCount > 0 ? ` · ${formatCurrency(openTotalAll)} na mesa` : ""}`;

  return (
    <div className="space-y-5">
      <CabecalhoDaTela contexto={contexto} titulo="Mesas">
        <div role="group" aria-label="Visualização" className="flex items-center gap-1.5">
          <button
            type="button"
            aria-pressed={view === "lista"}
            onClick={() => setView("lista")}
            className={cn(chip, "h-11 shadow-loja")}
          >
            <LayoutGrid size={15} aria-hidden="true" />
            Lista
          </button>
          <button
            type="button"
            aria-pressed={view === "mapa"}
            onClick={() => setView("mapa")}
            className={cn(chip, "h-11 shadow-loja")}
          >
            <MapIcon size={15} aria-hidden="true" />
            Mapa
          </button>
        </div>
        <button onClick={() => setAdding(true)} className={cn(botaoBrasa, "h-11 text-sm")}>
          <Plus size={16} aria-hidden="true" />
          Nova Mesa
        </button>
      </CabecalhoDaTela>

      {/* Form nova mesa */}
      {adding && (
        <section aria-label="Adicionar mesa" className={cn(cartaoPainel, "p-5 sm:p-6")}>
          <h2 className={cn(tituloDeSecao, "mb-4")}>Adicionar mesa</h2>
          <div className="mb-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
            <label className="flex flex-col gap-1.5">
              <span className={rotulo}>Número *</span>
              <input
                type="number"
                min="1"
                value={newNumber}
                onChange={(e) => setNewNumber(e.target.value)}
                placeholder="Ex: 1"
                className={campo}
              />
            </label>
            <label className="flex flex-col gap-1.5">
              <span className={rotulo}>Nome (opcional)</span>
              <input
                type="text"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="Ex: Varanda"
                className={campo}
              />
            </label>
          </div>
          <div className="flex flex-wrap gap-2">
            <button onClick={handleAdd} disabled={saving || !newNumber} className={cn(botaoBrasa, "h-11 text-sm")}>
              {saving ? "Salvando..." : "Criar mesa"}
            </button>
            <button
              onClick={() => { setAdding(false); setNewNumber(""); setNewName(""); }}
              className="h-11 rounded-full px-5 text-sm font-bold text-loja-tinta-2 transition hover:bg-loja-creme hover:text-loja-tinta"
            >
              Cancelar
            </button>
          </div>
        </section>
      )}

      {/* Lista / Mapa de mesas */}
      {loading ? (
        <div className={cn(cartaoPainel, "py-12 text-center text-sm text-loja-tinta-2")}>Carregando mesas...</div>
      ) : tables.length === 0 ? (
        <div className={cn(cartaoPainel, "flex flex-col items-center justify-center gap-3 px-6 py-16 text-center")}>
          <span className="flex h-16 w-16 items-center justify-center rounded-full bg-loja-pessego-claro text-loja-preco">
            <TableProperties size={30} strokeWidth={1.6} aria-hidden="true" />
          </span>
          <p className="text-[15px] font-extrabold text-loja-tinta">Nenhuma mesa cadastrada.</p>
          <p className="text-sm text-loja-tinta-2">Clique em &ldquo;Nova Mesa&rdquo; para começar.</p>
        </div>
      ) : view === "mapa" ? (
        <TableMapView tables={tables} onPositionChange={handlePositionChange} />
      ) : (
        <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {tables.map((table) => {
            const url = `${origin}/mesa/${table.token}`;
            const label = table.name ? `Mesa ${table.number} · ${table.name}` : `Mesa ${table.number}`;
            const occupied = table.openOrdersCount > 0;
            return (
              <li
                key={table.id}
                className={cn(
                  cartaoPainel,
                  "flex flex-col gap-4 p-5",
                  occupied && "ring-[1.5px] ring-brand/45"
                )}
              >
                <div className="flex items-start gap-3">
                  <span
                    aria-hidden="true"
                    className={cn(
                      "manchete flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl text-[30px]",
                      occupied ? "bg-loja-brasa text-white" : "bg-loja-folha text-forest-dark"
                    )}
                  >
                    {table.number}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="text-[15px] font-extrabold text-loja-tinta">{label}</p>
                      <Selo tom={occupied ? "andamento" : "pronto"}>{occupied ? "Ocupada" : "Livre"}</Selo>
                    </div>
                    <p className="mt-1 break-all text-[11.5px] text-loja-tinta-2">{url}</p>
                  </div>
                  <button
                    onClick={() => handleDelete(table.id)}
                    aria-label="Excluir mesa"
                    title="Excluir mesa"
                    className="-mr-2 -mt-2 flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-loja-tinta-2 transition hover:bg-[#FBE4DA] hover:text-[#A3301A]"
                  >
                    <Trash2 size={17} aria-hidden="true" />
                  </button>
                </div>

                {occupied ? (
                  <div className="flex items-end justify-between gap-3 rounded-2xl bg-loja-pessego-claro px-4 py-3">
                    <span className="text-[12.5px] font-bold text-[#8A3A12]">
                      {table.openOrdersCount} pedido{table.openOrdersCount !== 1 ? "s" : ""} em aberto
                    </span>
                    <span className="manchete text-[26px] text-[#8A3A12]">{formatCurrency(table.openTotal)}</span>
                  </div>
                ) : (
                  <div className="rounded-2xl bg-loja-creme px-4 py-3 text-[12.5px] font-semibold text-loja-tinta-2">
                    Pronta para receber clientes
                  </div>
                )}

                <div className="grid grid-cols-2 gap-2">
                  <button
                    onClick={() => openOrders(table)}
                    className={cn(botaoContorno, "h-11 px-3 text-[13px]")}
                  >
                    <ClipboardList size={15} aria-hidden="true" />
                    Ver pedidos
                  </button>
                  <button
                    onClick={() => openCloseBill(table)}
                    className={cn(occupied ? botaoFloresta : botaoContorno, "h-11 px-3 text-[13px]")}
                  >
                    <Receipt size={15} aria-hidden="true" />
                    Fechar conta
                  </button>
                  <button onClick={() => setQrTable(table)} className={cn(botaoSecundario, "h-11")}>
                    <QrCode size={15} aria-hidden="true" />
                    Ver QR
                  </button>
                  <button onClick={() => handleDownloadQR(table)} className={cn(botaoSecundario, "h-11")}>
                    <Download size={15} aria-hidden="true" />
                    Baixar
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {/* Modal QR Code */}
      {qrTable && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-[#2B231E]/55 backdrop-blur-sm" onClick={() => setQrTable(null)} />
          <div
            role="dialog"
            aria-modal="true"
            aria-label={`QR da ${qrTable.name ? `Mesa ${qrTable.number} · ${qrTable.name}` : `Mesa ${qrTable.number}`}`}
            className="relative flex w-full max-w-xs flex-col items-center gap-5 rounded-[24px] bg-loja-papel p-7 shadow-loja-alta"
          >
            <button
              onClick={() => setQrTable(null)}
              aria-label="Fechar"
              className="absolute right-3 top-3 flex h-11 w-11 items-center justify-center rounded-full text-loja-tinta-2 transition hover:bg-loja-creme"
            >
              <X size={18} aria-hidden="true" />
            </button>

            <div className="flex flex-col items-center gap-1.5 pt-2 text-center">
              <span className={cn(kicker, "text-loja-preco")}>Escaneie para acessar o cardápio</span>
              <p className="manchete text-[2rem] text-forest-dark">
                {qrTable.name ? `Mesa ${qrTable.number} · ${qrTable.name}` : `Mesa ${qrTable.number}`}
              </p>
            </div>

            <div className="rounded-2xl bg-white p-4 shadow-loja">
              <QRCodeSVG value={`${origin}/mesa/${qrTable.token}`} size={200} level="M" />
            </div>

            <button onClick={() => { handleDownloadQR(qrTable); }} className={cn(botaoBrasa, "h-12 w-full text-sm")}>
              <Download size={16} aria-hidden="true" />
              Baixar PNG
            </button>
          </div>
        </div>
      )}

      {/* Modal Pedidos da mesa */}
      {ordersTable && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-[#2B231E]/55 backdrop-blur-sm" onClick={() => setOrdersTable(null)} />
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="titulo-pedidos-da-mesa"
            className="relative max-h-[85vh] w-full max-w-lg overflow-y-auto rounded-[24px] bg-loja-papel shadow-loja-alta"
          >
            <div className="sticky top-0 z-10 flex items-start justify-between gap-3 border-b border-loja-linha bg-loja-papel px-6 py-4">
              <div className="flex min-w-0 flex-col gap-1">
                <span className={cn(kicker, "text-loja-preco")}>Pedidos em aberto</span>
                <h2 id="titulo-pedidos-da-mesa" className="manchete text-[1.9rem] text-forest-dark">
                  Pedidos ·{" "}
                  {ordersTable.name ? `Mesa ${ordersTable.number} · ${ordersTable.name}` : `Mesa ${ordersTable.number}`}
                </h2>
                <p className="text-[12.5px] text-loja-tinta-2">Marcar como pago o remove daqui.</p>
              </div>
              <button
                onClick={() => setOrdersTable(null)}
                aria-label="Fechar"
                className="-mr-2 flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-loja-tinta-2 transition hover:bg-loja-creme"
              >
                <X size={18} aria-hidden="true" />
              </button>
            </div>

            <div className="space-y-6 p-6">
              {ordersLoading ? (
                <p className="py-8 text-center text-sm text-loja-tinta-2">Carregando pedidos...</p>
              ) : tableOrders.length === 0 ? (
                <p className="py-8 text-center text-sm text-loja-tinta-2">Nenhum pedido em aberto nesta mesa.</p>
              ) : (
                <ul className="space-y-3">
                  {tableOrders.map((order) => (
                    <li key={order.id} className="rounded-2xl bg-loja-creme p-4">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="text-[13.5px] font-extrabold text-loja-tinta">
                            {order.customerName || "Cliente"}{" "}
                            <span className="font-mono text-xs font-semibold text-loja-tinta-2">
                              #{order.id.slice(-6).toUpperCase()}
                            </span>
                          </p>
                          <p className="text-xs text-loja-tinta-2">{formatDate(order.createdAt)}</p>
                        </div>
                        <span className="shrink-0 text-[14px] font-extrabold text-loja-tinta">
                          {formatCurrency(order.total)}
                        </span>
                      </div>
                      <ul className="mt-2 space-y-0.5">
                        {order.items.map((item) => (
                          <li key={item.id} className="text-[12.5px] text-[#4E4038]">
                            <span className="font-extrabold text-loja-preco">{item.quantity}x</span> {item.menuItem.name}
                          </li>
                        ))}
                      </ul>
                      <button onClick={() => markOrderPaid(order)} className={cn(botaoFloresta, "mt-3 h-11 px-5 text-[13px]")}>
                        <Check size={15} aria-hidden="true" />
                        Marcar como pago
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Modal Fechar conta */}
      {closeBillTable && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div
            className="absolute inset-0 bg-[#2B231E]/55 backdrop-blur-sm"
            onClick={() => !closing && setCloseBillTable(null)}
          />
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="titulo-fechar-conta"
            className="relative max-h-[85vh] w-full max-w-lg overflow-y-auto rounded-[24px] bg-loja-papel shadow-loja-alta"
          >
            <div className="sticky top-0 z-10 flex items-start justify-between gap-3 border-b border-loja-linha bg-loja-papel px-6 py-4">
              <div className="flex min-w-0 flex-col gap-1">
                <span className={cn(kicker, "text-loja-preco")}>
                  {closeStep === "review" ? "Etapa 1 de 2 · Conferência" : "Etapa 2 de 2 · Pagamento"}
                </span>
                <h2 id="titulo-fechar-conta" className="manchete text-[1.9rem] text-forest-dark">
                  Fechar conta ·{" "}
                  {closeBillTable.name
                    ? `Mesa ${closeBillTable.number} · ${closeBillTable.name}`
                    : `Mesa ${closeBillTable.number}`}
                </h2>
                <p className="text-[12.5px] text-loja-tinta-2">
                  {closeStep === "review"
                    ? "Confira a conta antes de imprimir e fechar."
                    : "Informe como o pagamento foi feito."}
                </p>
              </div>
              <button
                onClick={() => setCloseBillTable(null)}
                disabled={closing}
                aria-label="Fechar"
                className="-mr-2 flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-loja-tinta-2 transition hover:bg-loja-creme disabled:opacity-50"
              >
                <X size={18} aria-hidden="true" />
              </button>
            </div>

            <div className="space-y-5 p-6">
              {closeBillLoading ? (
                <p className="py-8 text-center text-sm text-loja-tinta-2">Carregando conta...</p>
              ) : closeBillGroups.length === 0 ? (
                <p className="py-8 text-center text-sm text-loja-tinta-2">Nenhum pedido em aberto nesta mesa.</p>
              ) : closeStep === "payment" ? (
                <>
                  <div className="flex items-center justify-between rounded-2xl bg-forest-dark px-4 py-3 text-white">
                    <span className="text-[13px] font-bold">Total a pagar</span>
                    <span className="manchete text-[28px]">{formatCurrency(closeBillGrandTotal)}</span>
                  </div>

                  <div className="space-y-2">
                    {paymentLines.map((line, idx) => (
                      <div key={idx} className="flex items-center gap-2">
                        <select
                          value={line.method}
                          onChange={(e) => updatePaymentLine(idx, { method: e.target.value as PaymentMethodOption })}
                          aria-label={`Forma de pagamento ${idx + 1}`}
                          className={cn(campo, "h-12 min-w-0 flex-1 py-0")}
                        >
                          {PAYMENT_METHOD_OPTIONS.map((opt) => (
                            <option key={opt.value} value={opt.value}>
                              {opt.label}
                            </option>
                          ))}
                        </select>
                        <input
                          type="number"
                          step="0.01"
                          min="0"
                          value={line.amount}
                          onChange={(e) => updatePaymentLine(idx, { amount: e.target.value })}
                          placeholder="0,00"
                          aria-label={`Valor da forma de pagamento ${idx + 1}`}
                          className={cn(campo, "h-12 w-32 py-0")}
                        />
                        {paymentLines.length > 1 && (
                          <button
                            onClick={() => removePaymentLine(idx)}
                            aria-label={`Remover forma de pagamento ${idx + 1}`}
                            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-loja-tinta-2 transition hover:bg-[#FBE4DA] hover:text-[#A3301A]"
                          >
                            <X size={16} aria-hidden="true" />
                          </button>
                        )}
                      </div>
                    ))}
                    <button
                      onClick={addPaymentLine}
                      className="inline-flex h-11 items-center rounded-full px-1 text-[13px] font-extrabold text-loja-preco hover:underline"
                    >
                      + Adicionar forma de pagamento
                    </button>
                  </div>

                  <div className="space-y-1 border-t border-dashed border-loja-linha pt-3">
                    <div
                      className={cn(
                        "flex justify-between text-sm font-bold",
                        paymentMatches ? "text-loja-tinta-2" : "text-[#A3301A]"
                      )}
                    >
                      <span>Soma informada</span>
                      <span>{formatCurrency(paymentSum)}</span>
                    </div>
                    {!paymentMatches && (
                      <p className="text-xs font-semibold text-[#A3301A]">
                        Diferença de {formatCurrency(Math.abs(paymentDiff))} em relação ao total.
                      </p>
                    )}
                  </div>

                  <div className="flex gap-2">
                    <button
                      onClick={() => setCloseStep("review")}
                      disabled={closing}
                      className={cn(botaoContorno, "h-12 flex-1 px-3 text-sm")}
                    >
                      <ArrowLeft size={16} aria-hidden="true" />
                      Voltar
                    </button>
                    <button
                      onClick={confirmCloseBill}
                      disabled={closing || !paymentMatches}
                      className={cn(botaoBrasa, "h-12 flex-1 px-3 text-sm")}
                    >
                      <Check size={16} aria-hidden="true" />
                      {closing ? "Fechando..." : "Confirmar e fechar"}
                    </button>
                  </div>
                </>
              ) : (
                <>
                  <div className="space-y-3">
                    {closeBillGroups.map((group) => {
                      const service = includeService ? group.subtotal * 0.1 : 0;
                      return (
                        <div key={group.name} className="rounded-2xl bg-loja-creme p-4">
                          <p className="mb-1.5 text-[13.5px] font-extrabold text-loja-tinta">{group.name}</p>
                          <ul className="mb-2 space-y-0.5">
                            {group.items.map((item, idx) => (
                              <li key={idx} className="flex justify-between gap-3 text-[12.5px] text-[#4E4038]">
                                <span>
                                  <span className="font-extrabold text-loja-preco">{item.quantity}x</span> {item.name}
                                </span>
                                <span>{formatCurrency(item.unitPrice * item.quantity)}</span>
                              </li>
                            ))}
                          </ul>
                          <div className="flex justify-between border-t border-dashed border-loja-linha pt-1.5 text-xs text-loja-tinta-2">
                            <span>Subtotal</span>
                            <span>{formatCurrency(group.subtotal)}</span>
                          </div>
                          {includeService && (
                            <div className="flex justify-between text-xs text-loja-tinta-2">
                              <span>Serviço (10%)</span>
                              <span>{formatCurrency(service)}</span>
                            </div>
                          )}
                          <div className="mt-1 flex justify-between text-sm font-extrabold text-loja-tinta">
                            <span>Total</span>
                            <span>{formatCurrency(group.subtotal + service)}</span>
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  <label className="flex min-h-12 cursor-pointer items-center justify-between gap-3 rounded-2xl bg-loja-creme px-4 py-2">
                    <span className="flex items-center gap-2 text-[13px] font-bold text-loja-tinta">
                      <Percent size={15} className="text-loja-preco" aria-hidden="true" />
                      Adicionar 10% de serviço (garçom)
                    </span>
                    <button
                      type="button"
                      role="switch"
                      aria-checked={includeService}
                      onClick={() => setIncludeService((v) => !v)}
                      className={cn(
                        "relative inline-flex h-7 w-12 shrink-0 items-center rounded-full transition-colors",
                        includeService ? "bg-forest-dark" : "bg-[#8A7A6D]"
                      )}
                    >
                      <span
                        className={cn(
                          "inline-block h-5 w-5 transform rounded-full bg-white shadow transition-transform",
                          includeService ? "translate-x-6" : "translate-x-1"
                        )}
                      />
                    </button>
                  </label>

                  <div className="space-y-1 border-t border-dashed border-loja-linha pt-3">
                    <div className="flex justify-between text-sm text-[#4E4038]">
                      <span>Subtotal geral</span>
                      <span>{formatCurrency(closeBillItemsTotal)}</span>
                    </div>
                    {includeService && (
                      <div className="flex justify-between text-sm text-[#4E4038]">
                        <span>Serviço (10%)</span>
                        <span>{formatCurrency(closeBillServiceTotal)}</span>
                      </div>
                    )}
                    <div className="flex items-baseline justify-between text-loja-tinta">
                      <span className="text-sm font-extrabold">Total</span>
                      <span className="manchete text-[28px] text-forest-dark">{formatCurrency(closeBillGrandTotal)}</span>
                    </div>
                  </div>

                  <div className="flex gap-2">
                    <button onClick={handlePrintBill} className={cn(botaoContorno, "h-12 flex-1 px-3 text-sm")}>
                      <Printer size={16} aria-hidden="true" />
                      Imprimir conta
                    </button>
                    <button onClick={goToPayment} className={cn(botaoBrasa, "h-12 flex-1 px-3 text-sm")}>
                      <Check size={16} aria-hidden="true" />
                      Fechar conta
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
