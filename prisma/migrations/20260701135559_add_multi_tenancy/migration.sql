-- 1. Tenant table
CREATE TABLE "Tenant" (
    "id" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "plano" TEXT NOT NULL DEFAULT 'free',
    "status" TEXT NOT NULL DEFAULT 'active',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Tenant_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "Tenant_slug_key" ON "Tenant"("slug");

-- 2. Seed the "default" tenant that all existing data will belong to
INSERT INTO "Tenant" ("id", "nome", "slug")
VALUES (gen_random_uuid()::text, 'Muno Food Restaurante', 'default');

-- 3. PaymentConnection table (new, no existing rows to backfill)
CREATE TABLE "PaymentConnection" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "provider" TEXT NOT NULL DEFAULT 'mercado_pago',
    "accessToken" TEXT NOT NULL,
    "refreshToken" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'active',
    "mpUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PaymentConnection_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "PaymentConnection_tenantId_idx" ON "PaymentConnection"("tenantId");
CREATE UNIQUE INDEX "PaymentConnection_tenantId_provider_key" ON "PaymentConnection"("tenantId", "provider");
ALTER TABLE "PaymentConnection" ADD CONSTRAINT "PaymentConnection_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- 4. Add tenantId as NULLABLE first on every existing table (they have rows)
ALTER TABLE "User" ADD COLUMN "tenantId" TEXT;
ALTER TABLE "Category" ADD COLUMN "tenantId" TEXT;
ALTER TABLE "MenuItem" ADD COLUMN "tenantId" TEXT;
ALTER TABLE "Order" ADD COLUMN "tenantId" TEXT;
ALTER TABLE "Table" ADD COLUMN "tenantId" TEXT;
ALTER TABLE "Payment" ADD COLUMN "tenantId" TEXT;
ALTER TABLE "PasswordResetToken" ADD COLUMN "tenantId" TEXT;
ALTER TABLE "DeliveryZone" ADD COLUMN "tenantId" TEXT;
ALTER TABLE "ChatMessage" ADD COLUMN "tenantId" TEXT;

-- Setting is getting a new synthetic "id" (its old pkey was "key", which
-- becomes non-unique on its own once shared across tenants)
ALTER TABLE "Setting" ADD COLUMN "id" TEXT;
ALTER TABLE "Setting" ADD COLUMN "tenantId" TEXT;

-- 5. Backfill: every existing row belongs to the "default" tenant
UPDATE "User" SET "tenantId" = (SELECT "id" FROM "Tenant" WHERE "slug" = 'default');
UPDATE "Category" SET "tenantId" = (SELECT "id" FROM "Tenant" WHERE "slug" = 'default');
UPDATE "MenuItem" SET "tenantId" = (SELECT "id" FROM "Tenant" WHERE "slug" = 'default');
UPDATE "Order" SET "tenantId" = (SELECT "id" FROM "Tenant" WHERE "slug" = 'default');
UPDATE "Table" SET "tenantId" = (SELECT "id" FROM "Tenant" WHERE "slug" = 'default');
UPDATE "Payment" SET "tenantId" = (SELECT "id" FROM "Tenant" WHERE "slug" = 'default');
UPDATE "PasswordResetToken" SET "tenantId" = (SELECT "id" FROM "Tenant" WHERE "slug" = 'default');
UPDATE "DeliveryZone" SET "tenantId" = (SELECT "id" FROM "Tenant" WHERE "slug" = 'default');
UPDATE "ChatMessage" SET "tenantId" = (SELECT "id" FROM "Tenant" WHERE "slug" = 'default');
UPDATE "Setting" SET "id" = gen_random_uuid()::text, "tenantId" = (SELECT "id" FROM "Tenant" WHERE "slug" = 'default');

-- 6. Now that every row has a value, enforce NOT NULL
ALTER TABLE "User" ALTER COLUMN "tenantId" SET NOT NULL;
ALTER TABLE "Category" ALTER COLUMN "tenantId" SET NOT NULL;
ALTER TABLE "MenuItem" ALTER COLUMN "tenantId" SET NOT NULL;
ALTER TABLE "Order" ALTER COLUMN "tenantId" SET NOT NULL;
ALTER TABLE "Table" ALTER COLUMN "tenantId" SET NOT NULL;
ALTER TABLE "Payment" ALTER COLUMN "tenantId" SET NOT NULL;
ALTER TABLE "PasswordResetToken" ALTER COLUMN "tenantId" SET NOT NULL;
ALTER TABLE "DeliveryZone" ALTER COLUMN "tenantId" SET NOT NULL;
ALTER TABLE "ChatMessage" ALTER COLUMN "tenantId" SET NOT NULL;
ALTER TABLE "Setting" ALTER COLUMN "id" SET NOT NULL;
ALTER TABLE "Setting" ALTER COLUMN "tenantId" SET NOT NULL;

-- 7. Swap Setting's primary key from "key" to the new synthetic "id"
ALTER TABLE "Setting" DROP CONSTRAINT "Setting_pkey";
ALTER TABLE "Setting" ADD CONSTRAINT "Setting_pkey" PRIMARY KEY ("id");

-- 8. Drop the old single-tenant unique indexes, replaced by compound ones below
DROP INDEX "User_email_key";
DROP INDEX "Category_slug_key";
DROP INDEX "Table_number_key";
DROP INDEX "Table_token_key";

-- 9. New indexes: tenantId lookups + per-tenant uniques
CREATE INDEX "User_tenantId_idx" ON "User"("tenantId");
CREATE UNIQUE INDEX "User_tenantId_email_key" ON "User"("tenantId", "email");
CREATE INDEX "Category_tenantId_idx" ON "Category"("tenantId");
CREATE UNIQUE INDEX "Category_tenantId_slug_key" ON "Category"("tenantId", "slug");
CREATE INDEX "MenuItem_tenantId_idx" ON "MenuItem"("tenantId");
CREATE INDEX "Order_tenantId_idx" ON "Order"("tenantId");
CREATE INDEX "Table_tenantId_idx" ON "Table"("tenantId");
CREATE UNIQUE INDEX "Table_tenantId_number_key" ON "Table"("tenantId", "number");
CREATE UNIQUE INDEX "Table_tenantId_token_key" ON "Table"("tenantId", "token");
CREATE INDEX "Payment_tenantId_idx" ON "Payment"("tenantId");
CREATE INDEX "Setting_tenantId_idx" ON "Setting"("tenantId");
CREATE UNIQUE INDEX "Setting_tenantId_key_key" ON "Setting"("tenantId", "key");
CREATE INDEX "PasswordResetToken_tenantId_idx" ON "PasswordResetToken"("tenantId");
CREATE INDEX "DeliveryZone_tenantId_idx" ON "DeliveryZone"("tenantId");
CREATE INDEX "ChatMessage_tenantId_idx" ON "ChatMessage"("tenantId");

-- 10. Foreign keys to Tenant
ALTER TABLE "User" ADD CONSTRAINT "User_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Category" ADD CONSTRAINT "Category_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "MenuItem" ADD CONSTRAINT "MenuItem_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Order" ADD CONSTRAINT "Order_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Table" ADD CONSTRAINT "Table_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Setting" ADD CONSTRAINT "Setting_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "PasswordResetToken" ADD CONSTRAINT "PasswordResetToken_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "DeliveryZone" ADD CONSTRAINT "DeliveryZone_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ChatMessage" ADD CONSTRAINT "ChatMessage_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- 11. Row Level Security — defense in depth. A connection using a role with
-- BYPASSRLS (ex.: o "postgres" padrão do Supabase, usado pelo Prisma) NÃO é
-- restringida por essas policies; a aplicação escopa por tenant no nível do
-- Prisma Client (ver src/lib/prisma.ts). Isso protege sobretudo o caminho do
-- Supabase Realtime, que conecta com as roles anon/authenticated.
ALTER TABLE "User" ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "User" USING ("tenantId" = current_setting('app.current_tenant', true));

ALTER TABLE "Category" ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "Category" USING ("tenantId" = current_setting('app.current_tenant', true));

ALTER TABLE "MenuItem" ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "MenuItem" USING ("tenantId" = current_setting('app.current_tenant', true));

ALTER TABLE "Order" ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "Order" USING ("tenantId" = current_setting('app.current_tenant', true));

ALTER TABLE "Table" ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "Table" USING ("tenantId" = current_setting('app.current_tenant', true));

ALTER TABLE "Payment" ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "Payment" USING ("tenantId" = current_setting('app.current_tenant', true));

ALTER TABLE "Setting" ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "Setting" USING ("tenantId" = current_setting('app.current_tenant', true));

ALTER TABLE "PasswordResetToken" ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "PasswordResetToken" USING ("tenantId" = current_setting('app.current_tenant', true));

ALTER TABLE "DeliveryZone" ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "DeliveryZone" USING ("tenantId" = current_setting('app.current_tenant', true));

ALTER TABLE "ChatMessage" ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "ChatMessage" USING ("tenantId" = current_setting('app.current_tenant', true));

ALTER TABLE "PaymentConnection" ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "PaymentConnection" USING ("tenantId" = current_setting('app.current_tenant', true));
