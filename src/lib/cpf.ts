// Alguns gateways (Asaas, por exemplo) exigem o CPF do pagador para emitir
// a cobrança. O CPF é validado no cliente e no servidor, mas NÃO é
// persistido: viaja do checkout direto pra rota de cobrança e de lá pro
// gateway. Guardar CPF de cliente final é responsabilidade de LGPD que a
// Muno não precisa assumir.

export function stripCpf(value: string): string {
  return value.replace(/\D/g, "");
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
