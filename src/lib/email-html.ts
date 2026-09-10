/**
 * Escapa as cinco entidades HTML. Usado para qualquer texto livre gravado
 * pelo tenant (nome do restaurante, nome do cliente, endereço, telefone) antes
 * de interpolar dentro de um template de e-mail. Sem isto, um restaurante
 * chamado `Bar do "Zé" <Centro>` quebra a marcação do e-mail, e um nome
 * deliberadamente malformado injeta HTML numa mensagem que sai com o
 * remetente da Muno.
 */
export function escapeHtml(valor: string): string {
  return valor
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/**
 * `subject` de e-mail não é HTML — escapar entidades ali não protege nada. O
 * risco em campo de cabeçalho é outro: uma quebra de linha no valor
 * interpolado permite injetar um cabeçalho novo (ex.: um segundo `Bcc:`).
 * Remover `\r` e `\n` fecha essa porta sem mexer no resto do texto.
 */
export function paraAssunto(valor: string): string {
  return valor.replace(/[\r\n]+/g, " ");
}
