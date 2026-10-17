# BillBoard

BillBoard is a private household ledger for the Mac. It runs on your computer, locks with a password (and Touch ID when the Mac offers it), and keeps the books in your Supabase project. Properties, categories, payment methods, and the expense log work today. Due dates, reminders, and credit cards are later steps.

Dates are calendar days in `America/Chicago`. Amounts are USD. Nothing here connects to a bank, stores a card number, or moves money.

## Local setup

These steps are the same on Windows and macOS. You do not install Postgres, and you do not need Docker. The database is a free [Supabase](https://supabase.com) project. BillBoard reaches it through Prisma. Leave Supabase Auth off. In the browser, the family shares one password. The Mac app uses its own lock password instead.

### 1. Install Node.js

Install Node.js 22 or newer from [nodejs.org](https://nodejs.org) (the LTS installer is fine). Quit and reopen the terminal afterward so `node` and `npm` are on your path.

Check the install:

```bash
node -v
npm -v
```

`node -v` should print `v22` or higher.

### 2. Create the free database

1. Sign in at [supabase.com](https://supabase.com/dashboard) and create a project on the free plan. Pick a database password and save it. You will not find it again in the dashboard.
2. Wait until the project finishes starting. Open **Connect**.
3. Copy the **transaction** pooler string (port **6543**) and the **session** pooler string (port **5432**, same pooler host). You do not need the anon key or the service role key.

If the database password contains characters such as `@`, `#`, `%`, or `/`, replace each one in the URL with its percent-encoding (`@` becomes `%40`, `#` becomes `%23`, `%` becomes `%25`, `/` becomes `%2F`). A password of `p@ss` that is not encoded makes Prisma fail to connect.

### 3. Create `.env`

In the project folder, copy the example file.

macOS or Linux Terminal:

```bash
cp .env.example .env
```

Windows PowerShell:

```powershell
Copy-Item .env.example .env
```

Open `.env` in any text editor and set four values:

| Name | What to put |
| --- | --- |
| `DATABASE_URL` | The transaction pooler string, port **6543**, with `?pgbouncer=true&connection_limit=1&sslmode=require` on the end. The app uses this while it is running. |
| `DIRECT_URL` | The session pooler string, port **5432**, with `?sslmode=require` on the end. Do not add `pgbouncer=true`. Migrations use this. |
| `AUTH_SECRET` | A long random string, at least 16 characters. It signs the login cookie. It is not a Supabase secret. |
| `APP_PASSWORD` | The one password the whole family will type. There are no accounts and no roles. |

```text
DATABASE_URL="postgresql://postgres.[PROJECT-REF]:[PASSWORD]@aws-0-[REGION].pooler.supabase.com:6543/postgres?pgbouncer=true&connection_limit=1&sslmode=require"
DIRECT_URL="postgresql://postgres.[PROJECT-REF]:[PASSWORD]@aws-0-[REGION].pooler.supabase.com:5432/postgres?sslmode=require"
```

Replace `[PROJECT-REF]`, `[PASSWORD]`, and `[REGION]` with the values from the Connect dialog. The host looks like `aws-0-us-east-1.pooler.supabase.com`.

To make `AUTH_SECRET` on macOS or Linux:

```bash
openssl rand -hex 32
```

On Windows PowerShell:

```powershell
-join ((1..32 | ForEach-Object { '{0:x2}' -f (Get-Random -Maximum 256) }))
```

Do not commit `.env`. It holds the database password and the family password.

### 4. Install, create the tables, and run

From the project folder:

```bash
npm install
npx prisma migrate deploy
npm run db:seed
npm run dev
```

`prisma migrate deploy` uses `DIRECT_URL` and creates the tables. The seed adds a starter set you can change later. Then open [http://127.0.0.1:3847](http://127.0.0.1:3847). Anyone in the household signs in with `APP_PASSWORD`.

Stop the app with Ctrl+C in that terminal.

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

### Optional: Postgres in Docker

If Docker Desktop is already installed, you can skip Supabase for local work. Leave `DATABASE_URL` and `DIRECT_URL` as the values in `.env.example` (they are the same local URL), then:

```bash
docker compose up -d
npx prisma migrate deploy
npm run db:seed
npm run dev
```

That starts Postgres on port 5432 with user `billboard`, password `billboard`, and database `billboard`.

## Mac app

On your Mac (Apple Silicon), from this folder:

```bash
npm install
cp .env.example .env
```

Edit `.env` with the Supabase URLs from the section above. URL-encode special characters in the database password (`@` is `%40`). Then:

```bash
npx prisma migrate deploy
npm run db:seed
npm run desktop:dev
```

If you already have the desktop app running, stop it, then:

```bash
git pull
npm install
npx prisma migrate deploy
npm run db:seed
npm run desktop:dev
```

`db:seed` updates the three properties and categories. It does not add sample bills. It removes expenses that were marked as samples.

`desktop:dev` compiles the Electron shell and starts the production Next.js server on port 3921. The first window asks you to create a lock password. That password is hashed and stored in BillBoard’s app data, sealed with the macOS Keychain when the system allows it. It is not `APP_PASSWORD`. `APP_PASSWORD` is only for the browser at `npm run dev`.

The menu bar icon stays after you close the window. Open BillBoard, Lock, and Quit are on that icon. In Settings, on this Mac, you can change the idle lock (default 10 minutes) and turn on launch at login. The app also locks when the Mac sleeps or the screen locks.

Build an unsigned Apple Silicon app:

```bash
npm run desktop:build
```

The disk image is `dist/BillBoard-0.1.0-arm64.dmg`. The first time you open it, right-click the app and choose Open, because it is not signed. The packaged app does not read `.env`. The first window asks for `DATABASE_URL`, `DIRECT_URL`, and `AUTH_SECRET`, or you can import an existing `.env` file. Those values are stored with Electron `safeStorage` (the macOS Keychain).

The database is still Supabase, encrypted at rest by Supabase. A local SQLCipher store can be added later behind `src/core/ledger-store.ts`. It is not built yet.

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
| `npm run desktop:dev` | Mac (or Linux) app shell around the production server |
| `npm run desktop:build` | Unsigned macOS arm64 `.dmg` on a Mac; a Linux folder build elsewhere |

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

On an Android phone, open the site in Chrome and use the menu item **Install app** or **Add to Home screen**. The installed name is BillBoard. The Mac app is the one Deepak runs day to day.

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

## MVP checklist

Step 1 is the Mac shell. Steps 2–11 are the due-date MVP:

- Properties have a type, status, and optional role-change date. Little Elm Home is primary until January 2027, then a rental. Celina Home becomes primary in January 2027. Personal is the tag for bills that are not a home. The header filter applies to the board, calendar, list, and cards.
- Bills and payees can be added, edited, duplicated, archived, and deleted. Amounts are fixed, variable, or estimated. Only the last 4 digits of an account are stored.
- Recurrence covers weekly, every two weeks, monthly (including the last day), quarterly, twice a year, yearly, every N days/weeks/months, and one-time. A single date can be skipped or moved. Weekends can stay, move earlier, or move later.
- Mark a due date paid, including a partial amount, and undo it. History is on the bill.
- Credit cards show the next statement date, next due date, balance, and utilization. Each card creates a monthly bill.
- The home screen is overdue, due today, the next 7 days, and the next 30 days, plus this month's paid-versus-due totals.
- Reminders default to 3 days before, 1 day before, and the due day. The menu-bar app checks every few minutes and on wake, shows a macOS notification (Mark paid and Snooze 1 day where the system allows it), and badges the overdue count. A daily summary defaults to 8:00 AM. SMS stays off.
- Settings exports an AES-256-GCM backup (password, scrypt) and restores it by merge or replace. CSV export covers bills, payments, and cards. CSV import previews the column mapping.
- Plugins register on an internal event bus. The sample JSON bills importer lives in `plugins/sample-json-bills` and can be turned off in Settings.

Still later: loans, cash-flow forecasts, payoff planner, bank connections, SQLCipher, email/push/SMS delivery, and signed Mac builds.

## Not in this version

Loans, cash-flow forecasts, a payoff planner, bank connections, receipt files, SQLCipher, and email, push, or SMS delivery. The Supabase tables for people, vehicles, occupancy, and payer splits have no screens yet. A person row is a name on the ledger, not a login.
