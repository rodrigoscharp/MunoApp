"use client";

import { useState, useEffect, useRef } from "react";
import { QRCodeSVG } from "qrcode.react";
import { Plus, Trash2, QrCode, Download, X, TableProperties, Receipt, ClipboardList, Check, Printer, Percent, ArrowLeft, CircleDot, CircleCheck } from "lucide-react";
import { formatCurrency, formatDate } from "@/lib/utils";
import { toast } from "sonner";
import type { PrinterConfig } from "@/app/api/settings/printer/route";

interface Table {
  id: string;
  number: number;
  name: string | null;
  token: string;
  active: boolean;
  openOrdersCount: number;
  openTotal: number;
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
  const [adding, setAdding] = useState(false);
  const [newNumber, setNewNumber] = useState("");
  const [newName, setNewName] = useState("");
  const [saving, setSaving] = useState(false);
  const [qrTable, setQrTable] = useState<Table | null>(null);
  const [origin, setOrigin] = useState("");
  const qrRef = useRef<SVGSVGElement>(null);

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

  function handleDownloadQR(table: Table) {
    const svg = document.getElementById(`qr-${table.id}`) as unknown as SVGSVGElement;
    if (!svg) return;

    const svgData = new XMLSerializer().serializeToString(svg);
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

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 className="text-lg font-bold text-neutral-900">Mesas</h2>
          <p className="text-sm text-neutral-500 mt-0.5">
            Gere QR codes e acompanhe o status de cada mesa do estabelecimento.
          </p>
        </div>
        <div className="flex items-center gap-5">
          {tables.length > 0 && (
            <div className="flex items-center gap-4 text-xs font-medium text-neutral-500">
              <span className="flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-emerald-500" />
                {freeCount} livre{freeCount !== 1 ? "s" : ""}
              </span>
              <span className="flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-amber-500" />
                {occupiedCount} em aberto
              </span>
            </div>
          )}
          <button
            onClick={() => setAdding(true)}
            className="flex items-center gap-2 bg-brand hover:bg-brand-dark text-white text-sm font-semibold px-4 py-2 rounded-xl transition shadow-sm"
          >
            <Plus size={16} />
            Nova Mesa
          </button>
        </div>
      </div>

      {/* Form nova mesa */}
      {adding && (
        <div className="bg-white rounded-xl border border-neutral-200 p-5">
          <h3 className="font-semibold text-neutral-900 mb-4">Adicionar mesa</h3>
          <div className="grid grid-cols-2 gap-3 mb-4">
            <div>
              <label className="block text-xs font-medium text-neutral-600 mb-1">Número *</label>
              <input
                type="number"
                min="1"
                value={newNumber}
                onChange={(e) => setNewNumber(e.target.value)}
                placeholder="Ex: 1"
                className="w-full px-3 py-2 rounded-lg border border-neutral-200 bg-neutral-50 text-sm focus:outline-none focus:ring-2 focus:ring-brand focus:border-transparent transition"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-neutral-600 mb-1">Nome (opcional)</label>
              <input
                type="text"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="Ex: Varanda"
                className="w-full px-3 py-2 rounded-lg border border-neutral-200 bg-neutral-50 text-sm focus:outline-none focus:ring-2 focus:ring-brand focus:border-transparent transition"
              />
            </div>
          </div>
          <div className="flex gap-2">
            <button
              onClick={handleAdd}
              disabled={saving || !newNumber}
              className="bg-brand hover:bg-brand-dark disabled:opacity-50 text-white text-sm font-semibold px-5 py-2 rounded-xl transition"
            >
              {saving ? "Salvando..." : "Criar mesa"}
            </button>
            <button
              onClick={() => { setAdding(false); setNewNumber(""); setNewName(""); }}
              className="text-sm text-neutral-500 hover:text-neutral-700 px-4 py-2 rounded-xl hover:bg-neutral-100 transition"
            >
              Cancelar
            </button>
          </div>
        </div>
      )}

      {/* Lista de mesas */}
      {loading ? (
        <div className="text-center py-12 text-neutral-400 text-sm">Carregando mesas...</div>
      ) : tables.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-neutral-400 gap-3">
          <TableProperties size={40} strokeWidth={1.2} />
          <p className="text-sm">Nenhuma mesa cadastrada.</p>
          <p className="text-xs">Clique em "Nova Mesa" para começar.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {tables.map((table) => {
            const url = `${origin}/mesa/${table.token}`;
            const label = table.name ? `Mesa ${table.number} · ${table.name}` : `Mesa ${table.number}`;
            const occupied = table.openOrdersCount > 0;
            return (
              <div
                key={table.id}
                className={`group relative bg-white rounded-xl border p-5 flex flex-col gap-4 transition-shadow hover:shadow-md ${
                  occupied ? "border-amber-200" : "border-neutral-200"
                }`}
              >
                {/* Barra de status */}
                <span
                  className={`absolute left-0 top-0 h-full w-1 rounded-l-xl ${
                    occupied ? "bg-amber-400" : "bg-emerald-400"
                  }`}
                />

                <div className="flex items-start justify-between pl-2">
                  <div>
                    <div className="flex items-center gap-2">
                      <p className="font-bold text-neutral-900">{label}</p>
                      <span
                        className={`flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wide px-2 py-0.5 rounded-full ${
                          occupied
                            ? "bg-amber-50 text-amber-700"
                            : "bg-emerald-50 text-emerald-700"
                        }`}
                      >
                        {occupied ? <CircleDot size={10} /> : <CircleCheck size={10} />}
                        {occupied ? "Em aberto" : "Livre"}
                      </span>
                    </div>
                    <p className="text-[11px] text-neutral-400 mt-0.5 break-all">{url}</p>
                  </div>
                  <button
                    onClick={() => handleDelete(table.id)}
                    className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-red-50 text-neutral-400 hover:text-red-500 transition shrink-0"
                    title="Excluir mesa"
                  >
                    <Trash2 size={15} />
                  </button>
                </div>

                {occupied && (
                  <div className="ml-2 flex items-center justify-between bg-amber-50 rounded-lg px-3 py-2">
                    <span className="text-xs font-medium text-amber-800">
                      {table.openOrdersCount} pedido{table.openOrdersCount !== 1 ? "s" : ""} em aberto
                    </span>
                    <span className="text-sm font-bold text-amber-800">
                      {formatCurrency(table.openTotal)}
                    </span>
                  </div>
                )}

                {/* Hidden QR for download */}
                <div className="hidden">
                  <QRCodeSVG
                    id={`qr-${table.id}`}
                    value={url}
                    size={256}
                    level="M"
                  />
                </div>

                <div className="flex gap-2">
                  <button
                    onClick={() => setQrTable(table)}
                    className="flex items-center gap-1.5 flex-1 justify-center text-xs font-semibold text-brand border border-brand rounded-lg py-2 hover:bg-brand-light transition"
                  >
                    <QrCode size={14} />
                    Ver QR
                  </button>
                  <button
                    onClick={() => handleDownloadQR(table)}
                    className="flex items-center gap-1.5 flex-1 justify-center text-xs font-semibold text-neutral-600 border border-neutral-200 rounded-lg py-2 hover:bg-neutral-50 transition"
                  >
                    <Download size={14} />
                    Baixar
                  </button>
                </div>

                <div className="flex gap-2">
                  <button
                    onClick={() => openOrders(table)}
                    className="flex items-center gap-1.5 flex-1 justify-center text-xs font-semibold text-neutral-600 border border-neutral-200 rounded-lg py-2 hover:bg-neutral-50 transition"
                  >
                    <ClipboardList size={14} />
                    Ver pedidos
                  </button>
                  <button
                    onClick={() => openCloseBill(table)}
                    className="flex items-center gap-1.5 flex-1 justify-center text-xs font-semibold text-neutral-600 border border-neutral-200 rounded-lg py-2 hover:bg-neutral-50 transition"
                  >
                    <Receipt size={14} />
                    Fechar conta
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Modal QR Code */}
      {qrTable && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={() => setQrTable(null)} />
          <div className="relative bg-white rounded-2xl p-8 flex flex-col items-center gap-5 shadow-2xl max-w-xs w-full mx-4">
            <button
              onClick={() => setQrTable(null)}
              className="absolute top-4 right-4 w-8 h-8 flex items-center justify-center rounded-full hover:bg-neutral-100 transition"
            >
              <X size={16} className="text-neutral-500" />
            </button>

            <div>
              <p className="font-bold text-neutral-900 text-center text-lg">
                {qrTable.name ? `Mesa ${qrTable.number} · ${qrTable.name}` : `Mesa ${qrTable.number}`}
              </p>
              <p className="text-xs text-neutral-400 text-center mt-1">Escaneie para acessar o cardápio</p>
            </div>

            <div className="p-4 bg-white border-2 border-neutral-100 rounded-xl">
              <QRCodeSVG
                value={`${origin}/mesa/${qrTable.token}`}
                size={200}
                level="M"
              />
            </div>

            <button
              onClick={() => { handleDownloadQR(qrTable); }}
              className="flex items-center gap-2 bg-brand hover:bg-brand-dark text-white text-sm font-semibold px-6 py-2.5 rounded-xl transition w-full justify-center"
            >
              <Download size={15} />
              Baixar PNG
            </button>
          </div>
        </div>
      )}

      {/* Modal Pedidos da mesa */}
      {ordersTable && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={() => setOrdersTable(null)} />
          <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[85vh] overflow-y-auto">
            <div className="sticky top-0 bg-white border-b border-neutral-200 px-6 py-4 flex items-center justify-between rounded-t-2xl">
              <div>
                <h2 className="font-semibold text-neutral-900">
                  Pedidos ·{" "}
                  {ordersTable.name ? `Mesa ${ordersTable.number} · ${ordersTable.name}` : `Mesa ${ordersTable.number}`}
                </h2>
                <p className="text-xs text-neutral-400 mt-0.5">Pedidos em aberto nesta mesa. Marcar como pago o remove daqui.</p>
              </div>
              <button
                onClick={() => setOrdersTable(null)}
                className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-neutral-100 transition shrink-0"
              >
                <X size={18} />
              </button>
            </div>

            <div className="p-6 space-y-6">
              {ordersLoading ? (
                <p className="text-sm text-neutral-400 text-center py-8">Carregando pedidos...</p>
              ) : tableOrders.length === 0 ? (
                <p className="text-sm text-neutral-400 text-center py-8">Nenhum pedido em aberto nesta mesa.</p>
              ) : (
                <div className="space-y-2">
                  {tableOrders.map((order) => (
                    <div key={order.id} className="border border-neutral-200 rounded-lg p-3">
                      <div className="flex items-center justify-between gap-2">
                        <div>
                          <p className="text-sm font-medium text-neutral-900">
                            {order.customerName || "Cliente"}{" "}
                            <span className="text-neutral-400 font-mono text-xs">
                              #{order.id.slice(-6).toUpperCase()}
                            </span>
                          </p>
                          <p className="text-xs text-neutral-400">{formatDate(order.createdAt)}</p>
                        </div>
                        <span className="text-sm font-semibold text-neutral-900 shrink-0">
                          {formatCurrency(order.total)}
                        </span>
                      </div>
                      <ul className="mt-2 space-y-0.5">
                        {order.items.map((item) => (
                          <li key={item.id} className="text-xs text-neutral-600">
                            <span className="font-bold text-brand">{item.quantity}x</span> {item.menuItem.name}
                          </li>
                        ))}
                      </ul>
                      <button
                        onClick={() => markOrderPaid(order)}
                        className="mt-2 flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-lg transition bg-brand hover:bg-brand-dark text-white"
                      >
                        <Check size={12} />
                        Marcar como pago
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Modal Fechar conta */}
      {closeBillTable && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div
            className="absolute inset-0 bg-black/50 backdrop-blur-sm"
            onClick={() => !closing && setCloseBillTable(null)}
          />
          <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[85vh] overflow-y-auto">
            <div className="sticky top-0 bg-white border-b border-neutral-200 px-6 py-4 flex items-center justify-between rounded-t-2xl">
              <div>
                <h2 className="font-semibold text-neutral-900">
                  Fechar conta ·{" "}
                  {closeBillTable.name
                    ? `Mesa ${closeBillTable.number} · ${closeBillTable.name}`
                    : `Mesa ${closeBillTable.number}`}
                </h2>
                <p className="text-xs text-neutral-400 mt-0.5">
                  {closeStep === "review"
                    ? "Confira a conta antes de imprimir e fechar."
                    : "Informe como o pagamento foi feito."}
                </p>
              </div>
              <button
                onClick={() => setCloseBillTable(null)}
                disabled={closing}
                className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-neutral-100 transition shrink-0 disabled:opacity-50"
              >
                <X size={18} />
              </button>
            </div>

            <div className="p-6 space-y-5">
              {closeBillLoading ? (
                <p className="text-sm text-neutral-400 text-center py-8">Carregando conta...</p>
              ) : closeBillGroups.length === 0 ? (
                <p className="text-sm text-neutral-400 text-center py-8">Nenhum pedido em aberto nesta mesa.</p>
              ) : closeStep === "payment" ? (
                <>
                  <div className="bg-neutral-50 rounded-lg px-4 py-3 flex justify-between items-center">
                    <span className="text-sm font-medium text-neutral-700">Total a pagar</span>
                    <span className="text-lg font-bold text-neutral-900">{formatCurrency(closeBillGrandTotal)}</span>
                  </div>

                  <div className="space-y-2">
                    {paymentLines.map((line, idx) => (
                      <div key={idx} className="flex gap-2 items-center">
                        <select
                          value={line.method}
                          onChange={(e) => updatePaymentLine(idx, { method: e.target.value as PaymentMethodOption })}
                          className="flex-1 px-3 py-2 rounded-lg border border-neutral-200 bg-neutral-50 text-sm focus:outline-none focus:ring-2 focus:ring-brand focus:border-transparent transition"
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
                          className="w-28 px-3 py-2 rounded-lg border border-neutral-200 bg-neutral-50 text-sm focus:outline-none focus:ring-2 focus:ring-brand focus:border-transparent transition"
                        />
                        {paymentLines.length > 1 && (
                          <button
                            onClick={() => removePaymentLine(idx)}
                            className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-neutral-100 text-neutral-400 hover:text-red-500 transition shrink-0"
                          >
                            <X size={14} />
                          </button>
                        )}
                      </div>
                    ))}
                    <button
                      onClick={addPaymentLine}
                      className="text-xs font-semibold text-brand hover:underline"
                    >
                      + Adicionar forma de pagamento
                    </button>
                  </div>

                  <div className="border-t border-neutral-200 pt-3 space-y-1">
                    <div
                      className={`flex justify-between text-sm font-semibold ${
                        paymentMatches ? "text-neutral-600" : "text-red-600"
                      }`}
                    >
                      <span>Soma informada</span>
                      <span>{formatCurrency(paymentSum)}</span>
                    </div>
                    {!paymentMatches && (
                      <p className="text-xs text-red-600">
                        Diferença de {formatCurrency(Math.abs(paymentDiff))} em relação ao total.
                      </p>
                    )}
                  </div>

                  <div className="flex gap-2">
                    <button
                      onClick={() => setCloseStep("review")}
                      disabled={closing}
                      className="flex items-center gap-1.5 flex-1 justify-center text-sm font-semibold text-neutral-600 border border-neutral-200 rounded-xl py-2.5 hover:bg-neutral-50 transition disabled:opacity-50"
                    >
                      <ArrowLeft size={15} />
                      Voltar
                    </button>
                    <button
                      onClick={confirmCloseBill}
                      disabled={closing || !paymentMatches}
                      className="flex items-center gap-1.5 flex-1 justify-center text-sm font-semibold text-white bg-brand hover:bg-brand-dark disabled:opacity-50 rounded-xl py-2.5 transition"
                    >
                      <Check size={15} />
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
                        <div key={group.name} className="border border-neutral-200 rounded-lg p-3">
                          <p className="text-sm font-semibold text-neutral-900 mb-1.5">{group.name}</p>
                          <ul className="space-y-0.5 mb-2">
                            {group.items.map((item, idx) => (
                              <li key={idx} className="flex justify-between text-xs text-neutral-600">
                                <span>
                                  <span className="font-bold text-brand">{item.quantity}x</span> {item.name}
                                </span>
                                <span>{formatCurrency(item.unitPrice * item.quantity)}</span>
                              </li>
                            ))}
                          </ul>
                          <div className="flex justify-between text-xs text-neutral-500 border-t border-neutral-100 pt-1.5">
                            <span>Subtotal</span>
                            <span>{formatCurrency(group.subtotal)}</span>
                          </div>
                          {includeService && (
                            <div className="flex justify-between text-xs text-neutral-500">
                              <span>Serviço (10%)</span>
                              <span>{formatCurrency(service)}</span>
                            </div>
                          )}
                          <div className="flex justify-between text-sm font-semibold text-neutral-900 mt-1">
                            <span>Total</span>
                            <span>{formatCurrency(group.subtotal + service)}</span>
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  <label className="flex items-center justify-between cursor-pointer bg-neutral-50 rounded-lg px-4 py-3">
                    <span className="flex items-center gap-2 text-sm font-medium text-neutral-700">
                      <Percent size={14} />
                      Adicionar 10% de serviço (garçom)
                    </span>
                    <button
                      type="button"
                      role="switch"
                      aria-checked={includeService}
                      onClick={() => setIncludeService((v) => !v)}
                      className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                        includeService ? "bg-brand" : "bg-neutral-200"
                      }`}
                    >
                      <span
                        className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${
                          includeService ? "translate-x-6" : "translate-x-1"
                        }`}
                      />
                    </button>
                  </label>

                  <div className="border-t border-neutral-200 pt-3 space-y-1">
                    <div className="flex justify-between text-sm text-neutral-600">
                      <span>Subtotal geral</span>
                      <span>{formatCurrency(closeBillItemsTotal)}</span>
                    </div>
                    {includeService && (
                      <div className="flex justify-between text-sm text-neutral-600">
                        <span>Serviço (10%)</span>
                        <span>{formatCurrency(closeBillServiceTotal)}</span>
                      </div>
                    )}
                    <div className="flex justify-between text-lg font-bold text-neutral-900">
                      <span>Total</span>
                      <span>{formatCurrency(closeBillGrandTotal)}</span>
                    </div>
                  </div>

                  <div className="flex gap-2">
                    <button
                      onClick={handlePrintBill}
                      className="flex items-center gap-1.5 flex-1 justify-center text-sm font-semibold text-neutral-600 border border-neutral-200 rounded-xl py-2.5 hover:bg-neutral-50 transition"
                    >
                      <Printer size={15} />
                      Imprimir conta
                    </button>
                    <button
                      onClick={goToPayment}
                      className="flex items-center gap-1.5 flex-1 justify-center text-sm font-semibold text-white bg-brand hover:bg-brand-dark rounded-xl py-2.5 transition"
                    >
                      <Check size={15} />
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
