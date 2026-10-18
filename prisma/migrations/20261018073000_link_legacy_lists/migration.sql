-- Link free-text values into the master tables. Idempotent. Does not rename existing rows.

UPDATE "Property" SET "typeKey" = "kind"::text WHERE "typeKey" IS NULL;

INSERT INTO "CardIssuer" ("id", "householdId", "name", "sortOrder", "isActive", "createdAt", "updatedAt")
SELECT gen_random_uuid()::text, s."householdId", s.name, 0, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM (
  SELECT DISTINCT "householdId", btrim("issuer") AS name
  FROM "CreditCard"
  WHERE btrim("issuer") <> ''
) AS s
WHERE NOT EXISTS (
  SELECT 1 FROM "CardIssuer" AS existing
  WHERE existing."householdId" = s."householdId" AND lower(existing."name") = lower(s.name)
);

INSERT INTO "Payee" ("id", "householdId", "name", "sortOrder", "isActive", "createdAt", "updatedAt")
SELECT gen_random_uuid()::text, s."householdId", left(s.name, 80), 0, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM (
  SELECT DISTINCT "householdId", btrim("payee") AS name
  FROM "Expense"
  WHERE btrim("payee") <> ''
) AS s
WHERE NOT EXISTS (
  SELECT 1 FROM "Payee" AS existing
  WHERE existing."householdId" = s."householdId" AND lower(existing."name") = lower(left(s.name, 80))
);
