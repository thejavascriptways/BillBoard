-- CreateEnum
CREATE TYPE "PaymentMode" AS ENUM ('auto', 'manual', 'check', 'paycheck', 'covered');

-- CreateEnum
CREATE TYPE "MonthStatus" AS ENUM ('not_done', 'done', 'failed', 'not_applicable', 'included', 'skipped', 'pending');

-- CreateEnum
CREATE TYPE "DueRuleKind" AS ENUM ('schedule', 'day_of_month', 'last_day', 'last_business_day', 'every_n_months', 'quarterly', 'semiannual', 'annual', 'fixed_range', 'usage', 'balance', 'on_demand', 'event', 'statement');

-- AlterTable
ALTER TABLE "Bill" ADD COLUMN     "accountBalance" DECIMAL(12,2),
ADD COLUMN     "balanceThreshold" DECIMAL(12,2),
ADD COLUMN     "coveredByBillId" TEXT,
ADD COLUMN     "dueOnNote" TEXT,
ADD COLUMN     "dueRuleKind" "DueRuleKind" NOT NULL DEFAULT 'schedule',
ADD COLUMN     "muted" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "paymentMode" "PaymentMode" NOT NULL DEFAULT 'manual',
ADD COLUMN     "personId" TEXT,
ADD COLUMN     "sessionCount" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "sessionEveryN" INTEGER;

-- AlterTable
ALTER TABLE "Category" ADD COLUMN     "color" TEXT NOT NULL DEFAULT '#534C66',
ADD COLUMN     "parentId" TEXT;

-- AlterTable
ALTER TABLE "CreditCard" ADD COLUMN     "cardholderId" TEXT;

-- AlterTable
ALTER TABLE "HouseholdPrefs" ADD COLUMN     "quietEnd" INTEGER NOT NULL DEFAULT 420,
ADD COLUMN     "quietStart" INTEGER NOT NULL DEFAULT 1320,
ALTER COLUMN "reminderDays" SET DEFAULT ARRAY[7, 3, 1, 0]::INTEGER[];

-- CreateTable
CREATE TABLE "MonthEntry" (
    "id" TEXT NOT NULL,
    "householdId" TEXT NOT NULL,
    "billId" TEXT NOT NULL,
    "yearMonth" TEXT NOT NULL,
    "amount" DECIMAL(12,2),
    "paidOn" DATE,
    "status" "MonthStatus" NOT NULL DEFAULT 'not_done',
    "dueDate" DATE,
    "statementAmount" DECIMAL(12,2),
    "amountPaid" DECIMAL(12,2),
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MonthEntry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LedgerMonth" (
    "id" TEXT NOT NULL,
    "householdId" TEXT NOT NULL,
    "yearMonth" TEXT NOT NULL,
    "archivedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LedgerMonth_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditLog" (
    "id" TEXT NOT NULL,
    "householdId" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "summary" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "MonthEntry_householdId_yearMonth_idx" ON "MonthEntry"("householdId", "yearMonth");

-- CreateIndex
CREATE UNIQUE INDEX "MonthEntry_billId_yearMonth_key" ON "MonthEntry"("billId", "yearMonth");

-- CreateIndex
CREATE UNIQUE INDEX "LedgerMonth_householdId_yearMonth_key" ON "LedgerMonth"("householdId", "yearMonth");

-- CreateIndex
CREATE INDEX "AuditLog_householdId_entityType_entityId_idx" ON "AuditLog"("householdId", "entityType", "entityId");

-- CreateIndex
CREATE INDEX "Bill_personId_idx" ON "Bill"("personId");

-- CreateIndex
CREATE INDEX "Bill_coveredByBillId_idx" ON "Bill"("coveredByBillId");

-- CreateIndex
CREATE INDEX "CreditCard_cardholderId_idx" ON "CreditCard"("cardholderId");

-- AddForeignKey
ALTER TABLE "Category" ADD CONSTRAINT "Category_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "Category"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Bill" ADD CONSTRAINT "Bill_coveredByBillId_fkey" FOREIGN KEY ("coveredByBillId") REFERENCES "Bill"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Bill" ADD CONSTRAINT "Bill_personId_fkey" FOREIGN KEY ("personId") REFERENCES "Person"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CreditCard" ADD CONSTRAINT "CreditCard_cardholderId_fkey" FOREIGN KEY ("cardholderId") REFERENCES "Person"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MonthEntry" ADD CONSTRAINT "MonthEntry_householdId_fkey" FOREIGN KEY ("householdId") REFERENCES "Household"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MonthEntry" ADD CONSTRAINT "MonthEntry_billId_fkey" FOREIGN KEY ("billId") REFERENCES "Bill"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LedgerMonth" ADD CONSTRAINT "LedgerMonth_householdId_fkey" FOREIGN KEY ("householdId") REFERENCES "Household"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_householdId_fkey" FOREIGN KEY ("householdId") REFERENCES "Household"("id") ON DELETE CASCADE ON UPDATE CASCADE;

