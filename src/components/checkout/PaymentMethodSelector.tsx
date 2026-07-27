"use client";

import { PaymentMethod } from "@/types";

const OPTIONS: { value: PaymentMethod; label: string; description: string; icon: string }[] = [
  {
    value: "PIX",
    label: "Pix",
    description: "QR Code gerado na hora. Aprovação imediata.",
    icon: "⚡",
  },
  {
    value: "CREDIT_CARD",
    label: "Cartão de Crédito",
    description: "Redirecionado para o checkout seguro.",
    icon: "💳",
  },
  {
    value: "CASH",
    label: "Dinheiro",
    description: "Pagamento na entrega ou retirada.",
    icon: "💵",
  },
];

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

  return (
    <div className="space-y-2">
      {enabled !== null && !enabled.includes("PIX") && !enabled.includes("CREDIT_CARD") && (
        <p className="text-xs text-neutral-500 bg-neutral-50 border border-neutral-200 rounded-lg px-3 py-2">
          Este restaurante está aceitando apenas pagamento na entrega no momento.
        </p>
      )}

      {options.map((option) => (
        <label
          key={option.value}
          className={`flex items-start gap-3 p-3 rounded-lg border-2 cursor-pointer transition ${
            value === option.value
              ? "border-red-400 bg-brand-light"
              : "border-neutral-200 hover:border-neutral-300"
          }`}
        >
          <input
            type="radio"
            name="paymentMethod"
            value={option.value}
            checked={value === option.value}
            onChange={() => onChange(option.value)}
            className="mt-0.5 accent-red-500"
          />
          <div>
            <div className="flex items-center gap-2">
              <span>{option.icon}</span>
              <span className="text-sm font-medium text-neutral-900">{option.label}</span>
            </div>
            <p className="text-xs text-neutral-500 mt-0.5">{option.description}</p>
          </div>
        </label>
      ))}
    </div>
  );
}
