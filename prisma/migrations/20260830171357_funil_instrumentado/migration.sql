-- CreateEnum
CREATE TYPE "TipoEvento" AS ENUM ('VISITA', 'VIU_PRECO', 'CLICOU_ASSINAR', 'ABRIU_WHATSAPP', 'CHECKOUT_PASSO', 'CHECKOUT_CRIADO', 'PAGOU', 'PROVISIONADO', 'ABANDONOU');

-- AlterTable
ALTER TABLE "Inscricao" ADD COLUMN     "sessaoId" TEXT;

-- AlterTable
ALTER TABLE "Lead" ADD COLUMN     "sessaoId" TEXT;

-- CreateTable
CREATE TABLE "SessaoFunil" (
    "id" TEXT NOT NULL,
    "utmSource" TEXT,
    "utmMedium" TEXT,
    "utmCampaign" TEXT,
    "referrer" TEXT,
    "dispositivo" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SessaoFunil_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EventoFunil" (
    "id" TEXT NOT NULL,
    "sessaoId" TEXT,
    "tipo" "TipoEvento" NOT NULL,
    "detalhe" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EventoFunil_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ResumoDiario" (
    "dia" DATE NOT NULL,
    "tipo" "TipoEvento" NOT NULL,
    "origem" TEXT NOT NULL,
    "n" INTEGER NOT NULL,

    CONSTRAINT "ResumoDiario_pkey" PRIMARY KEY ("dia","tipo","origem")
);

-- CreateIndex
CREATE INDEX "SessaoFunil_createdAt_idx" ON "SessaoFunil"("createdAt");

-- CreateIndex
CREATE INDEX "EventoFunil_createdAt_idx" ON "EventoFunil"("createdAt");

-- CreateIndex
CREATE INDEX "EventoFunil_sessaoId_idx" ON "EventoFunil"("sessaoId");

-- CreateIndex
CREATE INDEX "EventoFunil_tipo_createdAt_idx" ON "EventoFunil"("tipo", "createdAt");

-- CreateIndex
CREATE INDEX "Inscricao_sessaoId_idx" ON "Inscricao"("sessaoId");

-- CreateIndex
CREATE INDEX "Lead_sessaoId_idx" ON "Lead"("sessaoId");

-- AddForeignKey
ALTER TABLE "Lead" ADD CONSTRAINT "Lead_sessaoId_fkey" FOREIGN KEY ("sessaoId") REFERENCES "SessaoFunil"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EventoFunil" ADD CONSTRAINT "EventoFunil_sessaoId_fkey" FOREIGN KEY ("sessaoId") REFERENCES "SessaoFunil"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Inscricao" ADD CONSTRAINT "Inscricao_sessaoId_fkey" FOREIGN KEY ("sessaoId") REFERENCES "SessaoFunil"("id") ON DELETE SET NULL ON UPDATE CASCADE;
