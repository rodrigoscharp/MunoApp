"use client";

import { useState } from "react";
import { Printer, Loader2, TestTube2 } from "lucide-react";
import { toast } from "sonner";
import type { PrinterConfig } from "@/app/api/settings/printer/route";

const MOCK_ORDER = {
  id: "test-print-000",
  status: "IN_PREPARATION" as const,
  paymentMethod: "PIX" as const,
  paymentStatus: "PAID" as const,
  deliveryType: "DELIVERY" as const,
  total: 42.9,
  notes: "Sem cebola por favor",
  customerName: "João Silva",
  customerPhone: null,
  deliveryAddress: "Rua das Flores, 123",
  createdAt: new Date(),
  updatedAt: new Date(),
  items: [
    { id: "1", quantity: 2, unitPrice: 18.9, notes: null, menuItem: { id: "1", name: "X-Burguer", imageUrl: null } },
    { id: "2", quantity: 1, unitPrice: 5.0,  notes: "sem gelo", menuItem: { id: "2", name: "Coca-Cola", imageUrl: null } },
  ],
  user: { id: "u1", name: "João Silva", email: "joao@teste.com" },
};

export function PrinterControl({ initial }: { initial: PrinterConfig }) {
  const [config, setConfig] = useState<PrinterConfig>(initial);
  const [saving, setSaving] = useState(false);

  async function save(next: PrinterConfig) {
    setConfig(next);
    setSaving(true);
    try {
      const res = await fetch("/api/settings/printer", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(next),
      });
      if (res.ok) {
        toast.success("Configuração salva");
      } else {
        toast.error("Erro ao salvar");
      }
    } catch {
      toast.error("Erro de conexão");
    } finally {
      setSaving(false);
    }
  }

  async function testPrint() {
    const { printOrder } = await import("@/lib/printOrder");
    printOrder(MOCK_ORDER as Parameters<typeof printOrder>[0], config.paperWidth);
  }

  return (
    <div className="bg-white rounded-2xl border border-neutral-200 p-5 space-y-4">
      {/* Header */}
      <div className="flex items-center gap-2">
        <Printer size={18} className="text-brand" />
        <h2 className="font-semibold text-neutral-900 text-sm">Impressora Tanka</h2>
        {saving && <Loader2 size={13} className="animate-spin text-neutral-400 ml-auto" />}
      </div>

      <p className="text-xs text-neutral-400 leading-relaxed">
        Quando ativado, um botão de impressão aparece em cada pedido na tela da cozinha.
        Conecte a impressora ao computador e selecione-a no diálogo de impressão do navegador.
      </p>

      {/* Toggle habilitado */}
      <label className="flex items-center justify-between cursor-pointer group">
        <span className="text-sm font-medium text-neutral-700 group-hover:text-neutral-900 transition">
          Habilitar impressão
        </span>
        <button
          type="button"
          role="switch"
          aria-checked={config.enabled}
          onClick={() => save({ ...config, enabled: !config.enabled })}
          className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
            config.enabled ? "bg-brand" : "bg-neutral-200"
          }`}
        >
          <span
            className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${
              config.enabled ? "translate-x-6" : "translate-x-1"
            }`}
          />
        </button>
      </label>

      {/* Largura do papel */}
      {config.enabled && (
        <>
          <div className="space-y-1.5">
            <p className="text-xs font-medium text-neutral-600">Largura do papel</p>
            <div className="flex gap-2">
              {(["58mm", "80mm"] as const).map((w) => (
                <button
                  key={w}
                  onClick={() => save({ ...config, paperWidth: w })}
                  className={`flex-1 py-2 rounded-xl border text-sm font-medium transition ${
                    config.paperWidth === w
                      ? "bg-brand/10 border-brand/40 text-brand"
                      : "border-neutral-200 text-neutral-600 hover:border-brand/30"
                  }`}
                >
                  {w}
                </button>
              ))}
            </div>
          </div>

          {/* Teste de impressão */}
          <button
            onClick={testPrint}
            className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl border border-dashed border-neutral-300 text-sm text-neutral-600 hover:border-brand/40 hover:text-brand transition"
          >
            <TestTube2 size={15} />
            Testar impressão
          </button>

          <p className="text-[11px] text-neutral-400">
            Dica: no diálogo de impressão, desative cabeçalhos/rodapés e margens para melhor resultado.
          </p>
        </>
      )}
    </div>
  );
}
