"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

function sugerirSlug(nome: string): string {
  return nome
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "") // remove acentos (marcas combinantes)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

type Credenciais = {
  url: string;
  email: string;
  senha: string;
  aviso?: string;
};

export function ConverterLead({
  leadId,
  restauranteNome,
}: {
  leadId: string;
  restauranteNome: string;
}) {
  const router = useRouter();
  const [aberto, setAberto] = useState(false);
  const [slug, setSlug] = useState(() => sugerirSlug(restauranteNome));
  const [email, setEmail] = useState("");
  const [erro, setErro] = useState("");
  const [loading, setLoading] = useState(false);
  const [credenciais, setCredenciais] = useState<Credenciais | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setErro("");

    try {
      const res = await fetch(`/api/platform/leads/${leadId}/converter`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ slug, email }),
      });

      const body = await res.json().catch(() => ({}));

      if (!res.ok) {
        setErro(
          typeof body?.error === "string"
            ? body.error
            : "Não foi possível converter este lead."
        );
        return;
      }

      // Não chamamos router.refresh() aqui: o refresh re-renderiza a página e
      // apagaria a senha da tela, que não é recuperável depois.
      setCredenciais({
        url: body.url,
        email: body.email,
        senha: body.senha,
        aviso: body.aviso,
      });
    } catch {
      // Rede caiu no meio da conversão. Sem isto o botão ficaria travado em
      // "Criando..." e o usuário não saberia que o cliente não foi criado.
      setErro("Sem conexão. Verifique a internet e tente de novo.");
    } finally {
      setLoading(false);
    }
  }

  if (credenciais) {
    const texto = `${credenciais.url}\nLogin: ${credenciais.email}\nSenha: ${credenciais.senha}`;
    return (
      <div className="bg-green-50 border border-green-200 rounded-xl p-5 space-y-3">
        <p className="font-semibold text-green-800">Cliente criado!</p>

        <dl className="text-sm space-y-1">
          <div>
            <dt className="text-green-700 inline">URL: </dt>
            <dd className="inline font-mono">{credenciais.url}</dd>
          </div>
          <div>
            <dt className="text-green-700 inline">Login: </dt>
            <dd className="inline font-mono">{credenciais.email}</dd>
          </div>
          <div>
            <dt className="text-green-700 inline">Senha: </dt>
            <dd className="inline font-mono font-bold">{credenciais.senha}</dd>
          </div>
        </dl>

        {credenciais.aviso && (
          <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
            {credenciais.aviso}
          </p>
        )}

        <p className="text-xs text-green-700">
          Anote a senha agora — ela aparece uma única vez e não é recuperável.
        </p>

        <div className="flex gap-2">
          <button
            onClick={() => navigator.clipboard.writeText(texto)}
            className="bg-green-700 hover:bg-green-800 text-white text-sm font-semibold px-4 py-2 rounded-xl transition"
          >
            Copiar
          </button>
          <button
            onClick={() => {
              setCredenciais(null);
              router.refresh();
            }}
            className="text-sm text-green-700 px-4 py-2"
          >
            Já anotei
          </button>
        </div>
      </div>
    );
  }

  if (!aberto) {
    return (
      <button
        onClick={() => setAberto(true)}
        className="w-full bg-brand hover:bg-brand-dark text-white font-semibold py-3 rounded-xl transition"
      >
        Converter em cliente
      </button>
    );
  }

  return (
    <form
      onSubmit={onSubmit}
      className="bg-white border border-neutral-200 rounded-xl p-5 space-y-3"
    >
      <div>
        <label className="block text-sm font-medium text-neutral-700 mb-1">
          Endereço do restaurante *
        </label>
        <div className="flex items-center gap-1">
          <input
            value={slug}
            onChange={(e) => setSlug(e.target.value)}
            required
            className="flex-1 px-4 py-2.5 rounded-lg border border-neutral-200 bg-neutral-50 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-brand"
          />
          <span className="text-sm text-neutral-400">.munoapp.com.br</span>
        </div>
      </div>

      <div>
        <label className="block text-sm font-medium text-neutral-700 mb-1">
          E-mail do dono *
        </label>
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
          placeholder="joao@pizzaria.com"
          className="w-full px-4 py-2.5 rounded-lg border border-neutral-200 bg-neutral-50 text-sm focus:outline-none focus:ring-2 focus:ring-brand"
        />
      </div>

      {erro && <p className="text-sm text-red-600">{erro}</p>}

      <div className="flex gap-2">
        <button
          type="submit"
          disabled={loading}
          className="bg-brand hover:bg-brand-dark disabled:opacity-50 text-white text-sm font-semibold px-4 py-2 rounded-xl transition"
        >
          {loading ? "Criando..." : "Criar cliente"}
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
