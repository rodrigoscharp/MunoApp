"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Check } from "lucide-react";
import { sugerirSlug } from "@/lib/inscricao/sugerir-slug";
import { botaoBrasa, campo, cartaoPainel, kicker } from "@/components/painel/estilos";
import { cn } from "@/lib/utils";

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
  const router = useRouter();

  // Navegação do router, e não window.location: o refresh relê o servidor (o
  // /adm decide de novo se o onboarding ainda vale) sem recarregar o app
  // inteiro. Nada aqui depende de recarga: a dispensa e o que foi salvo já
  // estão no banco quando a navegação sai.
  function irParaOPainel() {
    router.replace("/adm");
    router.refresh();
  }

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
      irParaOPainel();
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

    irParaOPainel();
  }

  async function deixarParaDepois() {
    // Grava a dispensa antes de sair, senão o painel devolve a pessoa para cá
    // no próximo carregamento e o botão vira um loop.
    await fetch("/api/settings/onboarding", { method: "POST" }).catch(() => {});
    irParaOPainel();
  }

  const rotulo = "mb-1.5 block text-[13px] font-bold text-loja-tinta";
  const etapas = [
    { numero: 1, titulo: "Endereço e telefone", feita: passo === 2 },
    { numero: 2, titulo: "Primeiro item do cardápio", feita: false },
  ];

  return (
    <div className="mx-auto flex w-full max-w-xl flex-col gap-5">
      <header className="flex flex-col gap-1.5">
        <span className={cn(kicker, "text-loja-preco")}>Passo {passo} de 2</span>
        <h1 className="manchete text-[2.2rem] leading-[0.95] text-forest-dark sm:text-[2.6rem]">
          {passo === 1
            ? "Vamos deixar sua casa pronta."
            : "Agora o primeiro item do cardápio."}
        </h1>
        <p className="mt-1 text-[14px] leading-relaxed text-loja-tinta-2">
          {passo === 1
            ? "O endereço aparece para os seus clientes no cardápio. Leva um minuto."
            : "Com um item cadastrado sua loja já vende. Depois você adiciona o resto no painel."}
        </p>
      </header>

      <ol className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        {etapas.map((etapa) => {
          const atual = etapa.numero === passo;
          return (
            <li
              key={etapa.numero}
              aria-current={atual ? "step" : undefined}
              className={cn(
                "flex min-h-14 items-center gap-3 rounded-[18px] px-4 py-2.5",
                atual ? "bg-loja-papel shadow-loja" : "bg-loja-papel/60"
              )}
            >
              <span
                className={cn(
                  "flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-[13px] font-extrabold",
                  etapa.feita
                    ? "bg-forest-dark text-white"
                    : atual
                      ? "bg-loja-brasa text-white"
                      : "bg-[#EFE4D7] text-loja-tinta"
                )}
              >
                {etapa.feita ? <Check size={15} strokeWidth={3} aria-hidden /> : etapa.numero}
              </span>
              <span className="flex min-w-0 flex-col">
                <span className={cn("text-[13.5px] font-bold", atual ? "text-loja-tinta" : "text-loja-tinta-2")}>
                  {etapa.titulo}
                </span>
                {etapa.feita && <span className="text-[12px] text-forest">Concluído</span>}
              </span>
            </li>
          );
        })}
      </ol>

      <div className={cn(cartaoPainel, "p-5 sm:p-6")}>
        {passo === 1 ? (
          <form onSubmit={salvarIdentidade} className="flex flex-col gap-4">
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

            {erro && <p role="alert" className="text-[13px] font-semibold text-[#A3271A]">{erro}</p>}

            <button
              type="submit"
              disabled={salvando}
              className={cn(botaoBrasa, "h-12 w-full text-[14px]")}
            >
              {salvando ? "Salvando..." : "Salvar e continuar"}
            </button>
          </form>
        ) : (
          <form onSubmit={salvarItem} className="flex flex-col gap-4">
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
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-[1fr_9rem]">
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
            </div>

            {erro && <p role="alert" className="text-[13px] font-semibold text-[#A3271A]">{erro}</p>}

            <button
              type="submit"
              disabled={salvando}
              className={cn(botaoBrasa, "h-12 w-full text-[14px]")}
            >
              {salvando ? "Salvando..." : "Salvar item"}
            </button>
          </form>
        )}
      </div>

      <button
        type="button"
        onClick={deixarParaDepois}
        className="mx-auto h-11 rounded-full px-5 text-[14px] font-bold text-loja-tinta-2 transition hover:bg-loja-papel hover:text-loja-tinta"
      >
        Deixar para depois
      </button>
    </div>
  );
}
