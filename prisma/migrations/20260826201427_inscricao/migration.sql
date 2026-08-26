-- CreateEnum
CREATE TYPE "InscricaoStatus" AS ENUM ('AGUARDANDO_PAGAMENTO', 'PAGA', 'PROVISIONADA');

-- CreateTable
CREATE TABLE "Inscricao" (
    "id" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "plano" "PlanoTenant" NOT NULL,
    "ciclo" "Ciclo" NOT NULL,
    "asaasCustomerId" TEXT,
    "asaasPaymentId" TEXT,
    "asaasSubscriptionId" TEXT,
    "status" "InscricaoStatus" NOT NULL DEFAULT 'AGUARDANDO_PAGAMENTO',
    "expiraEm" TIMESTAMP(3) NOT NULL,
    "tenantId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Inscricao_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Inscricao_slug_key" ON "Inscricao"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "Inscricao_asaasPaymentId_key" ON "Inscricao"("asaasPaymentId");

-- CreateIndex
CREATE UNIQUE INDEX "Inscricao_asaasSubscriptionId_key" ON "Inscricao"("asaasSubscriptionId");

-- CreateIndex
CREATE UNIQUE INDEX "Inscricao_tenantId_key" ON "Inscricao"("tenantId");

-- CreateIndex
CREATE INDEX "Inscricao_status_idx" ON "Inscricao"("status");

-- AddForeignKey
ALTER TABLE "Inscricao" ADD CONSTRAINT "Inscricao_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Tabela nova em `public` nasce ABERTA para a chave anônima do Supabase, com
-- escrita: `anon` e `authenticated` recebem SELECT/INSERT/UPDATE/DELETE por
-- padrão, e a anon key vai no bundle do navegador de todo cardápio. Foi assim
-- que Tenant, Lead e PlatformAdmin ficaram expostos até 10/08/2026.
--
-- Sem policy é o correto aqui: Inscricao é tabela de plataforma, não de
-- restaurante, e não há como escopá-la por tenant. Sem policy permissiva,
-- quem não tem BYPASSRLS não enxerga linha nenhuma. A aplicação conecta como
-- `postgres`, que tem BYPASSRLS, e nada muda para ela.
ALTER TABLE "Inscricao" ENABLE ROW LEVEL SECURITY;
