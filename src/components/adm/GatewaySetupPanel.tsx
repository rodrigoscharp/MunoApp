"use client";

import { useState } from "react";
import { Check, Copy, ExternalLink, Loader2 } from "lucide-react";
import { GatewayMark } from "@/components/adm/GatewayMark";
import type { PaymentProviderMeta, SetupStep } from "@/lib/payments/types";

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
  onChanged: (payload: unknown) => void;
}

export function GatewaySetupPanel({ meta, connection, onChanged }: Props) {
  const [values, setValues] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  // Um passo está concluído quando as credenciais que ele entrega já estão
  // salvas. O passo do webhook só conta como feito depois que uma
  // notificação assinada chegou de verdade — é a única prova possível.
  function ownDone(step: SetupStep): boolean {
    if (!connection) return false;
    if (step.showsWebhookUrl) return connection.lastCheckedAt !== null;
    if (!step.fills?.length) return false;
    return step.fills.every((key) => Boolean(connection.credentials[key]));
  }

  // Um passo puramente informativo ("crie uma aplicação", "gere a chave")
  // não tem como se marcar sozinho. Se um passo posterior já está feito, ele
  // necessariamente foi cumprido — marcar como pendente seria mentira.
  function isDone(index: number): boolean {
    const steps = meta.setupSteps;
    if (ownDone(steps[index])) return true;

    const informational = !steps[index].fills?.length && !steps[index].showsWebhookUrl;
    return informational && steps.slice(index + 1).some(ownDone);
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/payments/connections", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ provider: meta.id, credentials: values }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(typeof data?.error === "string" ? data.error : "Não foi possível salvar.");
        return;
      }
      setValues({});
      onChanged(data);
    } catch {
      setError("Não foi possível falar com o servidor.");
    } finally {
      setBusy(false);
    }
  }

  async function disconnect() {
    if (!confirm(`Desconectar ${meta.label}? A credencial salva será apagada.`)) return;

    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/payments/connections?provider=${meta.id}`, { method: "DELETE" });
      const data = await res.json();
      if (!res.ok) {
        setError(typeof data?.error === "string" ? data.error : "Não foi possível desconectar.");
        return;
      }
      onChanged(data);
    } catch {
      setError("Não foi possível falar com o servidor.");
    } finally {
      setBusy(false);
    }
  }

  function copyWebhookUrl() {
    if (!connection) return;
    navigator.clipboard.writeText(connection.webhookUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div
      className="bg-white rounded-2xl border border-neutral-200 overflow-hidden"
      style={{ borderTopColor: meta.brandColor, borderTopWidth: 3 }}
    >
      <div className="flex items-center gap-3 px-5 py-4 border-b border-neutral-100">
        <GatewayMark id={meta.id} label={meta.label} color={meta.brandColor} size={36} />
        <div className="min-w-0">
          <h2 className="font-semibold text-neutral-900 leading-tight">
            Configurar {meta.label}
          </h2>
          <p className="text-xs text-neutral-500">
            {connection?.status === "active" && connection.lastCheckedAt
              ? "Recebendo pagamentos"
              : "Siga os passos na ordem"}
          </p>
        </div>

        {connection && (
          <button
            onClick={disconnect}
            disabled={busy}
            className="ml-auto text-xs text-neutral-400 hover:text-brand transition shrink-0"
          >
            Desconectar
          </button>
        )}
      </div>

      <form onSubmit={submit} className="p-5">
        <ol className="space-y-6">
          {meta.setupSteps.map((step, index) => {
            const done = isDone(index);
            const fields = meta.credentialFields.filter((f) => step.fills?.includes(f.key));

            return (
              <li key={step.title} className="flex gap-4">
                <div
                  className={`w-7 h-7 rounded-full shrink-0 flex items-center justify-center text-xs font-bold ${
                    done ? "text-white" : "bg-neutral-100 text-neutral-500"
                  }`}
                  style={done ? { background: meta.brandColor } : undefined}
                >
                  {done ? <Check size={14} strokeWidth={3} /> : index + 1}
                </div>

                <div className="flex-1 min-w-0 space-y-2">
                  <p className="text-sm font-medium text-neutral-900 leading-snug">{step.title}</p>
                  <p className="text-xs text-neutral-500 leading-relaxed">{step.body}</p>

                  {step.link && (
                    <a
                      href={step.link.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 text-xs font-medium hover:underline"
                      style={{ color: meta.brandColor }}
                    >
                      {step.link.label} <ExternalLink size={11} />
                    </a>
                  )}

                  {step.showsWebhookUrl && (
                    connection ? (
                      <div className="flex gap-2 pt-1">
                        <input
                          readOnly
                          value={connection.webhookUrl}
                          onFocus={(e) => e.currentTarget.select()}
                          className="flex-1 min-w-0 text-xs font-mono bg-neutral-50 border border-neutral-200 rounded-lg px-2.5 py-2 text-neutral-600"
                        />
                        <button
                          type="button"
                          onClick={copyWebhookUrl}
                          className="px-2.5 py-2 rounded-lg border border-neutral-200 hover:bg-neutral-50 transition shrink-0"
                          aria-label="Copiar URL do webhook"
                        >
                          {copied ? <Check size={13} className="text-green-600" /> : <Copy size={13} />}
                        </button>
                      </div>
                    ) : (
                      <p className="text-xs text-neutral-400 italic pt-1">
                        A URL aparece aqui depois que você salvar o passo anterior.
                      </p>
                    )
                  )}

                  {fields.map((field) => (
                    <div key={field.key} className="pt-1 space-y-1">
                      <label
                        htmlFor={`${meta.id}-${field.key}`}
                        className="block text-xs font-medium text-neutral-600"
                      >
                        {field.label}
                        {done && (
                          <span className="ml-2 font-mono text-neutral-400">
                            {connection?.credentials[field.key]}
                          </span>
                        )}
                      </label>

                      {field.type === "select" ? (
                        <select
                          id={`${meta.id}-${field.key}`}
                          value={values[field.key] ?? connection?.credentials[field.key] ?? ""}
                          onChange={(e) =>
                            setValues((v) => ({ ...v, [field.key]: e.target.value }))
                          }
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
                          onChange={(e) =>
                            setValues((v) => ({ ...v, [field.key]: e.target.value }))
                          }
                          autoComplete="off"
                          placeholder={done ? "Cole aqui para substituir" : ""}
                          className="w-full text-sm border border-neutral-200 rounded-lg px-3 py-2"
                        />
                      )}
                    </div>
                  ))}
                </div>
              </li>
            );
          })}
        </ol>

        {error && (
          <p className="mt-5 text-xs text-brand bg-brand-light border border-brand-muted rounded-lg px-3 py-2">
            {error}
          </p>
        )}

        <div className="mt-5 pt-4 border-t border-neutral-100 flex items-center gap-3">
          <button
            type="submit"
            disabled={busy}
            className="bg-brand hover:bg-brand-dark disabled:opacity-50 text-white text-sm font-semibold px-4 py-2 rounded-lg transition flex items-center gap-2"
          >
            {busy && <Loader2 size={14} className="animate-spin" />}
            Salvar e testar
          </button>
          <p className="text-xs text-neutral-400">
            Testamos a credencial no {meta.label} antes de salvar.
          </p>
        </div>
      </form>
    </div>
  );
}
