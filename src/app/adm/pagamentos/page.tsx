"use client";

import { useEffect, useState } from "react";
import { AlertTriangle, Loader2 } from "lucide-react";
import { GatewayMark } from "@/components/adm/GatewayMark";
import { GatewaySetupPanel, type ConnectionView } from "@/components/adm/GatewaySetupPanel";
import type { PaymentProviderMeta } from "@/lib/payments/types";
import { CabecalhoDaTela } from "@/components/painel/CabecalhoDaTela";
import { Selo } from "@/components/painel/Selo";
import { cartaoPainel } from "@/components/painel/estilos";

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
    <div className="mx-auto flex max-w-4xl flex-col gap-5">
      <CabecalhoDaTela
        contexto={active ? `Recebendo por ${active.meta.label}` : "Formas de recebimento"}
        titulo="Pagamentos"
      />
      <p className="-mt-3 max-w-2xl text-[14px] leading-relaxed text-loja-tinta-2">
        Conecte a conta do seu gateway para receber os pedidos direto na sua conta.
        O dinheiro não passa pela Muno.
      </p>

      {payload && !active && (
        <div role="status" className="flex gap-3 rounded-[18px] bg-loja-pessego-claro p-4">
          <AlertTriangle size={18} className="mt-0.5 shrink-0 text-loja-preco" aria-hidden />
          <p className="text-[14px] leading-relaxed text-[#6A2E10]">
            Seu restaurante aceita <strong>só dinheiro na entrega</strong>. Escolha um
            gateway abaixo para receber Pix e cartão.
          </p>
        </div>
      )}

      {error && (
        <p role="alert" className="rounded-[18px] border border-brand-muted bg-brand-light px-4 py-3 text-[14px] font-semibold text-loja-preco">
          {error}
        </p>
      )}

      {!payload && !error && (
        <div className="flex items-center justify-center gap-2 py-12 text-[14px] text-loja-tinta-2">
          <Loader2 size={16} className="animate-spin" aria-hidden />
          Carregando…
        </div>
      )}

      {payload && (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {payload.providers.map(({ meta, connection }) => {
            const isSelected = selected === meta.id;

            return (
              <button
                key={meta.id}
                type="button"
                onClick={() => setSelected(isSelected ? null : meta.id)}
                aria-pressed={isSelected}
                className={`${cartaoPainel} min-h-[88px] p-4 text-left transition hover:bg-white ${
                  isSelected ? "bg-white" : ""
                }`}
                style={isSelected ? { boxShadow: `0 0 0 2.5px ${meta.brandColor}` } : undefined}
              >
                <div className="flex items-start gap-3">
                  <GatewayMark id={meta.id} label={meta.label} color={meta.brandColor} />

                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="truncate text-[15px] font-extrabold text-loja-tinta">{meta.label}</span>
                      {meta.recommended && (
                        <span title="Cobre Pix e cartão no mesmo gateway">
                          <Selo tom="andamento">Recomendado</Selo>
                        </span>
                      )}
                    </div>

                    <p className="mt-0.5 text-[12.5px] text-loja-tinta-2">
                      {meta.methods.map((m) => METHOD_LABEL[m] ?? m).join(" e ")}
                    </p>

                    <div className="mt-2">
                      {connection?.status === "active" ? (
                        <Selo tom="pronto">Conectado</Selo>
                      ) : connection?.status === "pending_webhook" ? (
                        <Selo tom="andamento">Falta o webhook</Selo>
                      ) : connection?.status === "invalid" ? (
                        <Selo tom="alerta">Credencial recusada</Selo>
                      ) : (
                        <Selo tom="neutro">Não conectado</Selo>
                      )}
                    </div>
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
