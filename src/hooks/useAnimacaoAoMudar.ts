"use client";

import { useState } from "react";

/**
 * Uma chave que troca de valor toda vez que `valor` muda — para reiniciar uma
 * animação CSS remontando o elemento (`key={chave}`).
 *
 * Substitui o par `useState` + `useEffect` + `setTimeout` que quatro
 * componentes repetiam para o mesmo efeito (o badge do carrinho, o sino, o
 * pulo do status do pedido). Aquele arranjo tinha três problemas: chamava
 * `setState` dentro do corpo de um efeito — o que dispara uma renderização em
 * cascata e é erro de lint no React 19 (`react-hooks/set-state-in-effect`) —,
 * duplicava a duração da animação em JavaScript (`400`, `700`, `800`) onde o
 * CSS já a define, e deixava um timer pendurado por componente.
 *
 * Ajustar estado durante a renderização, quando um valor observado muda, é o
 * padrão que o próprio React documenta para este caso. Não é efeito colateral:
 * o React descarta o render em andamento e refaz antes de pintar a tela.
 *
 * `apenasAoCrescer` existe porque o badge do carrinho deve pular quando um item
 * entra, e não quando o cliente remove um.
 */
export function useAnimacaoAoMudar(
  valor: number | string,
  opcoes?: { apenasAoCrescer?: boolean }
): number {
  const [anterior, setAnterior] = useState(valor);
  const [chave, setChave] = useState(0);

  if (valor !== anterior) {
    const cresceu =
      typeof valor === "number" && typeof anterior === "number"
        ? valor > anterior
        : true;
    setAnterior(valor);
    if (!opcoes?.apenasAoCrescer || cresceu) setChave((k) => k + 1);
  }

  return chave;
}
