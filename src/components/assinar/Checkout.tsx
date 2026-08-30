"use client";

import { useState } from "react";
import type { PlanoTenant } from "@prisma/client";
import type { Ciclo } from "@/lib/plans";
import { ResumoPlano } from "./ResumoPlano";
import { ReforcoPlano } from "./ReforcoPlano";
import { FormularioAssinatura } from "./FormularioAssinatura";

/**
 * A tela de pré-pagamento: resumo de um lado, formulário do outro.
 *
 * **Por que o ciclo é estado de cliente, e não a query string.** A page
 * continua resolvendo plano e ciclo pela URL (escolhaDaQueryString, com o
 * fail-closed e o teste dele), e passa o resultado para cá como valor inicial.
 * Daqui em diante quem manda é este estado.
 *
 * A alternativa óbvia — o toggle navegar para `?ciclo=ANUAL` — desmontaria o
 * FormularioAssinatura e apagaria nome, endereço, e-mail e CPF já digitados,
 * no passo em que a pessoa está a um clique de pagar. Quem clicou no plano
 * errado na landing desistiria em vez de preencher tudo de novo, que é
 * exatamente o abandono que o toggle existe para evitar.
 *
 * A URL ainda acompanha, por replaceState: refresh e link compartilhado
 * contam a verdade, sem que o Next remonte a árvore.
 */
export function Checkout({
  planoInicial,
  cicloInicial,
}: {
  planoInicial: PlanoTenant;
  cicloInicial: Ciclo;
}) {
  const [ciclo, setCiclo] = useState<Ciclo>(cicloInicial);

  function trocarCiclo(novo: Ciclo) {
    setCiclo(novo);
    // history nativo, e não router.replace: o do Next revalida a rota e
    // remonta a árvore — o mesmo estrago da navegação, por outro caminho.
    window.history.replaceState(
      null,
      "",
      `/assinar?plano=${planoInicial}&ciclo=${novo}`
    );
  }

  return (
    // Três blocos, duas ordens. No celular (uma coluna) vale o `order`:
    // resumo, formulário, reforço — assim o primeiro campo fica acima da
    // dobra, em vez de atrás de seis bullets. No desktop a coluna da esquerda
    // reúne resumo e reforço, e o formulário ocupa a direita nas duas linhas.
    // É a mesma marcação nas duas larguras, sem duplicar nada.
    <div className="grid w-full max-w-4xl gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.05fr)] lg:items-start lg:gap-x-8 lg:gap-y-5">
      <div className="order-1 lg:col-start-1 lg:row-start-1">
        <ResumoPlano
          plano={planoInicial}
          ciclo={ciclo}
          onCicloChange={trocarCiclo}
        />
      </div>

      {/* O título mora aqui, e não dentro do FormularioAssinatura: ele é
          equilíbrio de layout entre as duas colunas, não parte do formulário —
          que continua sendo só os campos e a regra deles. */}
      <div className="order-2 lg:col-start-2 lg:row-start-1 lg:row-span-2">
        <p className="mb-3 text-[11px] font-semibold uppercase tracking-[0.14em] text-forest/60">
          Seus dados
        </p>
        <FormularioAssinatura plano={planoInicial} ciclo={ciclo} />
      </div>

      <div className="order-3 lg:col-start-1 lg:row-start-2">
        <ReforcoPlano plano={planoInicial} />
      </div>
    </div>
  );
}
