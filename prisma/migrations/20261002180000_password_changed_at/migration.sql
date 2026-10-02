-- AlterTable
ALTER TABLE "User" ADD COLUMN "passwordChangedAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "PlatformAdmin" ADD COLUMN "passwordChangedAt" TIMESTAMP(3);
