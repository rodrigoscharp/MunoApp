"use client";

import { useEffect, useState } from "react";
import { AlertTriangle, Loader2 } from "lucide-react";
import { PaymentGatewayCard, type ConnectionView } from "@/components/adm/PaymentGatewayCard";
import type { PaymentProviderMeta } from "@/lib/payments/types";

interface ProviderView {
  meta: PaymentProviderMeta;
  connection: ConnectionView | null;
}

interface Payload {
  providers: ProviderView[];
}

export default function PagamentosPage() {
  const [payload, setPayload] = useState<Payload | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/payments/connections")
      .then((res) => (res.ok ? res.json() : Promise.reject(res.statusText)))
      .then(setPayload)
      .catch(() => setError("Não foi possível carregar as formas de recebimento."));
  }, []);

  const hasActive = payload?.providers.some((p) => p.connection?.status === "active") ?? false;

  return (
    <div className="p-6 max-w-3xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-neutral-900">Pagamentos</h1>
        <p className="text-sm text-neutral-500 mt-1">
          Conecte a conta do seu gateway para receber os pedidos direto na sua
          conta. O dinheiro nunca passa pela Muno.
        </p>
      </div>

      {payload && !hasActive && (
        <div className="flex gap-2 bg-amber-50 border border-amber-200 rounded-xl p-4">
          <AlertTriangle size={18} className="text-amber-600 shrink-0 mt-0.5" />
          <p className="text-sm text-amber-900 leading-relaxed">
            Seu restaurante só aceita <strong>dinheiro na entrega</strong> no momento.
            Conecte um gateway abaixo para receber PIX e cartão.
          </p>
        </div>
      )}

      {error && (
        <p className="text-sm text-brand bg-brand-light border border-brand-muted rounded-xl px-4 py-3">
          {error}
        </p>
      )}

      {!payload && !error && (
        <div className="flex items-center gap-2 text-sm text-neutral-400 py-8 justify-center">
          <Loader2 size={16} className="animate-spin" />
          Carregando…
        </div>
      )}

      {payload?.providers.map((provider) => (
        <PaymentGatewayCard
          key={provider.meta.id}
          meta={provider.meta}
          connection={provider.connection}
          onSaved={(data) => setPayload(data as Payload)}
        />
      ))}
    </div>
  );
}
