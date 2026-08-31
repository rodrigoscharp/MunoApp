"use client";

import { useEffect, useRef, useState } from "react";
import type { PlanoTenant } from "@prisma/client";
import type { Ciclo } from "@/lib/plans";
import { sugerirSlug } from "@/lib/inscricao/sugerir-slug";
import { isValidCpfCnpj, stripDocumento } from "@/lib/cpf";

type Metodo = "CREDIT_CARD" | "PIX";

type EstadoSlug = "vazio" | "checando" | "livre" | "ocupado";

const MOTIVO_LABEL: Record<string, string> = {
  INVALIDO: "Endereço inválido — use letras minúsculas, números e hífen.",
  RESERVADO: "Este endereço é reservado pela plataforma.",
  EM_USO: "Este endereço já está em uso.",
};

/**
 * Dispara e esquece, como na landing (public/vendas/js/main.js): nada aqui
 * pode atrasar ou atrapalhar uma compra em andamento. keepalive para
 * sobreviver à navegação para o gateway logo em seguida.
 */
function evento(
  tipo: string,
  detalhe?: string,
  meta?: {
    utm?: { source?: string; medium?: string; campaign?: string };
    referrer?: string;
    dispositivo?: "celular" | "desktop";
  }
) {
  fetch("/api/funil/evento", {
    method: "POST",
    keepalive: true,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ tipo, detalhe, ...meta }),
  }).catch(() => {});
}

// CPF tem 11 dígitos, CNPJ tem 14 — a máscara decide qual aplicar pela
// contagem do que já foi digitado, sem exigir que a pessoa avise antes qual
// documento vai usar.
function maskCpfCnpj(value: string): string {
  const d = stripDocumento(value).slice(0, 14);
  if (d.length <= 11) {
    if (d.length <= 3) return d;
    if (d.length <= 6) return `${d.slice(0, 3)}.${d.slice(3)}`;
    if (d.length <= 9) return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6)}`;
    return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6, 9)}-${d.slice(9)}`;
  }
  if (d.length <= 2) return d;
  if (d.length <= 5) return `${d.slice(0, 2)}.${d.slice(2)}`;
  if (d.length <= 8) return `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5)}`;
  if (d.length <= 12)
    return `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5, 8)}/${d.slice(8)}`;
  return `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5, 8)}/${d.slice(8, 12)}-${d.slice(12)}`;
}

