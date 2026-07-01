"use client";

import { Wallet, CheckCircle2, AlertTriangle, ExternalLink } from "lucide-react";

export interface PaymentConnectionStatus {
  connected: boolean;
  status?: "active" | "needs_reauth";
}

interface Props {
  connection: PaymentConnectionStatus;
  feedback?: "success" | "error" | null;
}

export function PaymentConnectionControl({ connection, feedback }: Props) {
  return (
    <div className="bg-white rounded-2xl border border-neutral-200 p-5 space-y-4">
      <div className="flex items-center gap-2">
        <Wallet size={18} className="text-brand" />
        <h3 className="font-semibold text-neutral-900">Mercado Pago</h3>
      </div>

      {feedback === "success" && (
        <div className="flex items-center gap-2 text-sm text-green-700 bg-green-50 border border-green-200 rounded-lg px-3 py-2">
          <CheckCircle2 size={16} />
          Conta conectada com sucesso!
        </div>
      )}
      {feedback === "error" && (
        <div className="flex items-center gap-2 text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
          <AlertTriangle size={16} />
          Não foi possível conectar a conta. Tente novamente.
        </div>
      )}

      {connection.connected && connection.status === "active" ? (
        <div className="flex items-center gap-2 text-sm text-green-700 bg-green-50 border border-green-200 rounded-lg px-3 py-2">
          <CheckCircle2 size={16} />
          Conta Mercado Pago conectada
        </div>
      ) : connection.connected && connection.status === "needs_reauth" ? (
        <div className="space-y-3">
          <div className="flex items-center gap-2 text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
            <AlertTriangle size={16} />
            A conexão expirou — reconecte pra continuar recebendo pagamentos.
          </div>
          <a
            href="/api/payments/connect"
            className="inline-flex items-center gap-2 bg-brand hover:bg-brand-dark text-white font-semibold px-4 py-2 rounded-xl text-sm transition"
          >
            Reconectar conta
            <ExternalLink size={14} />
          </a>
        </div>
      ) : (
        <div className="space-y-3">
          <p className="text-sm text-neutral-500">
            Conecte sua conta Mercado Pago para receber os pagamentos dos pedidos diretamente,
            com a comissão da Muno descontada automaticamente.
          </p>
          <a
            href="/api/payments/connect"
            className="inline-flex items-center gap-2 bg-brand hover:bg-brand-dark text-white font-semibold px-4 py-2 rounded-xl text-sm transition"
          >
            Conectar Mercado Pago
            <ExternalLink size={14} />
          </a>
        </div>
      )}
    </div>
  );
}
