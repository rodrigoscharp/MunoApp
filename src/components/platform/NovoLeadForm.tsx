"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Plus } from "lucide-react";

const CAMPOS = [
  { name: "contato", label: "Nome do contato" },
  { name: "telefone", label: "Telefone" },
  { name: "email", label: "E-mail" },
  { name: "cidade", label: "Cidade" },
] as const;

export function NovoLeadForm() {
  const router = useRouter();
  const [aberto, setAberto] = useState(false);
  const [restaurante, setRestaurante] = useState("");
  const [extras, setExtras] = useState<Record<string, string>>({});
  const [erro, setErro] = useState("");
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setErro("");

    try {
      const res = await fetch("/api/platform/leads", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ restaurante, ...extras }),
      });

      if (!res.ok) {
        setErro("Não foi possível salvar o lead.");
        return;
      }

      setRestaurante("");
      setExtras({});
      setAberto(false);
      router.refresh();
    } catch {
      // Rede caiu no meio. Sem isto o botão ficaria travado em "Salvando..."
      // e o que foi digitado se perderia num reload.
      setErro("Sem conexão. Verifique a internet e tente de novo.");
    } finally {
      setLoading(false);
    }
  }

  if (!aberto) {
    return (
      <button
        onClick={() => setAberto(true)}
        className="flex items-center gap-2 bg-brand hover:bg-brand-dark text-white text-sm font-semibold px-4 py-2 rounded-xl transition"
      >
        <Plus size={16} />
        Novo lead
      </button>
    );
  }

  return (
    <form
      onSubmit={onSubmit}
      className="w-full bg-white border border-neutral-200 rounded-xl p-5 space-y-3"
    >
      <div>
        <label className="block text-sm font-medium text-neutral-700 mb-1">
          Restaurante *
        </label>
        <input
          value={restaurante}
          onChange={(e) => setRestaurante(e.target.value)}
          required
          minLength={2}
          autoFocus
          placeholder="Pizzaria do João"
          className="w-full px-4 py-2.5 rounded-lg border border-neutral-200 bg-neutral-50 text-sm focus:outline-none focus:ring-2 focus:ring-brand"
        />
      </div>

      {/* Só o nome é obrigatório: exigir mais faz o lead não ser cadastrado. */}
      <div className="grid grid-cols-2 gap-3">
        {CAMPOS.map((campo) => (
          <div key={campo.name}>
            <label className="block text-xs font-medium text-neutral-600 mb-1">
              {campo.label}
            </label>
            <input
              value={extras[campo.name] ?? ""}
              onChange={(e) =>
                setExtras((prev) => ({ ...prev, [campo.name]: e.target.value }))
              }
              className="w-full px-3 py-2 rounded-lg border border-neutral-200 bg-neutral-50 text-sm focus:outline-none focus:ring-2 focus:ring-brand"
            />
          </div>
        ))}
      </div>

      {erro && <p className="text-sm text-red-600">{erro}</p>}

      <div className="flex gap-2">
        <button
          type="submit"
          disabled={loading}
          className="bg-brand hover:bg-brand-dark disabled:opacity-50 text-white text-sm font-semibold px-4 py-2 rounded-xl transition"
        >
          {loading ? "Salvando..." : "Salvar"}
        </button>
        <button
          type="button"
          onClick={() => setAberto(false)}
          className="text-sm text-neutral-500 px-4 py-2"
        >
          Cancelar
        </button>
      </div>
    </form>
  );
}
