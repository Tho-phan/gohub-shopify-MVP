-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_GohubOrder" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "shop" TEXT NOT NULL,
    "idempotencyKey" TEXT NOT NULL,
    "shopifyOrderId" TEXT NOT NULL,
    "shopifyOrderName" TEXT NOT NULL,
    "customerEmail" TEXT NOT NULL,
    "currency" TEXT NOT NULL,
    "items" TEXT NOT NULL DEFAULT '[]',
    "gohubOrderCode" TEXT,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "lastError" TEXT,
    "emailSentAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);
INSERT INTO "new_GohubOrder" ("attempts", "createdAt", "currency", "customerEmail", "emailSentAt", "gohubOrderCode", "id", "idempotencyKey", "lastError", "shop", "shopifyOrderId", "shopifyOrderName", "status", "updatedAt") SELECT "attempts", "createdAt", "currency", "customerEmail", "emailSentAt", "gohubOrderCode", "id", "idempotencyKey", "lastError", "shop", "shopifyOrderId", "shopifyOrderName", "status", "updatedAt" FROM "GohubOrder";
DROP TABLE "GohubOrder";
ALTER TABLE "new_GohubOrder" RENAME TO "GohubOrder";
CREATE UNIQUE INDEX "GohubOrder_idempotencyKey_key" ON "GohubOrder"("idempotencyKey");
CREATE INDEX "GohubOrder_status_idx" ON "GohubOrder"("status");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
