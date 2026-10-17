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

- `DATABASE_URL` and `DIRECT_URL` — locally these can be the same URL
- `AUTH_SECRET` — `openssl rand -hex 32`
- `APP_PASSWORD` — the one password for the app

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

Open [http://127.0.0.1:3847](http://127.0.0.1:3847). Sign in with `APP_PASSWORD`.

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

## Deploy on Vercel + Neon (free tier)

1. Create a [Neon](https://neon.tech) project on the free plan. Copy the **pooled** connection string and the **direct** connection string.
2. Push this repo to GitHub (or GitLab) and import it in [Vercel](https://vercel.com) on the Hobby plan. Framework preset: Next.js.
3. Set environment variables on the Vercel project:

   | Name | Value |
   | --- | --- |
   | `DATABASE_URL` | Neon **pooled** URL (`-pooler` host) |
   | `DIRECT_URL` | Neon **direct** URL (no pooler). Migrations use this. |
   | `AUTH_SECRET` | `openssl rand -hex 32` |
   | `APP_PASSWORD` | A long password only you know |

4. Leave the build command as `npm run build`. That runs `prisma migrate deploy` before `next build`, so the free database is migrated on deploy. The database must be reachable from Vercel's build network (Neon is).
5. Deploy. Open the Vercel URL and sign in with `APP_PASSWORD`.

There is no public registration. The password check is the whole login. The session is an HttpOnly cookie. Do not commit `.env`.

On an Android phone, open the site in Chrome and use the menu item **Install app** or **Add to Home screen**. The installed name is Billboard.

## API

The web app talks to versioned JSON routes under `/api/v1`. A later Android client can use the same routes. Send the session cookie, or sign in with `POST /api/v1/auth/login` and keep the `billboard_session` cookie.

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

Recurring bills, due dates, reminder screens, occupancy history for the January 2027 move, and Schedule E tax exports are intentionally left for later. The database already has tables for people, vehicles, occupancy periods, payer splits, and reminder settings so those screens can be added without a new tenant model. Billboard v1 only records expenses you enter.
