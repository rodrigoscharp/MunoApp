"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { PlanoTenant } from "@prisma/client";
import { PLANO_LABELS, PRECOS } from "@/lib/plans";
import { sugerirSlug } from "@/lib/inscricao/sugerir-slug";

// Só uma sugestão de preenchimento pro campo de mensalidade — a régua de
// preço em si não vive aqui, e o operador pode sempre editar por cima
// (desconto, negociação caso a caso).
//
// Derivada de PRECOS, e não digitada de novo. Enquanto os números moravam aqui
// eles envelheciam sozinhos: a landing anunciava 99,99 e este campo sugeria 99.
// Ponto, e não vírgula, porque o input é type="number".
function mensalidadeSugerida(plano: PlanoTenant): string {
  return (PRECOS[plano].mensalCentavos / 100).toFixed(2);
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
  const [plano, setPlano] = useState<PlanoTenant>("MEMBRO");
  const [mensalidade, setMensalidade] = useState("");
  // Uma vez que o operador digitou a mensalidade na mão (desconto, valor
  // negociado), trocar de plano não pode mais sobrescrever o que ele digitou.
  const [mensalidadeTocada, setMensalidadeTocada] = useState(false);
  const [diaVencimento, setDiaVencimento] = useState("");
  const [diasDeCortesia, setDiasDeCortesia] = useState("");
  const [erro, setErro] = useState("");
  const [loading, setLoading] = useState(false);
  const [credenciais, setCredenciais] = useState<Credenciais | null>(null);

  function escolherPlano(novoPlano: PlanoTenant) {
    setPlano(novoPlano);
    if (!mensalidadeTocada) {
      setMensalidade(mensalidadeSugerida(novoPlano));
    }
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setErro("");

    try {
      const res = await fetch(`/api/platform/leads/${leadId}/converter`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          slug,
          email,
          plano,
          ...(mensalidade.trim() ? { valorMensal: Number(mensalidade) } : {}),
          // Só vão junto se houver mensalidade: sem valor não se cria
          // assinatura, e mandar vencimento solto faria a rota receber campo
          // que ela não tem onde guardar.
          ...(mensalidade.trim() && diaVencimento.trim()
            ? { diaVencimento: Number(diaVencimento) }
            : {}),
          ...(mensalidade.trim() && diasDeCortesia.trim()
            ? { diasDeCortesia: Number(diasDeCortesia) }
            : {}),
        }),
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
      <div className="bg-console-positivo-fundo border border-console-positivo/25 rounded-xl p-5 space-y-3">
        <p className="font-semibold text-console-positivo">Cliente criado!</p>

        <dl className="text-sm space-y-1">
          <div>
            <dt className="text-console-positivo inline">URL: </dt>
            <dd className="inline font-mono">{credenciais.url}</dd>
          </div>
          <div>
            <dt className="text-console-positivo inline">Login: </dt>
            <dd className="inline font-mono">{credenciais.email}</dd>
          </div>
          <div>
            <dt className="text-console-positivo inline">Senha: </dt>
            <dd className="inline font-mono font-bold">{credenciais.senha}</dd>
          </div>
        </dl>

        {credenciais.aviso && (
          <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
            {credenciais.aviso}
          </p>
        )}

        <p className="text-xs text-console-positivo">
          Anote a senha agora — ela aparece uma única vez e não é recuperável.
        </p>

        <div className="flex gap-2">
          <button
            onClick={() => navigator.clipboard.writeText(texto)}
            className="bg-console-campo hover:bg-console-campo-esc text-console-sobre-campo text-sm font-semibold px-4 py-2 rounded-xl transition"
          >
            Copiar
          </button>
          <button
            onClick={() => {
              setCredenciais(null);
              router.refresh();
            }}
            className="text-sm text-console-positivo px-4 py-2"
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
        className="w-full bg-console-campo hover:bg-console-campo-esc text-console-sobre-campo font-semibold py-3 rounded-xl transition"
      >
        Converter em cliente
      </button>
    );
  }

  return (
    <form
      onSubmit={onSubmit}
      className="bg-console-cartao border border-console-linha rounded-xl p-5 space-y-3"
    >
      <div>
        <label
          htmlFor="converter-slug"
          className="block text-sm font-medium text-console-tinta mb-1"
        >
          Endereço do restaurante *
        </label>
        <div className="flex items-center gap-1">
          <input
            id="converter-slug"
            value={slug}
            onChange={(e) => setSlug(e.target.value)}
            required
            className="flex-1 px-4 py-2.5 rounded-lg border border-console-linha bg-console-papel text-sm font-mono focus:outline-none focus:ring-2 focus:ring-console-tinta/15"
          />
          <span className="text-sm text-console-mudo">.munoapp.com.br</span>
        </div>
      </div>

      <div>
        <label
          htmlFor="converter-email"
          className="block text-sm font-medium text-console-tinta mb-1"
        >
          E-mail do dono *
        </label>
        <input
          type="email"
          id="converter-email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
          placeholder="joao@pizzaria.com"
          className="w-full px-4 py-2.5 rounded-lg border border-console-linha bg-console-papel text-sm focus:outline-none focus:ring-2 focus:ring-console-tinta/15"
        />
      </div>

      <div>
        <label className="block text-sm font-medium text-console-tinta mb-1">
          Plano
        </label>
        <div className="flex gap-2">
          {(Object.keys(PLANO_LABELS) as PlanoTenant[]).map((opcao) => (
            <button
              key={opcao}
              type="button"
              onClick={() => escolherPlano(opcao)}
              className={`flex-1 px-3 py-2.5 rounded-lg border text-sm font-medium transition ${
                plano === opcao
                  ? "border-console-tinta bg-console-tinta/[0.06] text-console-tinta"
                  : "border-console-linha bg-console-papel text-console-segunda"
              }`}
            >
              {PLANO_LABELS[opcao]}
            </button>
          ))}
        </div>
      </div>

      <div>
        <label
          htmlFor="converter-mensalidade"
          className="block text-sm font-medium text-console-tinta mb-1"
        >
          Mensalidade (opcional)
        </label>
        <input
          type="number"
          step="0.01"
          id="converter-mensalidade"
          value={mensalidade}
          onChange={(e) => {
            setMensalidadeTocada(true);
            setMensalidade(e.target.value);
          }}
          placeholder="0,00"
          className="w-full px-4 py-2.5 rounded-lg border border-console-linha bg-console-papel text-sm focus:outline-none focus:ring-2 focus:ring-console-tinta/15"
        />
      </div>

      {/* Vencimento e cortesia só aparecem quando há mensalidade: sem valor não
          existe assinatura para eles configurarem, e dois campos mortos no
          formulário fazem quem converte um lead sem cobrança se perguntar o que
          deixou de preencher. */}
      {mensalidade.trim() !== "" && (
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label
              htmlFor="converter-vencimento"
              className="block text-sm font-medium text-console-tinta mb-1"
            >
              Dia do vencimento
            </label>
            <input
              type="number"
              min={1}
              max={28}
              id="converter-vencimento"
              value={diaVencimento}
              onChange={(e) => setDiaVencimento(e.target.value)}
              placeholder="10"
              className="w-full px-4 py-2.5 rounded-lg border border-console-linha bg-console-papel text-sm focus:outline-none focus:ring-2 focus:ring-console-tinta/15"
            />
            {/* O teto de 28 não é arbitrário: é o maior dia que existe em todo
                mês, e é o que dispensa regra de fim de fevereiro. */}
            <p className="mt-1 text-[11px] text-console-mudo">de 1 a 28</p>
          </div>
          <div>
            <label
              htmlFor="converter-cortesia"
              className="block text-sm font-medium text-console-tinta mb-1"
            >
              Dias de cortesia
            </label>
            <input
              type="number"
              min={0}
              max={365}
              id="converter-cortesia"
              value={diasDeCortesia}
              onChange={(e) => setDiasDeCortesia(e.target.value)}
              placeholder="0"
              className="w-full px-4 py-2.5 rounded-lg border border-console-linha bg-console-papel text-sm focus:outline-none focus:ring-2 focus:ring-console-tinta/15"
            />
            <p className="mt-1 text-[11px] text-console-mudo">
              antes da primeira cobrança
            </p>
          </div>
        </div>
      )}

      {erro && <p className="text-sm text-console-alerta">{erro}</p>}

      <div className="flex gap-2">
        <button
          type="submit"
          disabled={loading}
          className="bg-console-campo hover:bg-console-campo-esc disabled:opacity-50 text-console-sobre-campo text-sm font-semibold px-4 py-2 rounded-xl transition"
        >
          {loading ? "Criando..." : "Criar cliente"}
        </button>
        <button
          type="button"
          onClick={() => setAberto(false)}
          className="text-sm text-console-segunda px-4 py-2"
        >
          Cancelar
        </button>
      </div>
    </form>
  );
}
