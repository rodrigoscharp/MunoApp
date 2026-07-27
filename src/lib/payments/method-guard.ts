import type { PaymentMethod } from "@prisma/client";

// Fica fora de factory.ts pra poder ser importado pela rota de pedidos sem
// arrastar o Prisma junto — e pra ser testável sem mock nenhum.
export class PaymentMethodNotAllowedError extends Error {
  constructor(method: string) {
    super(`Este restaurante não aceita ${method} no momento.`);
    this.name = "PaymentMethodNotAllowedError";
  }
}

// Validação de servidor, não redundância com a UI: /api/orders é endpoint
// público, e a tela escondendo o botão não impede ninguém de chamar direto.
export function assertMethodAllowed(method: PaymentMethod, enabled: PaymentMethod[]): void {
  if (!enabled.includes(method)) throw new PaymentMethodNotAllowedError(method);
}
