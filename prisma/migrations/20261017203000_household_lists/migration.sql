-- CreateEnum
CREATE TYPE "OccupancyUse" AS ENUM ('primary_residence', 'second_home', 'rental', 'vacant_for_rent', 'under_construction', 'personal');

-- AlterTable
ALTER TABLE "Category" ADD COLUMN "archivedAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "Property" DROP COLUMN "isSystem",
ADD COLUMN "address" TEXT,
ADD COLUMN "archivedAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "PaymentMethod" (
    "id" TEXT NOT NULL,
    "householdId" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "nickname" TEXT NOT NULL,
    "last4" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "archivedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PaymentMethod_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Person" (
    "id" TEXT NOT NULL,
    "householdId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "notes" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "archivedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Person_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Vehicle" (
    "id" TEXT NOT NULL,
    "householdId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "notes" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "archivedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Vehicle_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OccupancyPeriod" (
    "id" TEXT NOT NULL,
    "householdId" TEXT NOT NULL,
    "propertyId" TEXT NOT NULL,
    "use" "OccupancyUse" NOT NULL,
    "startDate" DATE NOT NULL,
    "endDate" DATE,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OccupancyPeriod_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PayerSplit" (
    "id" TEXT NOT NULL,
    "householdId" TEXT NOT NULL,
    "name" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PayerSplit_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PayerSplitShare" (
    "id" TEXT NOT NULL,
    "splitId" TEXT NOT NULL,
    "personId" TEXT NOT NULL,
    "shareBps" INTEGER NOT NULL,
    "notes" TEXT,

    CONSTRAINT "PayerSplitShare_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ReminderSetting" (
    "id" TEXT NOT NULL,
    "householdId" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "leadDays" INTEGER[] DEFAULT ARRAY[]::INTEGER[],
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ReminderSetting_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PaymentMethod_householdId_sortOrder_idx" ON "PaymentMethod"("householdId", "sortOrder");

-- CreateIndex
CREATE UNIQUE INDEX "PaymentMethod_householdId_slug_key" ON "PaymentMethod"("householdId", "slug");

-- CreateIndex
CREATE INDEX "Person_householdId_sortOrder_idx" ON "Person"("householdId", "sortOrder");

-- CreateIndex
CREATE UNIQUE INDEX "Person_householdId_name_key" ON "Person"("householdId", "name");

-- CreateIndex
CREATE INDEX "Vehicle_householdId_sortOrder_idx" ON "Vehicle"("householdId", "sortOrder");

-- CreateIndex
CREATE UNIQUE INDEX "Vehicle_householdId_name_key" ON "Vehicle"("householdId", "name");

-- CreateIndex
CREATE INDEX "OccupancyPeriod_householdId_idx" ON "OccupancyPeriod"("householdId");

-- CreateIndex
CREATE INDEX "OccupancyPeriod_propertyId_startDate_idx" ON "OccupancyPeriod"("propertyId", "startDate");

-- CreateIndex
CREATE INDEX "PayerSplit_householdId_idx" ON "PayerSplit"("householdId");

-- CreateIndex
CREATE UNIQUE INDEX "PayerSplitShare_splitId_personId_key" ON "PayerSplitShare"("splitId", "personId");

-- CreateIndex
CREATE INDEX "ReminderSetting_householdId_idx" ON "ReminderSetting"("householdId");

-- AddForeignKey
ALTER TABLE "PaymentMethod" ADD CONSTRAINT "PaymentMethod_householdId_fkey" FOREIGN KEY ("householdId") REFERENCES "Household"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Person" ADD CONSTRAINT "Person_householdId_fkey" FOREIGN KEY ("householdId") REFERENCES "Household"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Vehicle" ADD CONSTRAINT "Vehicle_householdId_fkey" FOREIGN KEY ("householdId") REFERENCES "Household"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OccupancyPeriod" ADD CONSTRAINT "OccupancyPeriod_householdId_fkey" FOREIGN KEY ("householdId") REFERENCES "Household"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OccupancyPeriod" ADD CONSTRAINT "OccupancyPeriod_propertyId_fkey" FOREIGN KEY ("propertyId") REFERENCES "Property"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PayerSplit" ADD CONSTRAINT "PayerSplit_householdId_fkey" FOREIGN KEY ("householdId") REFERENCES "Household"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PayerSplitShare" ADD CONSTRAINT "PayerSplitShare_splitId_fkey" FOREIGN KEY ("splitId") REFERENCES "PayerSplit"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PayerSplitShare" ADD CONSTRAINT "PayerSplitShare_personId_fkey" FOREIGN KEY ("personId") REFERENCES "Person"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReminderSetting" ADD CONSTRAINT "ReminderSetting_householdId_fkey" FOREIGN KEY ("householdId") REFERENCES "Household"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Turn free-text payment methods into records, then require the foreign key.
ALTER TABLE "Expense" ADD COLUMN "paymentMethodId" TEXT;

INSERT INTO "PaymentMethod" ("id", "householdId", "slug", "nickname", "last4", "sortOrder", "createdAt", "updatedAt")
SELECT
    md5(parsed."householdId" || '|' || parsed.raw),
    parsed."householdId",
    parsed.slug,
    parsed.nickname,
    parsed.last4,
    parsed.sort_order - 1,
    CURRENT_TIMESTAMP,
    CURRENT_TIMESTAMP
FROM (
    SELECT
        raw_rows."householdId",
        raw_rows.raw,
        CASE WHEN btrim(raw_rows.nickname) = '' THEN raw_rows.raw ELSE raw_rows.nickname END AS nickname,
        raw_rows.last4,
        CASE
            WHEN row_number() OVER (PARTITION BY raw_rows."householdId", raw_rows.base_slug) = 1 THEN raw_rows.base_slug
            ELSE left(raw_rows.base_slug, 40) || '-' || row_number() OVER (PARTITION BY raw_rows."householdId", raw_rows.base_slug)::text
        END AS slug,
        row_number() OVER (PARTITION BY raw_rows."householdId" ORDER BY raw_rows.raw) AS sort_order
    FROM (
        SELECT DISTINCT
            "householdId",
            "paymentMethod" AS raw,
            CASE
                WHEN "paymentMethod" ~ '[^0-9][0-9]{4}$' THEN
                    btrim(regexp_replace("paymentMethod", '[[:space:]•·.*-]*[0-9]{4}$', ''))
                ELSE "paymentMethod"
            END AS nickname,
            CASE
                WHEN "paymentMethod" ~ '[^0-9][0-9]{4}$' THEN
                    substring("paymentMethod" from '[0-9]{4}$')
                ELSE NULL
            END AS last4,
            COALESCE(
                NULLIF(
                    left(
                        trim(both '-' from regexp_replace(
                            lower(
                                CASE
                                    WHEN "paymentMethod" ~ '[^0-9][0-9]{4}$' THEN
                                        btrim(regexp_replace("paymentMethod", '[[:space:]•·.*-]*[0-9]{4}$', ''))
                                        || '-'
                                        || substring("paymentMethod" from '[0-9]{4}$')
                                    ELSE "paymentMethod"
                                END
                            ),
                            '[^a-z0-9]+',
                            '-',
                            'g'
                        )),
                        48
                    ),
                    ''
                ),
                'method'
            ) AS base_slug
        FROM "Expense"
    ) AS raw_rows
) AS parsed;

UPDATE "Expense" AS expense
SET "paymentMethodId" = md5(expense."householdId" || '|' || expense."paymentMethod");

ALTER TABLE "Expense" ALTER COLUMN "paymentMethodId" SET NOT NULL;

ALTER TABLE "Expense" DROP COLUMN "paymentMethod";

-- CreateIndex
CREATE INDEX "Expense_paymentMethodId_idx" ON "Expense"("paymentMethodId");

-- AddForeignKey
ALTER TABLE "Expense" ADD CONSTRAINT "Expense_paymentMethodId_fkey" FOREIGN KEY ("paymentMethodId") REFERENCES "PaymentMethod"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
