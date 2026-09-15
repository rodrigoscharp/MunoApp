/**
 * Quem pode chamar cada handler de API.
 *
 * src/security/matriz-de-acesso.test.ts lê este arquivo nas duas direções:
 * handler sem entrada quebra o teste, entrada sem handler também. Rota nova
 * não entra no ar sem alguém decidir, por escrito, quem pode chamá-la.
 *
 * A chave é "MÉTODO /api/caminho", com o caminho escrito como a pasta
 * (`/api/coupons/[id]`).
 */

export type Papel = "CUSTOMER" | "ADMIN" | "KITCHEN" | "MOTOBOY";

export type Nivel =
  /** Qualquer um. O motivo é obrigatório: é quem abre a rota dizendo por quê. */
  | { tipo: "PUBLICO"; motivo: string }
  /**
   * O acesso depende de quem é o dono do registro, então a rota precisa lê-lo
   * antes de decidir e não cabe na regra de "nenhum acesso ao banco". A matriz
   * não a exercita; o motivo aponta quem cobre.
   */
  | { tipo: "DONO_DO_RECURSO"; motivo: string }
  /** Autentica por segredo compartilhado, não por sessão. */
  | { tipo: "SEGREDO"; motivo: string }
  /**
   * Lista explícita de quem entra, sem hierarquia. As rotas divergem (cozinha
   * aceita ADMIN e KITCHEN, upload aceita ADMIN e plataforma), e uma hierarquia
   * implícita esconderia justamente a divergência.
   */
  | { tipo: "AUTENTICADO"; aceita: Array<Papel | "PLATAFORMA"> };

const publico = (motivo: string): Nivel => ({ tipo: "PUBLICO", motivo });
const donoDoRecurso = (motivo: string): Nivel => ({ tipo: "DONO_DO_RECURSO", motivo });
const segredo = (motivo: string): Nivel => ({ tipo: "SEGREDO", motivo });
const autenticado = (...aceita: Array<Papel | "PLATAFORMA">): Nivel => ({
  tipo: "AUTENTICADO",
  aceita,
});

// ADMIN primeiro: a matriz usa o primeiro aceito no controle positivo.
const QUALQUER_CONTA_DO_RESTAURANTE: Papel[] = ["ADMIN", "CUSTOMER", "KITCHEN", "MOTOBOY"];

