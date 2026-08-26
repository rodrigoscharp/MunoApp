// Alguns gateways (Asaas, por exemplo) exigem o CPF ou CNPJ do pagador para
// emitir a cobrança. O documento é validado no cliente e no servidor, mas NÃO é
// persistido: viaja do checkout direto pra rota de cobrança e de lá pro
// gateway. Guardar CPF/CNPJ de cliente final é responsabilidade de LGPD que a
// Muno não precisa assumir.

export function stripDocumento(value: string): string {
  return value.replace(/\D/g, "");
}

// stripCpf delega para stripDocumento: a lógica é a mesma (remover não-dígitos)
// e manter dois nomes evita quebra de contrato com código que usa stripCpf
// especificamente.
export function stripCpf(value: string): string {
  return stripDocumento(value);
}

export function formatCpf(value: string): string {
  const digits = stripCpf(value).slice(0, 11);

  if (digits.length <= 3) return digits;
  if (digits.length <= 6) return `${digits.slice(0, 3)}.${digits.slice(3)}`;
  if (digits.length <= 9) return `${digits.slice(0, 3)}.${digits.slice(3, 6)}.${digits.slice(6)}`;
  return `${digits.slice(0, 3)}.${digits.slice(3, 6)}.${digits.slice(6, 9)}-${digits.slice(9)}`;
}

export function isValidCpf(value: string): boolean {
  const cpf = stripCpf(value);
  if (cpf.length !== 11) return false;

  // 111.111.111-11 e afins passam no cálculo dos dígitos verificadores,
  // então precisam ser recusados explicitamente.
  if (/^(\d)\1{10}$/.test(cpf)) return false;

  const checkDigit = (length: number): number => {
    let sum = 0;
    for (let i = 0; i < length; i++) {
      sum += Number(cpf[i]) * (length + 1 - i);
    }
    const remainder = (sum * 10) % 11;
    return remainder === 10 ? 0 : remainder;
  };

  return checkDigit(9) === Number(cpf[9]) && checkDigit(10) === Number(cpf[10]);
}

export function isValidCnpj(value: string): boolean {
  const cnpj = stripDocumento(value);
  if (cnpj.length !== 14) return false;
  if (/^(\d)\1{13}$/.test(cnpj)) return false;

  const digito = (base: string): number => {
    // Os pesos do CNPJ vão de 2 a 9 e recomeçam — não é uma contagem simples
    // como a do CPF.
    let peso = base.length - 7;
    let soma = 0;
    for (let i = 0; i < base.length; i++) {
      soma += Number(base[i]) * peso--;
      if (peso < 2) peso = 9;
    }
    const resto = soma % 11;
    return resto < 2 ? 0 : 11 - resto;
  };

  const d1 = digito(cnpj.slice(0, 12));
  const d2 = digito(cnpj.slice(0, 13));
  return d1 === Number(cnpj[12]) && d2 === Number(cnpj[13]);
}

/** Aceita os dois, decidindo pela contagem de dígitos. */
export function isValidCpfCnpj(value: string): boolean {
  const digitos = stripDocumento(value);
  if (digitos.length === 11) return isValidCpf(value);
  if (digitos.length === 14) return isValidCnpj(value);
  return false;
}
