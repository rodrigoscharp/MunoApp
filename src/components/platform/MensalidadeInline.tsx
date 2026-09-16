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
        className="tabular text-sm font-medium text-console-tinta hover:text-console-segunda transition text-right whitespace-nowrap"
      >
        {valorAtual != null ? formatCurrency(valorAtual) : "definir"}
        {diaAtual != null && (
          <span className="text-console-mudo font-normal"> · dia {diaAtual}</span>
        )}
      </button>
    );
  }

  return (
    // Os campos encolhem no celular em vez de manter a largura do desktop:
    // com w-24 fixo o editor inteiro saía pela direita da tela em 375px.
    <form onSubmit={salvar} className="flex items-center gap-1.5">
      <input
        type="number"
        step="0.01"
        min="0"
        value={valor}
        onChange={(e) => setValor(e.target.value)}
        autoFocus
        aria-label="Mensalidade"
        className="tabular w-20 sm:w-24 h-9 px-2.5 rounded-xl border border-console-linha bg-console-cartao text-sm text-right outline-none focus:border-console-tinta"
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
        className="tabular w-12 sm:w-14 h-9 px-2 rounded-xl border border-console-linha bg-console-cartao text-sm text-right outline-none focus:border-console-tinta"
      />
      <button
        type="submit"
        disabled={salvando}
        aria-label="Salvar mensalidade"
        className="h-9 px-3 rounded-xl bg-console-campo text-console-sobre-campo text-[13px] font-semibold disabled:opacity-50"
      >
        ok
      </button>
      <button
        type="button"
        onClick={cancelar}
        aria-label="Cancelar"
        className="size-9 shrink-0 rounded-xl text-[13px] text-console-mudo hover:text-console-tinta transition"
      >
        ✕
      </button>
      {erro && <span className="text-xs text-console-alerta">{erro}</span>}
    </form>
  );
}
