-- CreateTable
CREATE TABLE "ResellerPlan" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "shop" TEXT NOT NULL,
    "gohubPlanId" TEXT NOT NULL,
    "salePrice" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "shopifyProductGid" TEXT,
    "shopifyVariantGid" TEXT,
    "shopifyVariantNumericId" TEXT,
    "pushedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "ProvisionedEsim" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "shop" TEXT NOT NULL,
    "idempotencyKey" TEXT NOT NULL,
    "shopifyOrderId" TEXT NOT NULL,
    "shopifyOrderName" TEXT NOT NULL,
    "shopifyLineItemId" TEXT NOT NULL,
    "gohubPlanId" TEXT NOT NULL,
    "planName" TEXT NOT NULL,
    "iccid" TEXT NOT NULL,
    "lpa" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "customerEmail" TEXT NOT NULL,
    "emailSentAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateIndex
CREATE INDEX "ResellerPlan_shop_shopifyVariantNumericId_idx" ON "ResellerPlan"("shop", "shopifyVariantNumericId");

-- CreateIndex
CREATE UNIQUE INDEX "ResellerPlan_shop_gohubPlanId_key" ON "ResellerPlan"("shop", "gohubPlanId");

-- CreateIndex
CREATE UNIQUE INDEX "ProvisionedEsim_idempotencyKey_key" ON "ProvisionedEsim"("idempotencyKey");
