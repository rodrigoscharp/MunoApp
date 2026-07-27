/*
  Warnings:

  - You are about to drop the column `accessToken` on the `PaymentConnection` table. All the data in the column will be lost.
  - You are about to drop the column `expiresAt` on the `PaymentConnection` table. All the data in the column will be lost.
  - You are about to drop the column `mpUserId` on the `PaymentConnection` table. All the data in the column will be lost.
  - You are about to drop the column `refreshToken` on the `PaymentConnection` table. All the data in the column will be lost.
  - Added the required column `credentials` to the `PaymentConnection` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "PaymentConnection" DROP COLUMN "accessToken",
DROP COLUMN "expiresAt",
DROP COLUMN "mpUserId",
DROP COLUMN "refreshToken",
ADD COLUMN     "credentials" TEXT NOT NULL,
ADD COLUMN     "externalAccountId" TEXT,
ADD COLUMN     "lastCheckedAt" TIMESTAMP(3),
ALTER COLUMN "provider" DROP DEFAULT,
ALTER COLUMN "status" DROP DEFAULT;
