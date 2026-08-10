"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { formatCurrency } from "@/lib/utils";

interface Props {
  cobrancaId: string;
  valor: number;
  /** "2026-08" — a competência da cobrança em aberto mais antiga. */
  competencia: string;
}

/** "2026-08" vira "08/26", que é o que cabe num botão de lista. */
function formatarCompetencia(competencia: string): string {
  const [ano, mes] = competencia.split("-");
  return `${mes}/${ano.slice(2)}`;
}

/**
 * O botão de baixa manual na lista de clientes.
 *
 * Enquanto não há gateway, este botão é o momento em que o dinheiro entra no
 * sistema: o operador conferiu o PIX e registra. Por isso ele pede confirmação
 * antes de gravar — a linha é estreita, os clientes ficam um debaixo do outro,
 * e um clique errado marcaria como pago quem não pagou, devolvendo acesso a um
 * restaurante bloqueado. A confirmação repete valor e competência para que o
 * segundo clique seja uma conferência, não um reflexo.
 */
export function DarBaixa({ cobrancaId, valor, competencia }: Props) {
  const router = useRouter();
  const [confirmando, setConfirmando] = useState(false);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState("");

  async function baixar() {
    setSalvando(true);
    setErro("");

    try {
      const res = await fetch(
        `/api/platform/cobrancas/${cobrancaId}/baixa`,
        { method: "POST" }
      );

      if (!res.ok) {
        setErro("Não deu baixa.");
        return;
      }

      setConfirmando(false);
      // O status da assinatura é recalculado no servidor; o refresh é o que
      // traz a situação nova para a lista sem o operador recarregar a página.
      router.refresh();
    } catch {
      setErro("Sem conexão.");
    } finally {
      setSalvando(false);
    }
  }

  if (!confirmando) {
    return (
      <button
        onClick={() => {
          setErro("");
          setConfirmando(true);
        }}
        className="shrink-0 rounded-lg border border-console-linha px-2.5 py-1 text-xs font-semibold text-brand hover:bg-brand/5 transition"
      >
        dar baixa
      </button>
    );
  }

  return (
    <div className="flex items-center gap-1.5 shrink-0">
      <button
        onClick={baixar}
        disabled={salvando}
        className="rounded-lg bg-brand hover:bg-brand-dark px-2.5 py-1 text-xs font-semibold text-white disabled:opacity-50 transition"
      >
        pagou {formatCurrency(valor)} · {formatarCompetencia(competencia)}
      </button>
      <button
        type="button"
        onClick={() => setConfirmando(false)}
        aria-label="Cancelar baixa"
        className="text-xs text-neutral-400"
      >
        x
      </button>
      {erro && <span className="text-xs text-red-600">{erro}</span>}
    </div>
  );
}
