"use client";

import { useEffect, useState } from "react";
import { AlertTriangle, Loader2 } from "lucide-react";
import { GatewayMark } from "@/components/adm/GatewayMark";
import { GatewaySetupPanel, type ConnectionView } from "@/components/adm/GatewaySetupPanel";
import type { PaymentProviderMeta } from "@/lib/payments/types";

interface ProviderView {
  meta: PaymentProviderMeta;
  connection: ConnectionView | null;
}

interface Payload {
  providers: ProviderView[];
}

const METHOD_LABEL: Record<string, string> = {
  PIX: "Pix",
  CREDIT_CARD: "Cartão",
  CASH: "Dinheiro",
};

export default function PagamentosPage() {
  const [payload, setPayload] = useState<Payload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/payments/connections")
      .then((res) => (res.ok ? res.json() : Promise.reject(res.statusText)))
      .then((data: Payload) => {
        setPayload(data);
        // Abre direto o gateway já conectado — é nele que o lojista mexe.
        const connected = data.providers.find((p) => p.connection);
        if (connected) setSelected(connected.meta.id);
      })
      .catch(() => setError("Não foi possível carregar as formas de recebimento."));
  }, []);

  const active = payload?.providers.find((p) => p.connection?.status === "active");
  const selectedProvider = payload?.providers.find((p) => p.meta.id === selected);

  function applyUpdate(data: unknown) {
    setPayload(data as Payload);
  }

  return (
    <div className="p-6 max-w-3xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-neutral-900">Pagamentos</h1>
        <p className="text-sm text-neutral-500 mt-1 leading-relaxed">
          Conecte a conta do seu gateway para receber os pedidos direto na sua conta.
          O dinheiro não passa pela Muno.
        </p>
      </div>

      {payload && !active && (
        <div className="flex gap-3 bg-amber-50 border border-amber-200 rounded-xl p-4">
          <AlertTriangle size={18} className="text-amber-600 shrink-0 mt-0.5" />
          <p className="text-sm text-amber-900 leading-relaxed">
            Seu restaurante aceita <strong>só dinheiro na entrega</strong>. Escolha um
            gateway abaixo para receber Pix e cartão.
          </p>
        </div>
      )}

      {error && (
        <p className="text-sm text-brand bg-brand-light border border-brand-muted rounded-xl px-4 py-3">
          {error}
        </p>
      )}

      {!payload && !error && (
        <div className="flex items-center justify-center gap-2 text-sm text-neutral-400 py-12">
          <Loader2 size={16} className="animate-spin" />
          Carregando…
        </div>
      )}

      {payload && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {payload.providers.map(({ meta, connection }) => {
            const isSelected = selected === meta.id;
            const isActive = connection?.status === "active";

            return (
              <button
                key={meta.id}
                onClick={() => setSelected(isSelected ? null : meta.id)}
                aria-pressed={isSelected}
                className={`text-left bg-white rounded-2xl border p-4 transition ${
                  isSelected
                    ? "border-transparent ring-2 shadow-sm"
                    : "border-neutral-200 hover:border-neutral-300"
                }`}
                style={isSelected ? { boxShadow: `0 0 0 2px ${meta.brandColor}` } : undefined}
              >
                <div className="flex items-start gap-3">
                  <GatewayMark id={meta.id} label={meta.label} color={meta.brandColor} />

                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-neutral-900 truncate">{meta.label}</span>
                      {isActive && (
                        <span className="w-2 h-2 rounded-full bg-green-500 shrink-0" title="Conectado" />
                      )}
                    </div>

                    <p className="text-xs text-neutral-500 mt-0.5">
                      {meta.methods.map((m) => METHOD_LABEL[m] ?? m).join(" e ")}
                    </p>

                    <p className="text-xs mt-1.5 font-medium">
                      {connection?.status === "active" ? (
                        <span className="text-green-700">Conectado</span>
                      ) : connection?.status === "pending_webhook" ? (
                        <span className="text-amber-700">Falta o webhook</span>
                      ) : connection?.status === "invalid" ? (
                        <span className="text-red-700">Credencial recusada</span>
                      ) : (
                        <span className="text-neutral-400">Não conectado</span>
                      )}
                    </p>
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      )}

      {selectedProvider && (
        <GatewaySetupPanel
          meta={selectedProvider.meta}
          connection={selectedProvider.connection}
          onChanged={applyUpdate}
        />
      )}
    </div>
  );
}
