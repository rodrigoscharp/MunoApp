"use client";

import { useState } from "react";
import { Check, Copy, ExternalLink, AlertTriangle, Loader2 } from "lucide-react";
import type { PaymentProviderMeta } from "@/lib/payments/types";

export interface ConnectionView {
  status: "pending_webhook" | "active" | "invalid" | "disabled";
  externalAccountId: string | null;
  lastCheckedAt: string | null;
  credentials: Record<string, string>;
  webhookUrl: string;
}

interface Props {
  meta: PaymentProviderMeta;
  connection: ConnectionView | null;
  onSaved: (payload: unknown) => void;
}

export function PaymentGatewayCard({ meta, connection, onSaved }: Props) {
  const [values, setValues] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const connected = connection !== null;
  const pendingWebhook = connection?.status === "pending_webhook";

  async function save(payload: Record<string, string>) {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/payments/connections", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ provider: meta.id, credentials: payload }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(typeof data?.error === "string" ? data.error : "Não foi possível salvar.");
        return;
      }
      setValues({});
      onSaved(data);
    } catch {
      setError("Não foi possível falar com o servidor.");
    } finally {
      setSaving(false);
    }
  }

  async function disconnect() {
    if (!confirm(`Desconectar ${meta.label}? A credencial salva será apagada.`)) return;

    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`/api/payments/connections?provider=${meta.id}`, {
        method: "DELETE",
      });
      const data = await res.json();
      if (!res.ok) {
        setError(typeof data?.error === "string" ? data.error : "Não foi possível desconectar.");
        return;
      }
      onSaved(data);
    } catch {
      setError("Não foi possível falar com o servidor.");
    } finally {
      setSaving(false);
    }
  }

  function copyWebhookUrl() {
    if (!connection) return;
    navigator.clipboard.writeText(connection.webhookUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  // Na etapa 2 o lojista já tem a conexão salva e só falta o secret do
  // webhook, então o formulário mostra apenas os campos ainda em branco —
  // mas reenvia junto o que já estava salvo é impossível (a credencial nunca
  // volta em claro), então ele recola o token também.
  const fieldsToShow = meta.credentialFields;

  return (
    <div className="bg-white rounded-xl border border-neutral-200 p-5 space-y-4">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="font-semibold text-neutral-900">{meta.label}</h2>
          <p className="text-xs text-neutral-500 mt-0.5">
            Aceita {meta.methods.join(", ")}
          </p>
        </div>
        <StatusBadge status={connection?.status} />
      </div>

      {pendingWebhook && (
        <div className="flex gap-2 bg-amber-50 border border-amber-200 rounded-lg p-3">
          <AlertTriangle size={16} className="text-amber-600 shrink-0 mt-0.5" />
          <p className="text-xs text-amber-900 leading-relaxed">
            Falta configurar o webhook. Seu restaurante <strong>ainda não aceita
            pagamento online</strong> — sem isso não conseguimos confirmar quando um
            cliente paga.
          </p>
        </div>
      )}

      {connected && connection.status === "active" && (
        <div className="text-xs text-neutral-500 space-y-1">
          {connection.externalAccountId && (
            <p>
              Conta: <span className="font-medium text-neutral-700">{connection.externalAccountId}</span>
            </p>
          )}
          <p>
            {connection.lastCheckedAt
              ? `Webhook confirmado em ${new Date(connection.lastCheckedAt).toLocaleString("pt-BR")}`
              : "Aguardando a primeira notificação do gateway para confirmar o webhook."}
          </p>
          {Object.entries(connection.credentials).map(([key, value]) => (
            <p key={key}>
              {meta.credentialFields.find((f) => f.key === key)?.label ?? key}:{" "}
              <span className="font-mono text-neutral-700">{value}</span>
            </p>
          ))}
        </div>
      )}

      {connected && (
        <div className="space-y-2">
          <p className="text-xs font-medium text-neutral-700">URL de webhook deste restaurante</p>
          <div className="flex gap-2">
            <input
              readOnly
              value={connection.webhookUrl}
              className="flex-1 text-xs font-mono bg-neutral-50 border border-neutral-200 rounded-lg px-3 py-2 text-neutral-600"
            />
            <button
              onClick={copyWebhookUrl}
              className="px-3 py-2 rounded-lg border border-neutral-200 hover:bg-neutral-50 transition shrink-0"
              aria-label="Copiar URL do webhook"
            >
              {copied ? <Check size={14} className="text-green-600" /> : <Copy size={14} />}
            </button>
          </div>
          <p className="text-xs text-neutral-500">
            Cadastre essa URL no painel do {meta.label}, copie a chave secreta que ele
            gerar e cole abaixo.
          </p>
        </div>
      )}

      <form
        onSubmit={(e) => {
          e.preventDefault();
          save(values);
        }}
        className="space-y-3"
      >
        {fieldsToShow.map((field) => (
          <div key={field.key} className="space-y-1">
            <label htmlFor={`${meta.id}-${field.key}`} className="block text-xs font-medium text-neutral-700">
              {field.label}
              {!field.required && <span className="text-neutral-400"> (opcional)</span>}
            </label>

            {field.type === "select" ? (
              <select
                id={`${meta.id}-${field.key}`}
                value={values[field.key] ?? ""}
                onChange={(e) => setValues((v) => ({ ...v, [field.key]: e.target.value }))}
                className="w-full text-sm border border-neutral-200 rounded-lg px-3 py-2"
              >
                <option value="">Selecione…</option>
                {field.options?.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            ) : (
              <input
                id={`${meta.id}-${field.key}`}
                type={field.type === "secret" ? "password" : "text"}
                value={values[field.key] ?? ""}
                onChange={(e) => setValues((v) => ({ ...v, [field.key]: e.target.value }))}
                autoComplete="off"
                className="w-full text-sm border border-neutral-200 rounded-lg px-3 py-2"
              />
            )}

            <p className="text-xs text-neutral-400 leading-snug">{field.help}</p>
          </div>
        ))}

        {error && (
          <p className="text-xs text-brand bg-brand-light border border-brand-muted rounded-lg px-3 py-2">
            {error}
          </p>
        )}

        <div className="flex items-center gap-3 pt-1">
          <button
            type="submit"
            disabled={saving}
            className="bg-brand hover:bg-brand-dark disabled:opacity-50 text-white text-sm font-semibold px-4 py-2 rounded-lg transition flex items-center gap-2"
          >
            {saving && <Loader2 size={14} className="animate-spin" />}
            Salvar e testar
          </button>

          <a
            href={meta.docsUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs text-neutral-500 hover:text-neutral-700 flex items-center gap-1 transition"
          >
            Onde encontrar <ExternalLink size={12} />
          </a>

          {connected && (
            <button
              type="button"
              onClick={disconnect}
              disabled={saving}
              className="ml-auto text-xs text-neutral-400 hover:text-brand transition"
            >
              Desconectar
            </button>
          )}
        </div>
      </form>
    </div>
  );
}

function StatusBadge({ status }: { status?: ConnectionView["status"] }) {
  const map = {
    active: { label: "Conectado", className: "bg-green-50 text-green-700 border-green-200" },
    pending_webhook: { label: "Falta o webhook", className: "bg-amber-50 text-amber-700 border-amber-200" },
    invalid: { label: "Credencial recusada", className: "bg-red-50 text-red-700 border-red-200" },
    disabled: { label: "Desativado", className: "bg-neutral-50 text-neutral-500 border-neutral-200" },
  } as const;

  const view = status ? map[status] : null;
  if (!view) {
    return (
      <span className="text-xs px-2 py-1 rounded-full border border-neutral-200 text-neutral-400 shrink-0">
        Não conectado
      </span>
    );
  }

  return (
    <span className={`text-xs px-2 py-1 rounded-full border shrink-0 ${view.className}`}>
      {view.label}
    </span>
  );
}