export function FormularioAssinatura({
  plano,
  ciclo,
}: {
  plano: PlanoTenant;
  ciclo: Ciclo;
}) {
  const [nome, setNome] = useState("");
  const [email, setEmail] = useState("");
  const [cpfCnpj, setCpfCnpj] = useState("");
  const [slug, setSlug] = useState("");
  // Uma vez que a pessoa mexeu no endereço na mão, trocar o nome não pode
  // mais sobrescrever o que ela escolheu — mesmo raciocínio da mensalidade em
  // ConverterLead.tsx.
  const [slugTocado, setSlugTocado] = useState(false);
  // Guarda o resultado JUNTO do slug a que ele pertence, em vez de um estado
  // solto atualizado direto no corpo do efeito. Assim "checando"/"livre"/
  // "ocupado" são derivados na renderização (comparando resultado.slug com o
  // slug atual), e o efeito só chama setState de dentro do callback
  // assíncrono — a forma que o react-hooks aprova, e que também descarta de
  // graça um resultado que chegou depois de o campo já ter mudado de novo.
  const [resultado, setResultado] = useState<
    { slug: string; livre: boolean; motivo?: string } | null
  >(null);
  // Mensal é sempre cartão — a API recusa mensal+PIX com 400, e a escolha de
  // método só faz sentido existir na tela quando o ciclo é anual.
  const [metodo, setMetodo] = useState<Metodo>("CREDIT_CARD");
  const [erro, setErro] = useState("");
  const [loading, setLoading] = useState(false);

  // Uma vez por marco, por montagem. useRef e não useState: registrar um passo
  // não deve provocar render, e um Set em estado re-renderizaria o formulário
  // inteiro no meio da digitação.
  const passosVistos = useRef(new Set<string>());

  function registrarPasso(passo: "endereco" | "documento" | "pagamento") {
    if (passosVistos.current.has(passo)) return;
    passosVistos.current.add(passo);
    evento("CHECKOUT_PASSO", passo);
  }

  // O proxy planta o cookie de sessão em /assinar de propósito para quem
  // chega direto (anúncio, link do popup de saída da landing), mas nada
  // nesta página mandava UTM: a sessão nascia sem atribuição no primeiro
  // evento (CHECKOUT_PASSO), o primeiro toque tranca, e uma visita posterior
  // à landing com UTM não corrige mais. Efeito com array de dependências
  // vazio: uma vez por montagem, como o VISITA da landing.
  //
  // Contar uma segunda VISITA para quem clicou a partir da landing é
  // correto e não distorce — VISITA já significa "chegou numa página", e
  // recarregar a landing também conta duas. O que importa é a sessão ser
  // única, e ela é.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const utm = {
      source: params.get("utm_source") || undefined,
      medium: params.get("utm_medium") || undefined,
      campaign: params.get("utm_campaign") || undefined,
    };

    // Só o host de quem indicou, nunca a URL inteira — mesmo raciocínio de
    // main.js.
    let referrer: string | undefined;
    try {
      referrer = document.referrer
        ? new URL(document.referrer).hostname
        : undefined;
    } catch {
      referrer = undefined;
    }

    // jsdom (ambiente de teste) não implementa matchMedia — guard evita que
    // a suíte quebre por um detalhe de ambiente, não de comportamento.
    const dispositivo =
      typeof window.matchMedia === "function" &&
      window.matchMedia("(max-width: 767px)").matches
        ? "celular"
        : "desktop";

    evento("VISITA", undefined, { utm, referrer, dispositivo });
  }, []);

  function onNomeChange(valor: string) {
    setNome(valor);
    if (!slugTocado) setSlug(sugerirSlug(valor));
  }

  // Checagem ao vivo do endereço, com debounce e cancelamento da consulta
  // anterior. Sem o AbortController, quem digita rápido pode ver chegar a
  // resposta de um slug que já não está mais no campo — e o botão libera
  // para um endereço que, na verdade, está ocupado. O guard de
  // `signal.aborted` cobre o mesmo risco de novo, por cima: mesmo que a
  // resposta abortada chegasse a cair no catch, ela nunca sobrescreve o
  // resultado do slug atual.
  useEffect(() => {
    if (!slug) return;

    const controller = new AbortController();
    const timer = setTimeout(async () => {
      try {
        const res = await fetch(
          `/api/assinar/slug?slug=${encodeURIComponent(slug)}`,
          { signal: controller.signal }
        );
        const body = await res.json();
        setResultado({ slug, livre: !!body.livre, motivo: body.motivo });
        // Marco "endereco": só quando a checagem confirma que o slug está
        // livre, não quando a pessoa apenas digitou algo no campo.
        if (body.livre) registrarPasso("endereco");
      } catch {
        // Abortada (nova tecla chegou) ou a rede caiu. "ocupado" é o
        // fail-closed certo nos dois casos que sobram: melhor pedir para
        // tentar de novo do que deixar pagar por um endereço que talvez já
        // não esteja livre.
        if (!controller.signal.aborted) {
          setResultado({ slug, livre: false });
        }
      }
    }, 400);

    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [slug]);

  // "checando" cobre tanto quem ainda não digitou nada de novo desde a
  // última resposta quanto quem digitou e o debounce ainda não disparou —
  // resultado.slug !== slug nos dois casos, então não precisa distinguir.
  const estadoSlug: EstadoSlug = !slug
    ? "vazio"
    : resultado?.slug === slug
      ? resultado.livre
        ? "livre"
        : "ocupado"
      : "checando";
  const motivoIndisponivel =
    resultado?.slug === slug ? (resultado.motivo ?? null) : null;

  const cpfCnpjDigitos = stripDocumento(cpfCnpj);
  const cpfCnpjPreenchidoInvalido =
    cpfCnpjDigitos.length >= 11 && !isValidCpfCnpj(cpfCnpj);

  const podeEnviar =
    !loading &&
    estadoSlug === "livre" &&
    nome.trim().length >= 2 &&
    email.trim().length > 0 &&
    isValidCpfCnpj(cpfCnpj);

  async function onSubmit(e: React.FormEvent) {
    // Antes de qualquer await, de propósito: o evento precisa sair mesmo que
    // o envio falhe — "chegou no pagamento e a compra não completou" é
    // exatamente o caso que este passo existe para revelar.
    registrarPasso("pagamento");
    e.preventDefault();
    if (!podeEnviar) return;

    setLoading(true);
    setErro("");

    try {
      const res = await fetch("/api/assinar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          nome,
          email,
          slug,
          cpfCnpj,
          plano,
          ciclo,
          // No mensal a escolha nem aparece na tela, mas o estado inicial já
          // é CREDIT_CARD — não há caminho para mandar PIX+MENSAL por aqui.
          metodo: ciclo === "MENSAL" ? "CREDIT_CARD" : metodo,
        }),
      });
      const body = await res.json().catch(() => ({}));

      if (!res.ok) {
        // setLoading(false) ANTES do return: `podeEnviar` inclui `!loading`,
        // então sair daqui com loading ligado desabilitava o botão para
        // sempre. A pessoa lia "Endereço indisponível" ou "Muitas
        // tentativas", corrigia o campo, e não tinha como reenviar sem
        // recarregar a página — no meio de uma compra. O caminho de sucesso
        // NÃO reseta de propósito: ali a navegação para o gateway já está a
        // caminho, e reabilitar o botão convidaria a um segundo pedido.
        setLoading(false);
        setErro(body?.error ?? "Não foi possível iniciar o pagamento.");
        return;
      }

      // window.location, e não router.push: checkoutUrl é do domínio do
      // Asaas. O cartão é digitado lá, nunca numa página nossa — é o que
      // dispensa afrouxar o Permissions-Policy e o X-Frame-Options do
      // next.config.js para permitir um iframe de pagamento.
      window.location.href = body.checkoutUrl;
    } catch {
      setErro("Sem conexão. Verifique a internet e tente de novo.");
      setLoading(false);
    }
  }

  return (
    <form
      onSubmit={onSubmit}
      className="space-y-4 rounded-3xl border border-neutral-200/80 bg-white p-5 sm:p-7 shadow-[0_1px_2px_rgba(30,61,47,0.04),0_12px_32px_-12px_rgba(30,61,47,0.14)]"
    >
      <div>
        <label
          htmlFor="assinar-nome"
          className="block text-sm font-medium text-neutral-700 mb-1"
        >
          Nome do restaurante *
        </label>
        <input
          id="assinar-nome"
          value={nome}
          onChange={(e) => onNomeChange(e.target.value)}
          required
          placeholder="Pizzaria do João"
          className="w-full px-4 py-2.5 rounded-lg border border-neutral-200 bg-neutral-50 text-sm focus:outline-none focus:ring-2 focus:ring-brand"
        />
      </div>

      <div>
        <label
          htmlFor="assinar-slug"
          className="block text-sm font-medium text-neutral-700 mb-1"
        >
          Endereço do seu cardápio *
        </label>
        {/* `min-w-0` no input não é enfeite: item de flex nasce com
            `min-width: auto`, e input tem largura mínima intrínseca (~177px,
            do atributo `size` padrão). Sem ele, `flex-1` não consegue encolher
            abaixo disso, e com o sufixo em `whitespace-nowrap` a linha exige
            ~286px. Cabe num iPhone comum e ESTOURA num de 320px, empurrando
            ".munoapp.com.br" para fora do card — bem no campo que a pessoa
            mais olha nesta tela. */}
        <div className="flex items-center gap-1">
          <input
            id="assinar-slug"
            value={slug}
            onChange={(e) => {
              setSlugTocado(true);
              setSlug(e.target.value.toLowerCase());
            }}
            required
            className="min-w-0 flex-1 px-3 py-2.5 sm:px-4 rounded-lg border border-neutral-200 bg-neutral-50 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-brand"
          />
          <span className="shrink-0 text-xs sm:text-sm text-neutral-400 whitespace-nowrap">
            .munoapp.com.br
          </span>
        </div>
        <p className="mt-1 text-xs">
          {estadoSlug === "checando" && (
            <span className="text-neutral-400">Verificando disponibilidade...</span>
          )}
          {estadoSlug === "livre" && (
            <span className="text-green-600">Endereço disponível</span>
          )}
          {estadoSlug === "ocupado" && (
            <span className="text-red-600">
              {(motivoIndisponivel && MOTIVO_LABEL[motivoIndisponivel]) ??
                "Endereço indisponível. Tente outro."}
            </span>
          )}
        </p>
      </div>

      <div>
        <label
          htmlFor="assinar-email"
          className="block text-sm font-medium text-neutral-700 mb-1"
        >
          E-mail *
        </label>
        <input
          type="email"
          id="assinar-email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
          placeholder="joao@pizzaria.com"
          className="w-full px-4 py-2.5 rounded-lg border border-neutral-200 bg-neutral-50 text-sm focus:outline-none focus:ring-2 focus:ring-brand"
        />
      </div>

      <div>
        <label
          htmlFor="assinar-cpf-cnpj"
          className="block text-sm font-medium text-neutral-700 mb-1"
        >
          CPF ou CNPJ *
        </label>
        <input
          id="assinar-cpf-cnpj"
          value={cpfCnpj}
          onChange={(e) => setCpfCnpj(maskCpfCnpj(e.target.value))}
          onBlur={() => {
            // Marco "documento": só quando o valor já digitado é válido —
            // saiu do campo no meio de um CPF incompleto não conta.
            if (isValidCpfCnpj(cpfCnpj)) registrarPasso("documento");
          }}
          required
          inputMode="numeric"
          placeholder="000.000.000-00"
          className="w-full px-4 py-2.5 rounded-lg border border-neutral-200 bg-neutral-50 text-sm focus:outline-none focus:ring-2 focus:ring-brand"
        />
        {cpfCnpjPreenchidoInvalido && (
          <p className="mt-1 text-xs text-red-600">Documento inválido.</p>
        )}
      </div>

      {/* A escolha de método só existe no anual: no mensal o Asaas cobra
          sozinho todo mês, e isso só existe no cartão — PIX mensal geraria um
          QR novo por mês para o cliente pagar na mão. A API recusa
          mensal+PIX com 400; a tela nem oferece a opção. */}
      {ciclo === "ANUAL" && (
        <div>
          <label className="block text-sm font-medium text-neutral-700 mb-1">
            Forma de pagamento
          </label>
          <div className="flex gap-2">
            {(
              [
                { valor: "CREDIT_CARD" as const, label: "Cartão" },
                { valor: "PIX" as const, label: "PIX" },
              ]
            ).map((opcao) => (
              <button
                key={opcao.valor}
                type="button"
                onClick={() => setMetodo(opcao.valor)}
                className={`flex-1 px-3 py-2.5 rounded-lg border text-sm font-medium transition ${
                  metodo === opcao.valor
                    ? "border-brand bg-brand-light text-brand-dark"
                    : "border-neutral-200 bg-neutral-50 text-neutral-600"
                }`}
              >
                {opcao.label}
              </button>
            ))}
          </div>
        </div>
      )}

      {erro && <p className="text-sm text-red-600">{erro}</p>}

      <button
        type="submit"
        disabled={!podeEnviar}
        className="w-full bg-brand hover:bg-brand-dark disabled:opacity-50 disabled:cursor-not-allowed text-white font-semibold py-3 rounded-xl transition text-sm"
      >
        {loading ? "Processando..." : "Ir para pagamento"}
      </button>
    </form>
  );
}
