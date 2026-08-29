/*
  Warnings:

  - A unique constraint covering the columns `[asaasSubscriptionId]` on the table `Assinatura` will be added. If there are existing duplicate values, this will fail.

*/
-- CreateEnum
CREATE TYPE "Ciclo" AS ENUM ('MENSAL', 'ANUAL');

-- AlterTable
ALTER TABLE "Assinatura" ADD COLUMN     "asaasSubscriptionId" TEXT,
ADD COLUMN     "ciclo" "Ciclo" NOT NULL DEFAULT 'MENSAL';

-- CreateIndex
CREATE UNIQUE INDEX "Assinatura_asaasSubscriptionId_key" ON "Assinatura"("asaasSubscriptionId");
