"use client";

import { useState } from "react";
import { Printer, Loader2, TestTube2 } from "lucide-react";
import { toast } from "sonner";
import type { PrinterConfig } from "@/app/api/settings/printer/route";
import { botaoContorno, cartaoPainel, tituloDeSecao } from "@/components/painel/estilos";
import { Selo } from "@/components/painel/Selo";
import { cn } from "@/lib/utils";

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
    <div className={`${cartaoPainel} flex flex-col gap-4 p-5 sm:p-6`}>
      {/* Header */}
      <div className="flex items-center gap-2">
        <Printer size={17} className="text-loja-preco" aria-hidden />
        <h3 className={tituloDeSecao}>Impressora Tanka</h3>
        <Selo tom={config.enabled ? "pronto" : "neutro"} className="ml-2">
          {config.enabled ? "Ativada" : "Desativada"}
        </Selo>
        {saving && <Loader2 size={15} className="ml-auto animate-spin text-loja-tinta-2" aria-label="Salvando" />}
      </div>

      <p className="text-[13px] leading-relaxed text-loja-tinta-2">
        Quando ativado, um botão de impressão aparece em cada pedido na tela da cozinha.
        Conecte a impressora ao computador e selecione-a no diálogo de impressão do navegador.
      </p>

      {/* Toggle habilitado */}
      <div className="flex min-h-11 items-center justify-between gap-3 rounded-2xl bg-loja-creme px-4 py-1.5">
        <span id="impressora-habilitar" className="text-[14px] font-bold text-loja-tinta">
          Habilitar impressão
        </span>
        <button
          type="button"
          role="switch"
          aria-checked={config.enabled}
          aria-labelledby="impressora-habilitar"
          onClick={() => save({ ...config, enabled: !config.enabled })}
          className="flex h-11 w-[52px] items-center justify-center rounded-full focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
        >
          <span
            aria-hidden
            className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
              config.enabled ? "bg-forest-dark" : "bg-[#D9CCBC]"
            }`}
          >
            <span
              className={`inline-block h-[18px] w-[18px] transform rounded-full bg-white shadow transition-transform ${
                config.enabled ? "translate-x-[23px]" : "translate-x-[3px]"
              }`}
            />
          </span>
        </button>
      </div>

      {/* Largura do papel */}
      {config.enabled && (
        <>
          <div role="group" aria-labelledby="impressora-papel" className="flex flex-col gap-2">
            <p id="impressora-papel" className="text-[13px] font-bold text-loja-tinta">Largura do papel</p>
            <div className="flex gap-2">
              {(["58mm", "80mm"] as const).map((w) => (
                <button
                  key={w}
                  type="button"
                  aria-pressed={config.paperWidth === w}
                  onClick={() => save({ ...config, paperWidth: w })}
                  className="h-11 flex-1 rounded-full border-[1.5px] border-loja-linha bg-white text-[14px] font-bold text-loja-tinta transition hover:border-brand aria-pressed:border-forest-dark aria-pressed:bg-forest-dark aria-pressed:text-white"
                >
                  {w}
                </button>
              ))}
            </div>
          </div>

          {/* Teste de impressão */}
          <button
            type="button"
            onClick={testPrint}
            className={cn(botaoContorno, "h-12 w-full border-dashed text-[14px]")}
          >
            <TestTube2 size={16} aria-hidden />
            Testar impressão
          </button>

          <p className="text-[12px] text-loja-tinta-2">
            Dica: no diálogo de impressão, desative cabeçalhos/rodapés e margens para melhor resultado.
          </p>
        </>
      )}
    </div>
  );
}
