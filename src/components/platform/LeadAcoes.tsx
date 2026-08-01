"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

const STATUS = [
  ["NOVO", "Novo"],
  ["CONTATADO", "Contatado"],
  ["NEGOCIACAO", "Em negociação"],
  ["FECHADO", "Fechado"],
  ["PERDIDO", "Perdido"],
] as const;

export function LeadAcoes({
  leadId,
  statusAtual,
}: {
  leadId: string;
  statusAtual: string;
}) {
  const router = useRouter();
  const [texto, setTexto] = useState("");
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState("");

  async function mudarStatus(status: string) {
    setSalvando(true);
    setErro("");

    try {
      const res = await fetch(`/api/platform/leads/${leadId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });

      if (!res.ok) {
        setErro("Não foi possível atualizar o status.");
        return;
      }

      router.refresh();
    } catch {
      // Rede caiu no meio do clique. Sem isto o botão ficaria travado em
      // "salvando" e o usuário não saberia que o status não mudou de verdade.
      setErro("Sem conexão. Verifique a internet e tente de novo.");
    } finally {
      setSalvando(false);
    }
  }

  async function adicionarNota(e: React.FormEvent) {
    e.preventDefault();
    if (!texto.trim()) return;
    setSalvando(true);
    setErro("");

    try {
      const res = await fetch(`/api/platform/leads/${leadId}/notas`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ texto }),
      });

      if (!res.ok) {
        setErro("Não foi possível salvar a anotação.");
        return;
      }

      setTexto("");
      router.refresh();
    } catch {
      // Mesmo cuidado aqui: sem isto o texto digitado some sem aviso e o
      // formulário fica travado em "salvando" para sempre.
      setErro("Sem conexão. Verifique a internet e tente de novo.");
    } finally {
      setSalvando(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        {STATUS.map(([valor, rotulo]) => (
          <button
            key={valor}
            onClick={() => mudarStatus(valor)}
            disabled={salvando || valor === statusAtual}
            className={`text-xs font-semibold px-3 py-1.5 rounded-full transition ${
              valor === statusAtual
                ? "bg-brand text-white"
                : "bg-neutral-100 text-neutral-600 hover:bg-neutral-200"
            }`}
          >
            {rotulo}
          </button>
        ))}
      </div>

      <form onSubmit={adicionarNota} className="flex gap-2">
        <input
          value={texto}
          onChange={(e) => setTexto(e.target.value)}
          placeholder="Anotar algo sobre este lead..."
          className="flex-1 px-4 py-2.5 rounded-lg border border-neutral-200 bg-neutral-50 text-sm focus:outline-none focus:ring-2 focus:ring-brand"
        />
        <button
          type="submit"
          disabled={salvando}
          className="bg-brand hover:bg-brand-dark disabled:opacity-50 text-white text-sm font-semibold px-4 rounded-lg transition"
        >
          Anotar
        </button>
      </form>

      {erro && <p className="text-sm text-red-600">{erro}</p>}
    </div>
  );
}
