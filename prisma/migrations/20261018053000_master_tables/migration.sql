-- AlterTable
ALTER TABLE "Property" ADD COLUMN "isActive" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN "typeKey" TEXT;
ALTER TABLE "Category" ADD COLUMN "isActive" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "PaymentMethod" ADD COLUMN "isActive" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "Person" ADD COLUMN "isActive" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "Payee" ADD COLUMN "sortOrder" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN "isActive" BOOLEAN NOT NULL DEFAULT true;

UPDATE "Property" SET "isActive" = ("archivedAt" IS NULL);
UPDATE "Category" SET "isActive" = ("archivedAt" IS NULL);
UPDATE "PaymentMethod" SET "isActive" = ("archivedAt" IS NULL);
UPDATE "Person" SET "isActive" = ("archivedAt" IS NULL);
UPDATE "Payee" SET "isActive" = ("archivedAt" IS NULL);

-- CreateTable
CREATE TABLE "CardIssuer" (
    "id" TEXT NOT NULL,
    "householdId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CardIssuer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LookupLabel" (
    "id" TEXT NOT NULL,
    "householdId" TEXT NOT NULL,
    "table" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "isSystem" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LookupLabel_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Payee_householdId_sortOrder_idx" ON "Payee"("householdId", "sortOrder");
CREATE UNIQUE INDEX "CardIssuer_householdId_name_key" ON "CardIssuer"("householdId", "name");
CREATE INDEX "CardIssuer_householdId_sortOrder_idx" ON "CardIssuer"("householdId", "sortOrder");
CREATE UNIQUE INDEX "LookupLabel_householdId_table_key_key" ON "LookupLabel"("householdId", "table", "key");
CREATE INDEX "LookupLabel_householdId_table_sortOrder_idx" ON "LookupLabel"("householdId", "table", "sortOrder");

-- AddForeignKey
ALTER TABLE "CardIssuer" ADD CONSTRAINT "CardIssuer_householdId_fkey" FOREIGN KEY ("householdId") REFERENCES "Household"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "LookupLabel" ADD CONSTRAINT "LookupLabel_householdId_fkey" FOREIGN KEY ("householdId") REFERENCES "Household"("id") ON DELETE CASCADE ON UPDATE CASCADE;
