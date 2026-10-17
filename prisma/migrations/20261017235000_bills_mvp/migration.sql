-- CreateEnum
CREATE TYPE "PropertyKind" AS ENUM ('primary', 'rental', 'vacation', 'other');

-- CreateEnum
CREATE TYPE "PropertyStatus" AS ENUM ('active', 'upcoming', 'archived');

-- CreateEnum
CREATE TYPE "AmountKind" AS ENUM ('fixed', 'variable', 'estimated');

-- CreateEnum
CREATE TYPE "BillFrequency" AS ENUM ('weekly', 'biweekly', 'monthly', 'quarterly', 'semiannual', 'annual', 'every_n', 'once');

-- CreateEnum
CREATE TYPE "IntervalUnit" AS ENUM ('days', 'weeks', 'months');

-- CreateEnum
CREATE TYPE "WeekendShift" AS ENUM ('none', 'earlier', 'later');

-- AlterTable
ALTER TABLE "Property" ADD COLUMN     "kind" "PropertyKind" NOT NULL DEFAULT 'other',
ADD COLUMN     "purchaseDate" DATE,
ADD COLUMN     "roleBecomes" "PropertyKind",
ADD COLUMN     "roleStartsOn" DATE,
ADD COLUMN     "status" "PropertyStatus" NOT NULL DEFAULT 'active';

