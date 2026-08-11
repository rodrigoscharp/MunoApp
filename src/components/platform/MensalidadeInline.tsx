"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { formatCurrency } from "@/lib/utils";
import { DIA_VENCIMENTO_MAX } from "@/lib/assinatura/competencia";

export function MensalidadeInline({
  tenantId,
  valorAtual,
  diaAtual,
}: {
  tenantId: string;
  valorAtual: number | null;
  diaAtual: number | null;
}) {
  const router = useRouter();
  const [editando, setEditando] = useState(false);
  const [valor, setValor] = useState(valorAtual != null ? String(valorAtual) : "");
  const [dia, setDia] = useState(diaAtual != null ? String(diaAtual) : "");
  const [erro, setErro] = useState("");
  const [salvando, setSalvando] = useState(false);

  // Abrir e fechar o editor sempre parte do que está gravado. Deixar um número
  // digitado e abandonado no campo faria o operador ler como mensalidade real.
  function abrir() {
    setValor(valorAtual != null ? String(valorAtual) : "");
    setDia(diaAtual != null ? String(diaAtual) : "");
    setErro("");
    setEditando(true);
  }

  function cancelar() {
    setValor(valorAtual != null ? String(valorAtual) : "");
    setDia(diaAtual != null ? String(diaAtual) : "");
    setErro("");
    setEditando(false);
  }

  async function salvar(e: React.FormEvent) {
    e.preventDefault();
    setSalvando(true);
    setErro("");

    try {
      const res = await fetch(`/api/platform/clientes/${tenantId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        // Campo apagado volta a "sem plano", não a zero.
        body: JSON.stringify({
          valorMensal: valor.trim() ? Number(valor) : null,
          diaVencimento: dia.trim() ? Number(dia) : null,
        }),
      });

      if (!res.ok) {
        setErro("Não salvou.");
        return;
      }

      setEditando(false);
      router.refresh();
    } catch {
      setErro("Sem conexão.");
    } finally {
      setSalvando(false);
    }
  }

  if (!editando) {
    return (
      <button
        onClick={abrir}
        className="tabular text-sm text-console-tinta hover:text-brand transition text-right"
      >
        {valorAtual != null ? formatCurrency(valorAtual) : "definir"}
        {diaAtual != null && (
          <span className="text-neutral-400"> · dia {diaAtual}</span>
        )}
      </button>
    );
  }

  return (
    <form onSubmit={salvar} className="flex items-center gap-1.5">
      <input
        type="number"
        step="0.01"
        min="0"
        value={valor}
        onChange={(e) => setValor(e.target.value)}
        autoFocus
        aria-label="Mensalidade"
        className="tabular w-24 px-2 py-1 rounded border border-console-linha bg-console-papel text-sm text-right"
      />
      <input
        type="number"
        step="1"
        min="1"
        max={DIA_VENCIMENTO_MAX}
        value={dia}
        onChange={(e) => setDia(e.target.value)}
        aria-label="Dia de vencimento"
        placeholder="dia"
        className="tabular w-14 px-2 py-1 rounded border border-console-linha bg-console-papel text-sm text-right"
      />
      <button
        type="submit"
        disabled={salvando}
        aria-label="Salvar mensalidade"
        className="text-xs font-semibold text-brand disabled:opacity-50"
      >
        ok
      </button>
      <button
        type="button"
        onClick={cancelar}
        aria-label="Cancelar"
        className="text-xs text-neutral-400"
      >
        x
      </button>
      {erro && <span className="text-xs text-red-600">{erro}</span>}
    </form>
  );
}
