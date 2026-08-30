"use client";

import { useState } from "react";
import { sugerirSlug } from "@/lib/inscricao/sugerir-slug";

/**
 * A tela que faltava entre "criou a senha" e "sabe usar o sistema".
 *
 * Dois passos, e só dois: identidade e primeiro item. São as duas coisas sem
 * as quais a loja está quebrada (endereço vazio aparece no cardápio do
 * cliente) ou vazia (nada para vender). Horário já nasce com padrão razoável e
 * frete só importa para quem entrega, então ficam para o painel, que é onde
 * eles já moram.
 *
 * Não cria rota de API nenhuma: usa as três que já existem, e que já validam e
 * já exigem ADMIN.
 *
 * Ver docs/superpowers/specs/2026-08-30-onboarding-do-cliente-novo-design.md.
 */
export function Comecar({
  nomeRestaurante,
  enderecoPreenchido,
  temItem,
}: {
  nomeRestaurante: string;
  enderecoPreenchido: boolean;
  temItem: boolean;
}) {
  // Quem já tem endereço mas não tem item cai direto no passo 2. O estado vem
  // dos dados, então retomar de onde parou é de graça.
  const [passo, setPasso] = useState<1 | 2>(enderecoPreenchido ? 2 : 1);
  const [endereco, setEndereco] = useState("");
  const [telefone, setTelefone] = useState("");
  const [categoria, setCategoria] = useState("");
  const [item, setItem] = useState("");
  const [preco, setPreco] = useState("");
  const [erro, setErro] = useState("");
  const [salvando, setSalvando] = useState(false);

  /** Traduz a recusa da rota em texto. Tela muda no meio do onboarding é a
   *  pior hora possível: a pessoa acabou de pagar e está montando a casa. */
  async function falhou(res: Response): Promise<boolean> {
    if (res.ok) return false;
    const corpo = await res.json().catch(() => ({}));
    setErro(corpo?.error ?? "Não foi possível salvar. Tente de novo.");
    setSalvando(false);
    return true;
  }

  async function salvarIdentidade(e: React.FormEvent) {
    e.preventDefault();
    setSalvando(true);
    setErro("");

    // `name` vai junto porque restaurantInfoSchema exige, e o nome já existe
    // desde o provisionamento: omiti-lo apagaria o que já estava certo.
    const res = await fetch("/api/settings/restaurant", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: nomeRestaurante,
        address: endereco,
        phone: telefone,
        logoUrl: "/munowbg.png",
        floorPlanImageUrl: null,
      }),
    });
    if (await falhou(res)) return;

    setSalvando(false);
    if (temItem) {
      window.location.href = "/adm";
      return;
    }
    setPasso(2);
  }

  async function salvarItem(e: React.FormEvent) {
    e.preventDefault();
    setSalvando(true);
    setErro("");

    // A ORDEM é a regra deste passo. /api/menu exige categoryId, e restaurante
    // recém-provisionado tem zero categorias — provisionTenant cria Tenant,
    // admin e o Setting do nome, e mais nada. Tentar o item primeiro devolve
    // 400 no primeiro produto que o cliente cadastra na vida dele.
    const resCategoria = await fetch("/api/categories", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: categoria,
        slug: sugerirSlug(categoria),
        position: 0,
      }),
    });
    if (await falhou(resCategoria)) return;
    const { id: categoryId } = await resCategoria.json();

    const resItem = await fetch("/api/menu", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: item,
        price: Number(preco.replace(",", ".")),
        categoryId,
        available: true,
      }),
    });
    if (await falhou(resItem)) return;

    window.location.href = "/adm";
  }

  async function deixarParaDepois() {
    // Grava a dispensa antes de sair, senão o painel devolve a pessoa para cá
    // no próximo carregamento e o botão vira um loop.
    await fetch("/api/settings/onboarding", { method: "POST" }).catch(() => {});
    window.location.href = "/adm";
  }

  const campo =
    "w-full rounded-xl border border-neutral-200 bg-white px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand";
  const rotulo = "block text-sm font-medium text-neutral-700 mb-1.5";

  return (
    <div className="mx-auto w-full max-w-lg">
      <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-forest/60">
        Passo {passo} de 2
      </p>
      <h1 className="display mt-2 text-2xl leading-tight text-forest-dark">
        {passo === 1
          ? "Vamos deixar sua casa pronta."
          : "Agora o primeiro item do cardápio."}
      </h1>
      <p className="mt-2 text-sm leading-relaxed text-neutral-600">
        {passo === 1
          ? "O endereço aparece para os seus clientes no cardápio. Leva um minuto."
          : "Com um item cadastrado sua loja já vende. Depois você adiciona o resto no painel."}
      </p>

      {passo === 1 ? (
        <form onSubmit={salvarIdentidade} className="mt-7 space-y-4">
          <div>
            <label htmlFor="onb-endereco" className={rotulo}>
              Endereço
            </label>
            <input
              id="onb-endereco"
              value={endereco}
              onChange={(e) => setEndereco(e.target.value)}
              required
              placeholder="Rua, número, cidade"
              className={campo}
            />
          </div>
          <div>
            <label htmlFor="onb-telefone" className={rotulo}>
              Telefone
            </label>
            <input
              id="onb-telefone"
              value={telefone}
              onChange={(e) => setTelefone(e.target.value)}
              placeholder="(XX) 99999-0000"
              className={campo}
            />
          </div>

          {erro && <p className="text-sm text-red-600">{erro}</p>}

          <button
            type="submit"
            disabled={salvando}
            className="w-full rounded-xl bg-brand py-3 text-sm font-semibold text-white transition hover:bg-brand-dark disabled:opacity-60"
          >
            {salvando ? "Salvando..." : "Salvar e continuar"}
          </button>
        </form>
      ) : (
        <form onSubmit={salvarItem} className="mt-7 space-y-4">
          <div>
            <label htmlFor="onb-categoria" className={rotulo}>
              Categoria
            </label>
            <input
              id="onb-categoria"
              value={categoria}
              onChange={(e) => setCategoria(e.target.value)}
              required
              placeholder="Lanches, Pizzas, Bebidas"
              className={campo}
            />
          </div>
          <div>
            <label htmlFor="onb-item" className={rotulo}>
              Nome do item
            </label>
            <input
              id="onb-item"
              value={item}
              onChange={(e) => setItem(e.target.value)}
              required
              placeholder="X-Salada"
              className={campo}
            />
          </div>
          <div>
            <label htmlFor="onb-preco" className={rotulo}>
              Preço
            </label>
            <input
              id="onb-preco"
              value={preco}
              onChange={(e) => setPreco(e.target.value)}
              required
              inputMode="decimal"
              placeholder="25,00"
              className={campo}
            />
          </div>

          {erro && <p className="text-sm text-red-600">{erro}</p>}

          <button
            type="submit"
            disabled={salvando}
            className="w-full rounded-xl bg-brand py-3 text-sm font-semibold text-white transition hover:bg-brand-dark disabled:opacity-60"
          >
            {salvando ? "Salvando..." : "Salvar item"}
          </button>
        </form>
      )}

      <button
        type="button"
        onClick={deixarParaDepois}
        className="mt-6 w-full text-sm font-medium text-neutral-500 transition hover:text-neutral-700"
      >
        Deixar para depois
      </button>
    </div>
  );
}
