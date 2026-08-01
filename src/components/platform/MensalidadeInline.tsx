"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { formatCurrency } from "@/lib/utils";

export function MensalidadeInline({
  tenantId,
  valorAtual,
}: {
  tenantId: string;
  valorAtual: number | null;
}) {
  const router = useRouter();
  const [editando, setEditando] = useState(false);
  const [valor, setValor] = useState(valorAtual != null ? String(valorAtual) : "");
  const [erro, setErro] = useState("");
  const [salvando, setSalvando] = useState(false);

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
        onClick={() => setEditando(true)}
        className="tabular text-sm text-console-tinta hover:text-brand transition text-right"
      >
        {valorAtual != null ? formatCurrency(valorAtual) : "definir"}
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
        className="tabular w-24 px-2 py-1 rounded border border-console-linha bg-console-fundo text-sm text-right"
      />
      <button
        type="submit"
        disabled={salvando}
        className="text-xs font-semibold text-brand disabled:opacity-50"
      >
        ok
      </button>
      <button
        type="button"
        onClick={() => setEditando(false)}
        className="text-xs text-neutral-400"
      >
        x
      </button>
      {erro && <span className="text-xs text-red-600">{erro}</span>}
    </form>
  );
}
