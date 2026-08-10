// Models que carregam tenantId e devem ser automaticamente filtrados/preenchidos
// pelo tenant da request atual (ver src/lib/tenant-context.ts e a extensão em
// src/lib/prisma.ts).
//
// Vive num módulo separado de propósito: importar src/lib/prisma.ts instancia um
// PrismaClient, e o teste que confere esta lista contra o schema não precisa de
// banco nenhum.
//
// ATENÇÃO: a extensão intercepta a operação do model no topo da chamada, então
// ela NÃO alcança escrita aninhada — `order.create({ data: { items: { create:
// [...] } } })` cria OrderItem sem passar por ela. Nesses casos o tenantId
// precisa ir explícito no objeto aninhado (ver POST /api/orders).
export const TENANT_SCOPED_MODELS = new Set([
  "User",
  "Category",
  "MenuItem",
  "Order",
  "OrderItem",
  "DeliveryTracking",
  "Table",
  "Payment",
  "Setting",
  "DeliveryZone",
  "ChatMessage",
  "Coupon",
  "PaymentConnection",
  "PasswordResetToken",
  // A plataforma lê assinatura por prismaUnscoped, que não passa por esta lista.
  // Ela entra aqui pelo outro lado: o /adm do restaurante lê a própria
  // assinatura, e é essa consulta que precisa ser corrigida sozinha quando
  // alguém esquecer o tenantId no where.
  "Assinatura",
]);