-- CreateTable
CREATE TABLE "Payee" (
    "id" TEXT NOT NULL,
    "householdId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "categoryId" TEXT,
    "accountLast4" TEXT,
    "website" TEXT,
    "phone" TEXT,
    "notes" TEXT,
    "archivedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Payee_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Bill" (
    "id" TEXT NOT NULL,
    "householdId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "payeeId" TEXT NOT NULL,
    "propertyId" TEXT NOT NULL,
    "categoryId" TEXT NOT NULL,
    "amountKind" "AmountKind" NOT NULL DEFAULT 'fixed',
    "amount" DECIMAL(12,2) NOT NULL,
    "anchorDate" DATE NOT NULL,
    "autopay" BOOLEAN NOT NULL DEFAULT false,
    "paymentMethodId" TEXT,
    "notes" TEXT,
    "portalUrl" TEXT,
    "frequency" "BillFrequency" NOT NULL DEFAULT 'monthly',
    "intervalN" INTEGER NOT NULL DEFAULT 1,
    "intervalUnit" "IntervalUnit" NOT NULL DEFAULT 'months',
    "dayOfMonth" INTEGER,
    "endDate" DATE,
    "endCount" INTEGER,
    "shiftWeekends" "WeekendShift" NOT NULL DEFAULT 'none',
    "reminderDays" INTEGER[] DEFAULT ARRAY[]::INTEGER[],
    "graceDays" INTEGER NOT NULL DEFAULT 0,
    "generatedThrough" DATE,
    "archivedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Bill_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Occurrence" (
    "id" TEXT NOT NULL,
    "householdId" TEXT NOT NULL,
    "billId" TEXT NOT NULL,
    "propertyId" TEXT NOT NULL,
    "cycleIndex" INTEGER NOT NULL,
    "dueDate" DATE NOT NULL,
    "originalDueDate" DATE,
    "expectedAmount" DECIMAL(12,2) NOT NULL,
    "skippedAt" TIMESTAMP(3),
    "snoozedUntil" DATE,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Occurrence_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Payment" (
    "id" TEXT NOT NULL,
    "householdId" TEXT NOT NULL,
    "occurrenceId" TEXT NOT NULL,
    "billId" TEXT NOT NULL,
    "propertyId" TEXT NOT NULL,
    "payeeId" TEXT NOT NULL,
    "paidOn" DATE NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "paymentMethodId" TEXT,
    "confirmationNumber" TEXT,
    "note" TEXT,
    "undoneAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Payment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CreditCard" (
    "id" TEXT NOT NULL,
    "householdId" TEXT NOT NULL,
    "propertyId" TEXT NOT NULL,
    "billId" TEXT,
    "issuer" TEXT NOT NULL,
    "nickname" TEXT NOT NULL,
    "last4" TEXT NOT NULL,
    "creditLimit" DECIMAL(12,2) NOT NULL,
    "currentBalance" DECIMAL(12,2) NOT NULL,
    "statementDay" INTEGER NOT NULL,
    "dueDay" INTEGER NOT NULL,
    "minimumPayment" DECIMAL(12,2) NOT NULL,
    "apr" DECIMAL(6,3),
    "autopay" BOOLEAN NOT NULL DEFAULT false,
    "archivedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CreditCard_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HouseholdPrefs" (
    "householdId" TEXT NOT NULL,
    "reminderDays" INTEGER[] DEFAULT ARRAY[3, 1, 0]::INTEGER[],
    "digestHour" INTEGER NOT NULL DEFAULT 8,
    "digestMinute" INTEGER NOT NULL DEFAULT 0,
    "dueSoonDays" INTEGER NOT NULL DEFAULT 7,
    "backupDir" TEXT,
    "autoBackup" BOOLEAN NOT NULL DEFAULT true,
    "retention" INTEGER NOT NULL DEFAULT 14,
    "shiftWeekends" "WeekendShift" NOT NULL DEFAULT 'none',
    "lastBackupOn" DATE,

    CONSTRAINT "HouseholdPrefs_pkey" PRIMARY KEY ("householdId")
);

-- CreateTable
CREATE TABLE "PluginState" (
    "id" TEXT NOT NULL,
    "householdId" TEXT NOT NULL,
    "pluginId" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "PluginState_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ReminderDelivery" (
    "id" TEXT NOT NULL,
    "householdId" TEXT NOT NULL,
    "dedupeKey" TEXT NOT NULL,
    "occurrenceId" TEXT,
    "billId" TEXT,
    "kind" TEXT NOT NULL,
    "offsetDays" INTEGER NOT NULL DEFAULT 0,
    "channel" TEXT NOT NULL,
    "sentAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ReminderDelivery_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Payee_householdId_name_idx" ON "Payee"("householdId", "name");

-- CreateIndex
CREATE INDEX "Bill_householdId_archivedAt_idx" ON "Bill"("householdId", "archivedAt");

-- CreateIndex
CREATE INDEX "Bill_propertyId_idx" ON "Bill"("propertyId");

-- CreateIndex
CREATE INDEX "Bill_payeeId_idx" ON "Bill"("payeeId");

-- CreateIndex
CREATE INDEX "Bill_categoryId_idx" ON "Bill"("categoryId");

-- CreateIndex
CREATE INDEX "Occurrence_householdId_dueDate_idx" ON "Occurrence"("householdId", "dueDate");

-- CreateIndex
CREATE INDEX "Occurrence_propertyId_dueDate_idx" ON "Occurrence"("propertyId", "dueDate");

-- CreateIndex
CREATE UNIQUE INDEX "Occurrence_billId_cycleIndex_key" ON "Occurrence"("billId", "cycleIndex");

-- CreateIndex
CREATE INDEX "Payment_householdId_paidOn_idx" ON "Payment"("householdId", "paidOn");

-- CreateIndex
CREATE INDEX "Payment_billId_idx" ON "Payment"("billId");

-- CreateIndex
CREATE INDEX "Payment_payeeId_idx" ON "Payment"("payeeId");

-- CreateIndex
CREATE INDEX "Payment_propertyId_idx" ON "Payment"("propertyId");

-- CreateIndex
CREATE INDEX "Payment_occurrenceId_idx" ON "Payment"("occurrenceId");

-- CreateIndex
CREATE UNIQUE INDEX "CreditCard_billId_key" ON "CreditCard"("billId");

-- CreateIndex
CREATE INDEX "CreditCard_householdId_idx" ON "CreditCard"("householdId");

-- CreateIndex
CREATE INDEX "CreditCard_propertyId_idx" ON "CreditCard"("propertyId");

-- CreateIndex
CREATE UNIQUE INDEX "PluginState_householdId_pluginId_key" ON "PluginState"("householdId", "pluginId");

-- CreateIndex
CREATE UNIQUE INDEX "ReminderDelivery_dedupeKey_key" ON "ReminderDelivery"("dedupeKey");

-- CreateIndex
CREATE INDEX "ReminderDelivery_householdId_kind_idx" ON "ReminderDelivery"("householdId", "kind");

-- AddForeignKey
ALTER TABLE "Payee" ADD CONSTRAINT "Payee_householdId_fkey" FOREIGN KEY ("householdId") REFERENCES "Household"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Payee" ADD CONSTRAINT "Payee_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "Category"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Bill" ADD CONSTRAINT "Bill_householdId_fkey" FOREIGN KEY ("householdId") REFERENCES "Household"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Bill" ADD CONSTRAINT "Bill_payeeId_fkey" FOREIGN KEY ("payeeId") REFERENCES "Payee"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Bill" ADD CONSTRAINT "Bill_propertyId_fkey" FOREIGN KEY ("propertyId") REFERENCES "Property"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Bill" ADD CONSTRAINT "Bill_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "Category"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Bill" ADD CONSTRAINT "Bill_paymentMethodId_fkey" FOREIGN KEY ("paymentMethodId") REFERENCES "PaymentMethod"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Occurrence" ADD CONSTRAINT "Occurrence_householdId_fkey" FOREIGN KEY ("householdId") REFERENCES "Household"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Occurrence" ADD CONSTRAINT "Occurrence_billId_fkey" FOREIGN KEY ("billId") REFERENCES "Bill"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Occurrence" ADD CONSTRAINT "Occurrence_propertyId_fkey" FOREIGN KEY ("propertyId") REFERENCES "Property"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_householdId_fkey" FOREIGN KEY ("householdId") REFERENCES "Household"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_occurrenceId_fkey" FOREIGN KEY ("occurrenceId") REFERENCES "Occurrence"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_billId_fkey" FOREIGN KEY ("billId") REFERENCES "Bill"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_propertyId_fkey" FOREIGN KEY ("propertyId") REFERENCES "Property"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_payeeId_fkey" FOREIGN KEY ("payeeId") REFERENCES "Payee"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_paymentMethodId_fkey" FOREIGN KEY ("paymentMethodId") REFERENCES "PaymentMethod"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CreditCard" ADD CONSTRAINT "CreditCard_householdId_fkey" FOREIGN KEY ("householdId") REFERENCES "Household"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CreditCard" ADD CONSTRAINT "CreditCard_propertyId_fkey" FOREIGN KEY ("propertyId") REFERENCES "Property"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CreditCard" ADD CONSTRAINT "CreditCard_billId_fkey" FOREIGN KEY ("billId") REFERENCES "Bill"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HouseholdPrefs" ADD CONSTRAINT "HouseholdPrefs_householdId_fkey" FOREIGN KEY ("householdId") REFERENCES "Household"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PluginState" ADD CONSTRAINT "PluginState_householdId_fkey" FOREIGN KEY ("householdId") REFERENCES "Household"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReminderDelivery" ADD CONSTRAINT "ReminderDelivery_householdId_fkey" FOREIGN KEY ("householdId") REFERENCES "Household"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReminderDelivery" ADD CONSTRAINT "ReminderDelivery_occurrenceId_fkey" FOREIGN KEY ("occurrenceId") REFERENCES "Occurrence"("id") ON DELETE CASCADE ON UPDATE CASCADE;

