# Billboard

Billboard is a private household expense tracker. You log what was paid, see this month and the year so far, and export a CSV. Properties, categories, and payment methods are edited in Settings. The seed data is only a starting set.

Dates are calendar days in `America/Chicago`. Amounts are USD. Nothing here connects to a bank, stores a card number, or moves money.

## Local setup

You need Node.js 22+ and Postgres 16.

```bash
npm install
cp .env.example .env
```

Edit `.env`:

- `DATABASE_URL` and `DIRECT_URL` — locally these can be the same URL. On Supabase they are the pooled and session URLs below.
- `AUTH_SECRET` — `openssl rand -hex 32`. This signs the session cookie. It is not a Supabase secret.
- `APP_PASSWORD` — the one password the whole family shares. There are no accounts and no roles.

### Database with Docker

```bash
docker compose up -d
```

That starts Postgres on port 5432 with user `billboard`, password `billboard`, database `billboard`, which matches `.env.example`.

### Database without Docker

These are the steps used to run Billboard in a plain Ubuntu environment:

```bash
sudo apt-get update
sudo apt-get install -y postgresql postgresql-contrib
sudo pg_ctlcluster 16 main start
sudo -u postgres psql <<'SQL'
CREATE ROLE billboard LOGIN PASSWORD 'billboard' CREATEDB;
CREATE DATABASE billboard OWNER billboard;
SQL
```

`CREATEDB` is only so Prisma can create a shadow database during `prisma migrate dev`. Production deploys use `prisma migrate deploy` and do not need it.

### Migrate, seed, run

```bash
npx prisma migrate deploy
npm run db:seed
npm run dev
```

