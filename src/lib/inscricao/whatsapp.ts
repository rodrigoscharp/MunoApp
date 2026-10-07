/**
 * WhatsApp do checkout: o único canal para recuperar quem chega à página de
 * pagamento do Asaas e não paga. O primeiro checkout de produção parou
 * exatamente ali, e sem telefone a única saída era o e-mail.
 *
 * Mais estrito que `telefoneValido` (src/lib/lead-landing.ts) de propósito:
 * aqui o número vira `mobilePhone` no cliente do Asaas, que é para onde ele
 * manda os lembretes de cobrança por WhatsApp e SMS. Fixo não recebe nenhum
 * dos dois, então só celular (DDD + 9 + oito dígitos) passa.
 */
export function normalizarWhatsapp(bruto: string): string | null {
  let digitos = bruto.replace(/\D/g, "");
  // Quem cola o número do próprio WhatsApp costuma trazer o +55 junto.
  if (digitos.length === 13 && digitos.startsWith("55")) {
    digitos = digitos.slice(2);
  }
  if (!/^[1-9][1-9]9\d{8}$/.test(digitos)) return null;
  return digitos;
}

export function mascararWhatsapp(valor: string): string {
  const d = valor.replace(/\D/g, "").slice(0, 11);
  if (d.length <= 2) return d.length ? `(${d}` : "";
  if (d.length <= 7) return `(${d.slice(0, 2)}) ${d.slice(2)}`;
  return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
}
