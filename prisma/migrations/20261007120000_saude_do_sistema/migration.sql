-- CreateEnum
CREATE TYPE "NivelEvento" AS ENUM ('OK', 'AVISO', 'ERRO');

-- CreateTable
CREATE TABLE "EventoSistema" (
    "id" TEXT NOT NULL,
    "origem" TEXT NOT NULL,
    "nivel" "NivelEvento" NOT NULL,
    "mensagem" TEXT NOT NULL,
    "tenantId" TEXT,
    "extra" JSONB,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EventoSistema_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Order_createdAt_idx" ON "Order"("createdAt");

-- CreateIndex
CREATE INDEX "EventoSistema_origem_criadoEm_idx" ON "EventoSistema"("origem", "criadoEm");

-- CreateIndex
CREATE INDEX "EventoSistema_nivel_criadoEm_idx" ON "EventoSistema"("nivel", "criadoEm");

-- CreateIndex
CREATE INDEX "EventoSistema_tenantId_criadoEm_idx" ON "EventoSistema"("tenantId", "criadoEm");

-- CreateIndex
CREATE INDEX "EventoSistema_criadoEm_idx" ON "EventoSistema"("criadoEm");

-- Tabela da plataforma, nunca lida pela chave pública. RLS sem policy: nega
-- tudo para anon e authenticated, e não muda nada para a aplicação, que
-- conecta como postgres (BYPASSRLS). Ver 20260810200000_rls_nas_tabelas_de_plataforma.
ALTER TABLE "EventoSistema" ENABLE ROW LEVEL SECURITY;