Open [http://127.0.0.1:3847](http://127.0.0.1:3847). Anyone in the household signs in with the same `APP_PASSWORD`.

`npm run db:seed` creates a starting set you can rename, archive, reorder, or delete in Settings:

- **Little Elm Home**, **Celina Home**, and **Personal**
- Starter categories (Mortgage, HOA, Property Tax, and the rest)
- Payment methods such as Cash, Check, ACH, and Chase with last 4 `4421`
- A handful of sample expenses whose payees start with `SAMPLE ·`

Re-running the seed does not rename rows you have edited. It only fills in a seed key that is missing, and it replaces the sample expenses. Clear samples without touching real expenses:

```bash
npm run db:clear-samples
```

Or use **Clear sample expenses** in Settings.

## Scripts

| Script | What it does |
| --- | --- |
| `npm run dev` | Dev server on port 3847 |
| `npm run build` | Generate the Prisma client, apply migrations, production build |
| `npm start` | Production server on port 3847 |
| `npm test` | Unit tests plus a database round-trip for create, filter, update, export, and delete |
| `npm run db:migrate` | Create a new migration during development |
| `npm run db:deploy` | Apply committed migrations |
| `npm run db:seed` | Seed starter properties, categories, payment methods, and sample expenses |
| `npm run db:clear-samples` | Delete rows marked as samples |

## Deploy on Vercel + Supabase (free tier)

Postgres is a [Supabase](https://supabase.com) project on the free plan. Prisma is the only database client. Billboard does not use Supabase Auth, the Supabase client, or the anon and service-role keys. The family shares one password (`APP_PASSWORD`). There are no per-person accounts and no roles.

1. Create a Supabase project. In the dashboard, open **Connect** and copy the pooler strings. You do not need to enable Auth.
2. Push this repo to GitHub (or GitLab) and import it in [Vercel](https://vercel.com) on the Hobby plan. Framework preset: Next.js.
3. Set these environment variables on the Vercel project. URL-encode special characters in the database password. Replace `[PROJECT-REF]`, `[PASSWORD]`, and `[REGION]` with the values from the Connect dialog (the host looks like `aws-0-us-east-1.pooler.supabase.com`).

   | Name | Value |
   | --- | --- |
   | `DATABASE_URL` | Shared pooler, **transaction mode**, port **6543**. The running app uses this. Append `?pgbouncer=true&connection_limit=1&sslmode=require`. |
   | `DIRECT_URL` | Shared pooler, **session mode**, port **5432** on that same pooler host. `prisma migrate deploy` uses this. Append `?sslmode=require`. Do not add `pgbouncer=true`. |
   | `AUTH_SECRET` | `openssl rand -hex 32` |
   | `APP_PASSWORD` | The one password the family shares |

   ```text
   DATABASE_URL="postgresql://postgres.[PROJECT-REF]:[PASSWORD]@aws-0-[REGION].pooler.supabase.com:6543/postgres?pgbouncer=true&connection_limit=1&sslmode=require"
   DIRECT_URL="postgresql://postgres.[PROJECT-REF]:[PASSWORD]@aws-0-[REGION].pooler.supabase.com:5432/postgres?sslmode=require"
   ```

   The direct host `db.[PROJECT-REF].supabase.co:5432` is IPv6-only on the free plan. Vercel builds are IPv4, so migrations should use the session pooler above. Use the direct host only from a machine that has IPv6.

4. Leave the build command as `npm run build`. That runs `prisma migrate deploy` (through `DIRECT_URL`) before `next build`. Prisma Client then queries through `DATABASE_URL`.
5. Deploy. Open the Vercel URL. Everyone in the household signs in with `APP_PASSWORD`.

There is no public registration and no second login. The password check is the whole login. The session is an HttpOnly cookie. Do not commit `.env`.

On an Android phone, open the site in Chrome and use the menu item **Install app** or **Add to Home screen**. The installed name is Billboard.

## API

The web app talks to versioned JSON routes under `/api/v1`. A later Android client can use the same routes and the same shared password. Send the session cookie, or sign in with `POST /api/v1/auth/login` and keep the `billboard_session` cookie. That cookie is the household session, not a user account.

| Method | Path | Purpose |
| --- | --- | --- |
| `POST` | `/api/v1/auth/login` | `{ "password" }` sets the session cookie |
| `POST` | `/api/v1/auth/logout` | Clears the session |
| `GET` | `/api/v1/auth/session` | `{ authenticated, today, timezone }` |
| `GET`, `POST` | `/api/v1/properties` | List or add a property (`name`, optional `address` and `notes`) |
| `PATCH`, `DELETE` | `/api/v1/properties/:id` | Update, archive (`archived: true`), or delete |
| `POST` | `/api/v1/properties/reorder` | `{ "ids" }` in display order, including archived rows |
| `POST` | `/api/v1/properties/:id/reassign` | `{ "toId" }` moves expenses, then deletes the source |
| `GET`, `POST` | `/api/v1/categories` | List or add a category |
| `PATCH`, `DELETE` | `/api/v1/categories/:id` | Rename, archive, or delete |
| `POST` | `/api/v1/categories/reorder` | `{ "ids" }` |
| `POST` | `/api/v1/categories/:id/reassign` | `{ "toId" }` moves expenses, then deletes the source |
| `GET`, `POST` | `/api/v1/payment-methods` | List or add (`nickname`, optional `last4`) |
| `PATCH`, `DELETE` | `/api/v1/payment-methods/:id` | Update, archive, or delete |
| `POST` | `/api/v1/payment-methods/reorder` | `{ "ids" }` |
| `POST` | `/api/v1/payment-methods/:id/reassign` | `{ "toId" }` moves expenses, then deletes the source |
| `GET`, `POST` | `/api/v1/expenses` | List or create. Query: `propertyId`, `categoryId`, `from`, `to`, `q`, `cursor`, `limit` |
| `GET`, `PATCH`, `DELETE` | `/api/v1/expenses/:id` | Read, replace, or delete one expense |
| `GET` | `/api/v1/reports/summary` | This month, year to date, category breakdown, monthly trend |
| `GET` | `/api/v1/exports/expenses` | CSV of the same filters as the list |
| `GET`, `DELETE` | `/api/v1/sample-expenses` | Count or clear sample rows |

Dates are `YYYY-MM-DD`. Amounts are decimal strings such as `"142.18"`. An expense points at a payment method id. Creating a payment method rejects a full card or account number. A nickname and last 4 (`Chase`, `4421`) is stored and shown as `Chase ••4421`.

Deleting a property, category, or payment method that still has expenses returns `409` with code `in_use`. Archive it, or reassign the expenses, instead of leaving them without a home.

Errors look like `{ "error": { "code", "message", "fieldErrors"? } }`.

## Not in this version

Recurring bills, due dates, reminder screens, occupancy history for the January 2027 move, and Schedule E tax exports are intentionally left for later. The database already has tables for people, vehicles, occupancy periods, payer splits, and reminder settings so those screens can be added without a new tenant model. A person row, when that screen exists, is a name on the ledger. It is not a login and it has no role. Billboard v1 only records expenses the household enters.
