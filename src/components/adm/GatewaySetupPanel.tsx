"use client";

import { useState } from "react";
import { Check, Copy, ExternalLink, Loader2 } from "lucide-react";
import { GatewayMark } from "@/components/adm/GatewayMark";
import type { PaymentProviderMeta, SetupStep } from "@/lib/payments/types";
import { botaoBrasa, campo, cartaoPainel } from "@/components/painel/estilos";
import { cn } from "@/lib/utils";

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

  const rotuloDoCampo = "block text-[13px] font-bold text-loja-tinta";

  return (
    <section
      aria-labelledby={`${meta.id}-config-titulo`}
      className={cn(cartaoPainel, "overflow-hidden")}
      style={{ borderTop: `4px solid ${meta.brandColor}` }}
    >
      <div className="flex flex-wrap items-center gap-3 border-b border-[#F0E6DA] px-5 py-4 sm:px-6">
        <GatewayMark id={meta.id} label={meta.label} color={meta.brandColor} size={40} />
        <div className="min-w-0 flex-1">
          <h2 id={`${meta.id}-config-titulo`} className="text-[16px] font-extrabold leading-tight text-loja-tinta">
            Configurar {meta.label}
          </h2>
          <p className="text-[12.5px] text-loja-tinta-2">
            {connection?.status === "active" && connection.lastCheckedAt
              ? "Recebendo pagamentos"
              : "Siga os passos na ordem"}
          </p>
        </div>

        {connection && (
          <button
            type="button"
            onClick={disconnect}
            disabled={busy}
            className="h-11 shrink-0 rounded-full px-4 text-[13px] font-bold text-loja-tinta-2 transition hover:bg-loja-pessego-claro hover:text-loja-preco disabled:opacity-50"
          >
            Desconectar
          </button>
        )}
      </div>

      <form onSubmit={submit} className="p-5 sm:p-6">
        <ol className="flex flex-col gap-6">
          {meta.setupSteps.map((step, index) => {
            const done = isDone(index);
            const fields = meta.credentialFields.filter((f) => step.fills?.includes(f.key));

            return (
              <li key={step.title} className="flex gap-4">
                <div
                  className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-[13px] font-extrabold ${
                    done ? "bg-forest-dark text-white" : "bg-[#EFE4D7] text-loja-tinta"
                  }`}
                >
                  {done ? <Check size={15} strokeWidth={3} aria-hidden /> : index + 1}
                  {done && <span className="sr-only">Passo {index + 1} concluído</span>}
                </div>

                <div className="min-w-0 flex-1 space-y-2">
                  <p className="text-[14.5px] font-bold leading-snug text-loja-tinta">{step.title}</p>
                  <p className="text-[13px] leading-relaxed text-loja-tinta-2">{step.body}</p>

                  {step.link && (
                    <a
                      href={step.link.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex min-h-11 items-center gap-1.5 text-[13px] font-bold text-loja-preco underline-offset-2 hover:underline"
                    >
                      {step.link.label} <ExternalLink size={13} aria-hidden />
                    </a>
                  )}

                  {step.showsWebhookUrl && (
                    connection ? (
                      <div className="flex gap-2 pt-1">
                        <input
                          readOnly
                          value={connection.webhookUrl}
                          aria-label="URL do webhook"
                          onFocus={(e) => e.currentTarget.select()}
                          className={cn(campo, "h-11 min-w-0 flex-1 bg-white px-3 py-0 font-mono text-[12.5px] text-loja-tinta-2")}
                        />
                        <button
                          type="button"
                          onClick={copyWebhookUrl}
                          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full border-[1.5px] border-loja-linha bg-white text-loja-tinta transition hover:border-brand"
                          aria-label="Copiar URL do webhook"
                        >
                          {copied ? <Check size={15} className="text-forest-dark" aria-hidden /> : <Copy size={15} aria-hidden />}
                        </button>
                      </div>
                    ) : (
                      <p className="pt-1 text-[12.5px] italic text-loja-tinta-2">
                        A URL aparece aqui depois que você salvar o passo anterior.
                      </p>
                    )
                  )}

                  {fields.map((field) => (
                    <div key={field.key} className="space-y-1.5 pt-1">
                      <label htmlFor={`${meta.id}-${field.key}`} className={rotuloDoCampo}>
                        {field.label}
                        {done && (
                          <span className="ml-2 font-mono font-medium text-loja-tinta-2">
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
                          className={cn(campo, "h-12 py-0")}
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
                          className={cn(campo, "h-12 py-0")}
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
          <p role="alert" className="mt-5 rounded-2xl border border-brand-muted bg-brand-light px-4 py-3 text-[13px] font-semibold text-loja-preco">
            {error}
          </p>
        )}

        <div className="mt-6 flex flex-col gap-3 border-t border-[#F0E6DA] pt-5 sm:flex-row sm:items-center">
          <button
            type="submit"
            disabled={busy}
            className={cn(botaoBrasa, "h-12 text-[14px]")}
          >
            {busy && <Loader2 size={15} className="animate-spin" aria-hidden />}
            Salvar e testar
          </button>
          <p className="text-[12.5px] text-loja-tinta-2">
            Testamos a credencial no {meta.label} antes de salvar.
          </p>
        </div>
      </form>
    </section>
  );
}
