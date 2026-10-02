/**
 * O que o restaurante declarou sobre um prato, e o filtro que o cliente usa.
 *
 * Os três campos são booleanos ANULÁVEIS, e `null` (ou ausente) quer dizer "o
 * restaurante não informou". Isso não é detalhe de modelagem: um `false` por
 * padrão faria todo item cadastrado antes deste filtro aparecer como "sem
 * lactose" e "sem glúten" sem que ninguém tivesse verificado nada, e para quem
 * tem intolerância esse é o pior erro possível. Por isso a regra de cada
 * filtro olha a declaração EXPLÍCITA, e nenhuma função aqui transforma
 * ausência em `false`.
 */

export type RestricaoDeCardapio = "vegano" | "sem-gluten" | "sem-lactose";

export interface DeclaracaoAlimentar {
  containsGluten?: boolean | null;
  containsLactose?: boolean | null;
  isVegan?: boolean | null;
}

/** A ordem daqui é a ordem dos botões no cardápio. */
export const RESTRICOES: readonly { id: RestricaoDeCardapio; label: string; emoji: string }[] = [
  { id: "vegano", label: "Vegano", emoji: "🌱" },
  { id: "sem-gluten", label: "Sem glúten", emoji: "🌾" },
  { id: "sem-lactose", label: "Sem lactose", emoji: "🥛" },
];

/**
 * O item atende à restrição? Só com declaração explícita.
 *
 * Vegano não implica "sem lactose": derivar seria adivinhar, que é justamente o
 * que este filtro existe para não fazer. Se o dono quer o item no filtro de
 * lactose, ele marca.
 */
export function atende(item: DeclaracaoAlimentar, restricao: RestricaoDeCardapio): boolean {
  switch (restricao) {
    case "vegano":
      return item.isVegan === true;
    case "sem-gluten":
      return item.containsGluten === false;
    case "sem-lactose":
      return item.containsLactose === false;
  }
}

/**
 * Os itens que atendem a TODAS as restrições ativas (E, não OU). Sem restrição
 * ativa devolve a lista inteira: quem decide não mostrar nada nesse caso é a
 * tela, e não esta função.
 */
export function filtrarPorRestricoes<T extends DeclaracaoAlimentar>(
  itens: readonly T[],
  ativas: readonly RestricaoDeCardapio[]
): T[] {
  return itens.filter((item) => ativas.every((restricao) => atende(item, restricao)));
}

/**
 * Quais botões fazem sentido neste cardápio: os que pelo menos um item atende
 * sozinho. Um botão que sempre devolve zero itens é pior do que botão nenhum.
 */
export function restricoesDisponiveis<T extends DeclaracaoAlimentar>(
  itens: readonly T[]
): RestricaoDeCardapio[] {
  return RESTRICOES.map((r) => r.id).filter((id) => itens.some((item) => atende(item, id)));
}

/** Como o formulário do admin guarda uma resposta: Sim, Não, ou Não informado. */
export type TriEstado = "sim" | "nao" | "nd";

/**
 * Do formulário para o servidor. Tudo que não for exatamente "sim" ou "nao"
 * vira `null`: o ponto onde "não informado" viraria `false` sem ninguém notar é
 * este, então o caso de dúvida cai para o lado seguro.
 */
export function triParaBoolean(valor: TriEstado): boolean | null {
  if (valor === "sim") return true;
  if (valor === "nao") return false;
  return null;
}

/** Do servidor para o formulário. Item antigo (campo ausente) abre em "nd". */
export function booleanParaTri(valor: boolean | null | undefined): TriEstado {
  if (valor === true) return "sim";
  if (valor === false) return "nao";
  return "nd";
}
