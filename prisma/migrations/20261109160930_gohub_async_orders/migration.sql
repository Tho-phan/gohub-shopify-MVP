/*
  Warnings:

  - You are about to drop the column `emailSentAt` on the `ProvisionedEsim` table. All the data in the column will be lost.
  - You are about to drop the column `gohubPlanId` on the `ProvisionedEsim` table. All the data in the column will be lost.
  - You are about to drop the column `idempotencyKey` on the `ProvisionedEsim` table. All the data in the column will be lost.
  - You are about to drop the column `shopifyLineItemId` on the `ProvisionedEsim` table. All the data in the column will be lost.
  - You are about to drop the column `shopifyOrderId` on the `ProvisionedEsim` table. All the data in the column will be lost.
  - You are about to drop the column `shopifyOrderName` on the `ProvisionedEsim` table. All the data in the column will be lost.
  - You are about to drop the column `status` on the `ProvisionedEsim` table. All the data in the column will be lost.
  - Added the required column `gohubOrderCode` to the `ProvisionedEsim` table without a default value. This is not possible if the table is not empty.

*/
-- CreateTable
CREATE TABLE "GohubOrder" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "shop" TEXT NOT NULL,
    "idempotencyKey" TEXT NOT NULL,
    "shopifyOrderId" TEXT NOT NULL,
    "shopifyOrderName" TEXT NOT NULL,
    "customerEmail" TEXT NOT NULL,
    "currency" TEXT NOT NULL,
    "gohubOrderCode" TEXT,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "lastError" TEXT,
    "emailSentAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_ProvisionedEsim" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "shop" TEXT NOT NULL,
    "gohubOrderCode" TEXT NOT NULL,
    "iccid" TEXT NOT NULL,
    "lpa" TEXT NOT NULL,
    "qrImageUrl" TEXT,
    "planName" TEXT NOT NULL,
    "activationExpiresAt" DATETIME,
    "expiresAt" DATETIME,
    "customerEmail" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
INSERT INTO "new_ProvisionedEsim" ("createdAt", "customerEmail", "iccid", "id", "lpa", "planName", "shop") SELECT "createdAt", "customerEmail", "iccid", "id", "lpa", "planName", "shop" FROM "ProvisionedEsim";
DROP TABLE "ProvisionedEsim";
ALTER TABLE "new_ProvisionedEsim" RENAME TO "ProvisionedEsim";
CREATE UNIQUE INDEX "ProvisionedEsim_iccid_key" ON "ProvisionedEsim"("iccid");
CREATE INDEX "ProvisionedEsim_shop_idx" ON "ProvisionedEsim"("shop");
CREATE INDEX "ProvisionedEsim_gohubOrderCode_idx" ON "ProvisionedEsim"("gohubOrderCode");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE UNIQUE INDEX "GohubOrder_idempotencyKey_key" ON "GohubOrder"("idempotencyKey");

-- CreateIndex
CREATE INDEX "GohubOrder_status_idx" ON "GohubOrder"("status");
