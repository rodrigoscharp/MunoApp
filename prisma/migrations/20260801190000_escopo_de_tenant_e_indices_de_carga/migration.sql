-- Escopo de tenant em OrderItem e DeliveryTracking + índices das consultas quentes.
--
-- Motivação: os dois models eram os únicos alcançados pelo app que não tinham
-- tenantId, e por isso ficavam fora de TENANT_SCOPED_MODELS (src/lib/prisma.ts).
-- Consequência real, invisível com um único tenant no banco: o groupBy do
-- "Top 10 itens" em /api/analytics somava OrderItem de todos os restaurantes.

-- 1. OrderItem.tenantId — adiciona nullable, preenche a partir do pedido, trava.
ALTER TABLE "OrderItem" ADD COLUMN "tenantId" TEXT;

UPDATE "OrderItem" oi
SET "tenantId" = o."tenantId"
FROM "Order" o
WHERE oi."orderId" = o."id";

ALTER TABLE "OrderItem" ALTER COLUMN "tenantId" SET NOT NULL;

ALTER TABLE "OrderItem" ADD CONSTRAINT "OrderItem_tenantId_fkey"
  FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- 2. DeliveryTracking.tenantId — mesmo procedimento.
ALTER TABLE "DeliveryTracking" ADD COLUMN "tenantId" TEXT;

UPDATE "DeliveryTracking" dt
SET "tenantId" = o."tenantId"
FROM "Order" o
WHERE dt."orderId" = o."id";

ALTER TABLE "DeliveryTracking" ALTER COLUMN "tenantId" SET NOT NULL;

ALTER TABLE "DeliveryTracking" ADD CONSTRAINT "DeliveryTracking_tenantId_fkey"
  FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- 3. Índices de chave estrangeira. O Prisma não cria índice de FK no PostgreSQL,
--    então OrderItem só tinha a PK: todo `include: { items }` (cozinha, admin,
--    histórico) fazia sequential scan da tabela inteira a cada requisição.
CREATE INDEX "OrderItem_tenantId_idx" ON "OrderItem"("tenantId");
CREATE INDEX "OrderItem_orderId_idx" ON "OrderItem"("orderId");
CREATE INDEX "OrderItem_menuItemId_idx" ON "OrderItem"("menuItemId");
CREATE INDEX "DeliveryTracking_tenantId_idx" ON "DeliveryTracking"("tenantId");
CREATE INDEX "DeliveryTracking_motoboyId_idx" ON "DeliveryTracking"("motoboyId");
CREATE INDEX "MenuItem_categoryId_idx" ON "MenuItem"("categoryId");
CREATE INDEX "Payment_tableId_idx" ON "Payment"("tableId");
CREATE INDEX "Order_motoboyId_idx" ON "Order"("motoboyId");
CREATE INDEX "Order_tableId_idx" ON "Order"("tableId");

-- 4. Índices compostos das três consultas quentes de Order. Todos começam por
--    tenantId, então também atendem o filtro automático da extensão do Prisma —
--    o que torna "Order_tenantId_idx" um prefixo redundante.
DROP INDEX "Order_tenantId_idx";
CREATE INDEX "Order_tenantId_status_createdAt_idx" ON "Order"("tenantId", "status", "createdAt");
CREATE INDEX "Order_tenantId_userId_createdAt_idx" ON "Order"("tenantId", "userId", "createdAt");
CREATE INDEX "Order_tenantId_status_deliveryType_idx" ON "Order"("tenantId", "status", "deliveryType");

-- 5. RLS deliberadamente NÃO habilitada nestas duas tabelas.
--
--    As policies de 20260701135559 existem para conter o Supabase Realtime, que
--    conecta como anon/authenticated (a role do Prisma tem BYPASSRLS). Como
--    `app.current_tenant` nunca é definido, a policy bloqueia a role anon por
--    inteiro — foi isso que matou as assinaturas de postgres_changes.
--
--    O mapa ao vivo do cliente (useDeliveryTracking) ainda depende de ler
--    DeliveryTracking por postgres_changes com a chave anon. Ligar RLS aqui
--    agora quebraria esse mapa. A ordem correta é migrar o hook para Broadcast
--    por tenant (broadcastTenantEvent, como a cozinha já faz) e só então
--    habilitar RLS nas duas tabelas.
