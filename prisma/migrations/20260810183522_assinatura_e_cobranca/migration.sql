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
-- inicioCobranca recebe o próximo vencimento a partir de hoje — quem já é
-- cliente não ganha cortesia retroativa.
INSERT INTO "Assinatura" (id, "tenantId", "valorMensal", "diaVencimento", "inicioCobranca", status, "createdAt", "updatedAt")
SELECT
  gen_random_uuid()::text,
  t.id,
  t."valorMensal",
  COALESCE(t."diaVencimento", 10),
  date_trunc('month', now()) + (COALESCE(t."diaVencimento", 10) - 1) * interval '1 day',
  'ATIVA',
  now(),
  now()
FROM "Tenant" t
WHERE t."valorMensal" IS NOT NULL;

-- AlterTable
-- Depois do backfill, nunca antes: o INSERT acima lê estas duas colunas.
ALTER TABLE "Tenant" DROP COLUMN "diaVencimento",
DROP COLUMN "valorMensal";
