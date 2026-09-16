"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { PlanoTenant } from "@prisma/client";
import { PLANO_LABELS } from "@/lib/plans";

export function PlanoInline({
  leadId,
  planoAtual,
}: {
  leadId: string;
  planoAtual: PlanoTenant;
}) {
  const router = useRouter();
  const [salvando, setSalvando] = useState<PlanoTenant | null>(null);
  const [erro, setErro] = useState("");

  async function mudarPara(plano: PlanoTenant) {
    if (plano === planoAtual || salvando) return;
    setSalvando(plano);
    setErro("");

    try {
      const res = await fetch(`/api/platform/leads/${leadId}/plano`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ plano }),
      });

      if (!res.ok) {
        setErro("Não salvou.");
        return;
      }

      router.refresh();
    } catch {
      setErro("Sem conexão.");
    } finally {
      setSalvando(null);
    }
  }

  return (
    <div className="flex items-center gap-2 text-sm">
      <span className="text-console-positivo">Plano:</span>
      <div className="flex gap-1.5">
        {(Object.keys(PLANO_LABELS) as PlanoTenant[]).map((opcao) => (
          <button
            key={opcao}
            type="button"
            onClick={() => mudarPara(opcao)}
            disabled={salvando !== null}
            className={`px-2.5 py-1 rounded-lg text-xs font-medium transition disabled:opacity-50 ${
              opcao === planoAtual
                ? "bg-console-campo text-console-sobre-campo"
                : "bg-console-cartao border border-console-positivo/30 text-console-positivo hover:bg-console-positivo-fundo"
            }`}
          >
            {salvando === opcao ? "Salvando..." : PLANO_LABELS[opcao]}
          </button>
        ))}
      </div>
      {erro && <span className="text-xs text-console-alerta">{erro}</span>}
    </div>
  );
}
