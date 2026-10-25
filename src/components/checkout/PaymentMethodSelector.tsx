"use client";

import { PaymentMethod } from "@/types";

/** Os ícones em traço, no mesmo desenho do mockup da sacola. */
const ICONES: Record<PaymentMethod, React.ReactNode> = {
  PIX: (
    <>
      <path d="M12 3l9 9-9 9-9-9z" />
      <path d="M8.5 12h7" />
    </>
  ),
  CREDIT_CARD: (
    <>
      <rect x="3" y="5.5" width="18" height="13" rx="2.5" />
      <path d="M3 10h18" />
    </>
  ),
  CASH: (
    <>
      <rect x="2.5" y="6" width="19" height="12" rx="2" />
      <circle cx="12" cy="12" r="2.6" />
    </>
  ),
};

const OPTIONS: { value: PaymentMethod; label: string; description: string }[] = [
  {
    value: "PIX",
    label: "Pix",
    description: "QR Code gerado na hora. Aprovação imediata.",
  },
  {
    value: "CREDIT_CARD",
    label: "Cartão de Crédito",
    description: "Redirecionado para o checkout seguro.",
  },
  {
    value: "CASH",
    label: "Dinheiro",
    description: "Pagamento na entrega ou retirada.",
  },
];

const COLUNAS: Record<number, string> = { 1: "grid-cols-1", 2: "grid-cols-2", 3: "grid-cols-3" };

interface Props {
  value: PaymentMethod;
  onChange: (method: PaymentMethod) => void;
  // Métodos que este restaurante aceita, vindos de /api/payments/methods.
  // null enquanto carrega: não mostramos opção nenhuma de pagamento online
  // antes de saber, porque uma opção que aparece e some é pior que uma que
  // demora a aparecer.
  enabled: PaymentMethod[] | null;
}

export function PaymentMethodSelector({ value, onChange, enabled }: Props) {
  const available = enabled ?? ["CASH"];
  const options = OPTIONS.filter((option) => available.includes(option.value));
  const escolhida = options.find((option) => option.value === value);

  return (
    <div className="space-y-2">
      {enabled !== null && !enabled.includes("PIX") && !enabled.includes("CREDIT_CARD") && (
        <p className="rounded-2xl bg-loja-folha px-3.5 py-2.5 text-[12.5px] font-medium text-forest-dark">
          Este restaurante está aceitando apenas pagamento na entrega no momento.
        </p>
      )}

      {options.length > 0 && (
        <div
          role="radiogroup"
          aria-label="Forma de pagamento"
          className={`grid gap-2 ${COLUNAS[options.length] ?? "grid-cols-3"}`}
        >
          {options.map((option) => {
            const marcada = value === option.value;
            return (
              // O rádio fica escondido e o bloco inteiro é o rótulo: o clique,
              // o teclado (setas no grupo) e o leitor de tela continuam sendo
              // os de um input radio de verdade.
              <label
                key={option.value}
                className={`relative flex min-h-[64px] cursor-pointer flex-col items-center justify-center gap-1 rounded-2xl bg-loja-papel px-2 py-2 text-center text-[12px] leading-tight transition has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-brand/40 ${
                  marcada
                    ? "border-2 border-brand font-extrabold text-loja-preco"
                    : "border-2 border-transparent font-semibold text-loja-tinta-2 shadow-loja hover:border-loja-linha"
                }`}
              >
                <input
                  type="radio"
                  name="paymentMethod"
                  value={option.value}
                  checked={marcada}
                  onChange={() => onChange(option.value)}
                  className="sr-only"
                />
                <svg
                  width="20"
                  height="20"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth={marcada ? 2 : 1.8}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden="true"
                  className={marcada ? "text-brand" : "text-loja-tinta-2"}
                >
                  {ICONES[option.value]}
                </svg>
                {option.label}
              </label>
            );
          })}
        </div>
      )}

      {/* A descrição de cada forma não cabe no bloco; a da escolhida aparece
          embaixo, onde o cliente olha logo depois de tocar. */}
      {escolhida && (
        <p className="px-1 text-[12px] text-loja-tinta-2">{escolhida.description}</p>
      )}
    </div>
  );
}
