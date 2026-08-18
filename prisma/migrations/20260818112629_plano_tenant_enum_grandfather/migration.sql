-- CreateEnum
CREATE TYPE "PlanoTenant" AS ENUM ('MEMBRO', 'MEMBRO_MESA_QR');

-- Normaliza qualquer valor livre pré-existente (hoje só "free", coluna nunca
-- foi enum) para o novo default, ainda com a coluna como texto -- evita
-- "invalid input value for enum" no cast abaixo.
UPDATE "Tenant" SET "plano" = 'MEMBRO';

-- Grandfather: tenant que já tem mesa cadastrada mantém acesso à feature de
-- Mesas (QR), que até aqui era liberada pra todo mundo sem controle de plano.
-- Sem isso, quem já paga por mesas perderia o acesso no exato momento em que
-- esta migration for aplicada em produção.
UPDATE "Tenant"
SET "plano" = 'MEMBRO_MESA_QR'
WHERE EXISTS (
  SELECT 1 FROM "Table" WHERE "Table"."tenantId" = "Tenant"."id"
);

-- AlterTable
ALTER TABLE "Tenant" ALTER COLUMN "plano" DROP DEFAULT;
ALTER TABLE "Tenant" ALTER COLUMN "plano" TYPE "PlanoTenant" USING ("plano"::"PlanoTenant");
ALTER TABLE "Tenant" ALTER COLUMN "plano" SET DEFAULT 'MEMBRO';
