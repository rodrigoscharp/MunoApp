-- AlterTable
ALTER TABLE "Cobranca" ADD COLUMN "asaasPaymentId" TEXT;

-- AlterTable
ALTER TABLE "Inscricao" ADD COLUMN "termosAceitosEm" TIMESTAMP(3),
ADD COLUMN "termosVersao" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "Cobranca_asaasPaymentId_key" ON "Cobranca"("asaasPaymentId");
