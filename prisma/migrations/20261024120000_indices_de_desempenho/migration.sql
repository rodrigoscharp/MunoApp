-- Índices das consultas quentes de pedido e chat. Nenhuma tabela nova, então
-- nada de RLS aqui. Cada índice novo nasce antes de o antigo que ele cobre ser
-- removido: não há instante sem índice para o filtro de tenant.

-- 1. ChatMessage: a conversa de um pedido (orderId, ordenada por createdAt, e o
--    ?since dela) e o sino do cliente (mensagens do restaurante desde o
--    cursor). Os dois começam pelas colunas dos índices antigos, que viram
--    prefixo redundante.
CREATE INDEX "ChatMessage_orderId_createdAt_idx" ON "ChatMessage"("orderId", "createdAt");
CREATE INDEX "ChatMessage_tenantId_senderRole_createdAt_idx" ON "ChatMessage"("tenantId", "senderRole", "createdAt");
DROP INDEX "ChatMessage_orderId_idx";
DROP INDEX "ChatMessage_tenantId_idx";

-- 2. Payment: [tenantId, createdAt] atende o filtro automático da extensão do
--    Prisma e o relatório por período. O de [tenantId] sozinho vira prefixo
--    redundante, como aconteceu em Order (20260801190000).
CREATE INDEX "Payment_tenantId_createdAt_idx" ON "Payment"("tenantId", "createdAt");
DROP INDEX "Payment_tenantId_idx";

-- 3. Order: a lista de conversas do admin ordena por updatedAt dentro do tenant.
CREATE INDEX "Order_tenantId_updatedAt_idx" ON "Order"("tenantId", "updatedAt");