export const POLITICA: Record<string, Nivel> = {
  "POST /api/ai/menu-recommendation": publico(
    "sugestão do cardápio para quem está navegando, sem conta; limitada por IP"
  ),
  "GET /api/analytics": autenticado("ADMIN"),

  "POST /api/assinar": publico("checkout de restaurante novo, que ainda não tem conta; limitado por IP"),
  "POST /api/assinar/reconciliar": publico(
    "volta do gateway na tela de obrigado, antes de existir conta; limitada por IP"
  ),
  "GET /api/assinar/slug": publico(
    "o checkout confere se o endereço está livre antes de existir conta; limitada por IP"
  ),
  "POST /api/assinaturas/webhook/asaas": segredo(
    "asaas-access-token comparado com ASAAS_WEBHOOK_TOKEN em tempo constante"
  ),

  "POST /api/auth/forgot-password": publico(
    "quem esqueceu a senha não tem sessão; limitada por IP e responde igual para e-mail inexistente"
  ),
  "POST /api/auth/register": publico("cadastro de cliente do restaurante; limitado por tenant e IP"),
  "POST /api/auth/reset-password": publico(
    "autentica pelo token enviado por e-mail, não por sessão; limitada por IP"
  ),

  "GET /api/categories": publico("categorias do cardápio público"),
  "POST /api/categories": autenticado("ADMIN"),
  "GET /api/chat/unread": autenticado(...QUALQUER_CONTA_DO_RESTAURANTE),

  "GET /api/coupons": autenticado("ADMIN"),
  "POST /api/coupons": autenticado("ADMIN"),
  "PATCH /api/coupons/[id]": autenticado("ADMIN"),
  "DELETE /api/coupons/[id]": autenticado("ADMIN"),
  "POST /api/coupons/validate": autenticado(...QUALQUER_CONTA_DO_RESTAURANTE),

  "GET /api/cron/assinaturas": segredo("Authorization: Bearer CRON_SECRET, enviado pelo cron da Vercel"),
  "POST /api/cron/assinaturas": segredo("Authorization: Bearer CRON_SECRET, o mesmo job disparado à mão"),

  "GET /api/delivery-zones": publico("zonas e taxas de entrega mostradas no checkout"),
  "POST /api/delivery-zones": autenticado("ADMIN"),
  "PATCH /api/delivery-zones/[id]": autenticado("ADMIN"),
  "DELETE /api/delivery-zones/[id]": autenticado("ADMIN"),

  "POST /api/funil/evento": publico("evento anônimo da landing; exige origem permitida e limita por IP"),
  "OPTIONS /api/leads/publico": publico("preflight de CORS da landing; libera só origem permitida"),
  "POST /api/leads/publico": publico("captação de lead da landing; exige origem permitida e limita por IP"),

  "GET /api/menu": publico("cardápio público do restaurante"),
  "POST /api/menu": autenticado("ADMIN"),
  "GET /api/menu/[id]": publico("item do cardápio público"),
  "PUT /api/menu/[id]": autenticado("ADMIN"),
  "DELETE /api/menu/[id]": autenticado("ADMIN"),

  "GET /api/motoboy/orders": autenticado("MOTOBOY", "ADMIN"),
  "POST /api/motoboy/orders/[orderId]/accept": autenticado("MOTOBOY", "ADMIN"),
  "POST /api/motoboy/orders/[orderId]/complete": autenticado("MOTOBOY", "ADMIN"),
  "POST /api/motoboy/orders/[orderId]/location": autenticado("MOTOBOY", "ADMIN"),
  "GET /api/motoboy/orders/[orderId]/location": donoDoRecurso(
    "rastreio decidido por canViewOrder depois de ler o pedido; ver o route.test.ts ao lado"
  ),

  "GET /api/orders": autenticado(...QUALQUER_CONTA_DO_RESTAURANTE),
  "POST /api/orders": publico(
    "pedido de mesa não exige conta e delivery exige; a divisão é coberta em src/app/api/orders/route.test.ts"
  ),
  "GET /api/orders/[id]": donoDoRecurso(
    "acompanhamento decidido por canViewOrder depois de ler o pedido; ver src/lib/order-access.test.ts"
  ),
  "PATCH /api/orders/[id]": autenticado("ADMIN", "KITCHEN"),
  "GET /api/orders/[id]/chat": donoDoRecurso(
    "só o dono do pedido ou ADMIN, decidido depois de ler o pedido; ver o route.test.ts ao lado"
  ),
  "POST /api/orders/[id]/chat": donoDoRecurso(
    "só o dono do pedido ou ADMIN, decidido depois de ler o pedido; ver o route.test.ts ao lado"
  ),

  "POST /api/payments/charge": donoDoRecurso(
    "quem não pode ver o pedido não pode cobrá-lo; canViewOrder depois de ler o pedido"
  ),
  "GET /api/payments/connections": autenticado("ADMIN"),
  "POST /api/payments/connections": autenticado("ADMIN"),
  "DELETE /api/payments/connections": autenticado("ADMIN"),
  "GET /api/payments/methods": publico(
    "o checkout consulta os métodos antes de pagar; devolve só métodos e se exige CPF"
  ),
  "GET /api/payments/webhook/[provider]/[tenantId]": publico(
    "o gateway valida a URL de notificação com GET; responde ok sem ler nada"
  ),
  "POST /api/payments/webhook/[provider]/[tenantId]": publico(
    "autentica pela assinatura do gateway dentro do adapter e responde igual quando não há conexão"
  ),

  "PATCH /api/platform/clientes/[id]": autenticado("PLATAFORMA"),
  "POST /api/platform/cobrancas/[id]/baixa": autenticado("PLATAFORMA"),
  "GET /api/platform/leads": autenticado("PLATAFORMA"),
  "POST /api/platform/leads": autenticado("PLATAFORMA"),
  "GET /api/platform/leads/[id]": autenticado("PLATAFORMA"),
  "PATCH /api/platform/leads/[id]": autenticado("PLATAFORMA"),
  "POST /api/platform/leads/[id]/converter": autenticado("PLATAFORMA"),
  "POST /api/platform/leads/[id]/notas": autenticado("PLATAFORMA"),
  "PATCH /api/platform/leads/[id]/plano": autenticado("PLATAFORMA"),

  "GET /api/settings": publico("tempo de entrega exibido no cardápio"),
  "PUT /api/settings": autenticado("ADMIN"),
  "GET /api/settings/business-hours": publico("horário de funcionamento exibido no cardápio"),
  "PUT /api/settings/business-hours": autenticado("ADMIN"),
  "POST /api/settings/onboarding": autenticado("ADMIN"),
  "GET /api/settings/printer": publico("só liga/desliga e largura do papel, sem dado sensível"),
  "PUT /api/settings/printer": autenticado("ADMIN"),
  "GET /api/settings/restaurant": publico("nome, endereço, telefone e logo exibidos no cardápio"),
  "PUT /api/settings/restaurant": autenticado("ADMIN"),

  "GET /api/tables": autenticado("ADMIN"),
  "POST /api/tables": autenticado("ADMIN"),
  "PATCH /api/tables/[id]": autenticado("ADMIN"),
  "DELETE /api/tables/[id]": autenticado("ADMIN"),
  "POST /api/tables/[id]/close-bill": autenticado("ADMIN"),
  "GET /api/tables/[id]/orders": autenticado("ADMIN"),
  "GET /api/tables/token/[token]": publico("mesa identificada pelo token do QR code, sem conta"),
  "GET /api/tables/token/[token]/conta": publico(
    "conta da mesa identificada pelo token do QR code, sem conta"
  ),

  "POST /api/upload": autenticado("ADMIN", "PLATAFORMA"),
  "GET /api/users/motoboys": autenticado("ADMIN"),
  "POST /api/users/motoboys": autenticado("ADMIN"),
  "PATCH /api/users/motoboys/[id]": autenticado("ADMIN"),
  "DELETE /api/users/motoboys/[id]": autenticado("ADMIN"),
};
