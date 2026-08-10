-- CreateEnum
CREATE TYPE "AssinaturaStatus" AS ENUM ('ATIVA', 'INADIMPLENTE', 'BLOQUEADA', 'CANCELADA');

-- CreateEnum
CREATE TYPE "CobrancaStatus" AS ENUM ('PENDENTE', 'PAGA', 'VENCIDA', 'CANCELADA');

-- CreateTable
CREATE TABLE "Assinatura" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "valorMensal" DECIMAL(10,2) NOT NULL,
    "diaVencimento" INTEGER NOT NULL,
    "inicioCobranca" TIMESTAMP(3) NOT NULL,
    "status" "AssinaturaStatus" NOT NULL DEFAULT 'ATIVA',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Assinatura_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Cobranca" (
    "id" TEXT NOT NULL,
    "assinaturaId" TEXT NOT NULL,
    "competencia" TEXT NOT NULL,
    "valor" DECIMAL(10,2) NOT NULL,
    "vencimento" TIMESTAMP(3) NOT NULL,
    "status" "CobrancaStatus" NOT NULL DEFAULT 'PENDENTE',
    "pagoEm" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Cobranca_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Assinatura_tenantId_key" ON "Assinatura"("tenantId");

-- CreateIndex
CREATE INDEX "Cobranca_status_vencimento_idx" ON "Cobranca"("status", "vencimento");

-- CreateIndex
CREATE UNIQUE INDEX "Cobranca_assinaturaId_competencia_key" ON "Cobranca"("assinaturaId", "competencia");

-- AddForeignKey
ALTER TABLE "Assinatura" ADD CONSTRAINT "Assinatura_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Cobranca" ADD CONSTRAINT "Cobranca_assinaturaId_fkey" FOREIGN KEY ("assinaturaId") REFERENCES "Assinatura"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Backfill: todo tenant que já tinha mensalidade contratada vira assinatura.
-- Roda ANTES do DROP e na mesma transação: se falhar, nada cai.
--
-- inicioCobranca é o próximo vencimento **no futuro**, nunca o deste mês quando
-- o dia já passou. Um vencimento retroativo não seria cortesia negada, seria
-- dívida inventada: o job da régua veria a primeira competência já vencida e
-- bloquearia o /adm de um restaurante que nunca recebeu uma fatura deste
-- sistema — dia 1 migrado no dia 28 nasceria com 27 dias de atraso, direto em
-- BLOQUEADA, sem passar por INADIMPLENTE.
--
-- O dia que cai exatamente hoje também rola para o mês que vem (`>`, não `>=`):
-- vencer hoje é a mesma injustiça em miniatura — cobrança com zero dia de aviso,
-- decidida por uma migração que o cliente não viu passar.
--
-- Tenant com diaVencimento preenchido mas valorMensal nulo fica de fora e perde
-- o dia gravado. É de propósito e não é perda: nunca houve mensalidade para
-- cobrar, e dia de vencimento sem valor não fatura nada.
INSERT INTO "Assinatura" (id, "tenantId", "valorMensal", "diaVencimento", "inicioCobranca", status, "createdAt", "updatedAt")
SELECT
  gen_random_uuid()::text,
  t.id,
  t."valorMensal",
  COALESCE(t."diaVencimento", 10),
  CASE
    WHEN COALESCE(t."diaVencimento", 10) > EXTRACT(day FROM now())
    THEN date_trunc('month', now())
    ELSE date_trunc('month', now() + interval '1 month')
  END + (COALESCE(t."diaVencimento", 10) - 1) * interval '1 day',
  'ATIVA',
  now(),
  now()
FROM "Tenant" t
WHERE t."valorMensal" IS NOT NULL;

-- AlterTable
-- Depois do backfill, nunca antes: o INSERT acima lê estas duas colunas.
ALTER TABLE "Tenant" DROP COLUMN "diaVencimento",
DROP COLUMN "valorMensal";

-- Mesma forma das policies de 20260701135559 e 20260801193000: a role da
-- aplicação tem BYPASSRLS e continua enxergando tudo (o escopo por tenant é
-- feito no Prisma Client), então o console segue lendo todas as assinaturas por
-- prismaUnscoped. O efeito é sobre anon/authenticated, que é quem o navegador
-- usa: sem `app.current_tenant` definido, a policy não libera linha nenhuma.
--
-- Sem isto, a mensalidade de cada restaurante nasceria legível pela chave anon —
-- tabela nova no schema public entra exposta, e é o preço de a Assinatura ser
-- tenant-scoped como as outras catorze.
--
-- Cobranca fica de fora porque não tem tenantId: a policy não teria por onde
-- filtrar sem um join, e a regra do projeto é por coluna.
ALTER TABLE "Assinatura" ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "Assinatura" USING ("tenantId" = current_setting('app.current_tenant', true));
