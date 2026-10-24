/**
 * Traduz a resposta de erro de POST /api/orders para o que o cliente lê.
 *
 * Os dois checkouts (delivery e mesa) mostravam `JSON.stringify(error)`: num
 * 400 de validação, o cliente via o array de issues do zod, em inglês, com
 * chaves e colchetes. Agora issue de campo que o formulário mostra vira erro
 * ao lado do campo, com texto nosso (a mensagem do zod do servidor é default
 * em inglês); o resto vira uma frase geral.
 *
 * `indisponiveis` é o contrato do 422 de item fora do ar: ids de menuItem,
 * para o checkout tirar do carrinho e dizer quais foram.
 */

export type CampoDoPedido = "customerName" | "customerPhone" | "notes" | "rua" | "zonaId";

export interface ErroDoPedido {
  mensagem: string;
  campos: Partial<Record<CampoDoPedido, string>>;
  indisponiveis: string[];
}

const GENERICA = "Não conseguimos enviar o pedido. Confira os dados e tente de novo.";

// Campo do corpo da API → campo do formulário, e o que dizer nele.
const CAMPOS: Record<string, [CampoDoPedido, string]> = {
  customerName: ["customerName", "Confira o nome."],
  customerPhone: ["customerPhone", "Confira o telefone."],
  notes: ["notes", "As observações estão longas demais."],
  deliveryAddress: ["rua", "Confira o endereço."],
  deliveryZoneId: ["zonaId", "Selecione o bairro de novo."],
};

export function lerErroDoPedido(corpo: unknown): ErroDoPedido {
  const obj = corpo && typeof corpo === "object" ? (corpo as Record<string, unknown>) : {};

  const indisponiveis = Array.isArray(obj.indisponiveis)
    ? obj.indisponiveis.filter((id): id is string => typeof id === "string")
    : [];

  if (typeof obj.error === "string" && obj.error.trim()) {
    return { mensagem: obj.error, campos: {}, indisponiveis };
  }

  const campos: ErroDoPedido["campos"] = {};
  if (Array.isArray(obj.error)) {
    for (const issue of obj.error) {
      const chave = (issue as { path?: unknown[] } | null)?.path?.[0];
      const alvo = typeof chave === "string" ? CAMPOS[chave] : undefined;
      if (alvo) campos[alvo[0]] = alvo[1];
    }
  }

  return {
    mensagem: Object.keys(campos).length > 0 ? "Confira os campos destacados." : GENERICA,
    campos,
    indisponiveis,
  };
}

/** A frase que diz ao cliente quais itens saíram do carrinho. */
export function avisoDeIndisponiveis(nomes: string[]): string {
  if (nomes.length === 0) return "";
  const lista =
    nomes.length === 1 ? nomes[0] : `${nomes.slice(0, -1).join(", ")} e ${nomes[nomes.length - 1]}`;
  return nomes.length === 1
    ? `${lista} não está mais disponível e saiu do seu carrinho. Confira o pedido e confirme de novo.`
    : `${lista} não estão mais disponíveis e saíram do seu carrinho. Confira o pedido e confirme de novo.`;
}
