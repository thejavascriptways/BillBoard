# BillBoard

BillBoard is a private household ledger for the Mac. It runs on your computer, locks with a password (and Touch ID when the Mac offers it), and keeps the books in a Google Sheet named BillBoard inside a Drive folder of the same name. The Due board, Utilities, credit cards, expenses, and spending are in the app. Configuration holds the master lists behind the dropdowns. Settings is for the Google sheet, the lock, reminders, backup, and plugins.

Dates are calendar days in `America/Chicago`. Amounts are USD. Nothing here connects to a bank, stores a card number, or moves money.

The sheet is the only database. Postgres is used once, by Copy from Supabase, if you already have rows there.

## Local setup

These steps are the same on Windows and macOS. You do not install Postgres, and you do not need Docker. In the browser, the family shares one password. The Mac app uses its own lock password instead.

### 1. Install Node.js

Install Node.js 22 or newer from [nodejs.org](https://nodejs.org) (the LTS installer is fine). Quit and reopen the terminal afterward so `node` and `npm` are on your path.

Check the install:

```bash
node -v
npm -v
```

`node -v` should print `v22` or higher.

### 2. Create the Google Cloud project

Do this once. The OAuth client is a Desktop app. The only Drive scope is `https://www.googleapis.com/auth/drive.file`, which is non-sensitive, so the app can be published to Production without Google's verification review. Refresh tokens from that scope do not expire after 7 days.

1. Open [Google Cloud Console](https://console.cloud.google.com/) and create a project, for example `BillBoard`.
2. Enable **Google Sheets API** and **Google Drive API**.
3. Open **APIs & Services → OAuth consent screen**. Choose **External**. Add the app name `BillBoard` and your email as the support contact. On Scopes, add only `https://www.googleapis.com/auth/drive.file`, plus `openid` and `email` so Settings can show the signed-in account. Add yourself as a test user if the screen is still in Testing. Then **Publish** the app to **Production**.
4. Open **APIs & Services → Credentials → Create credentials → OAuth client ID**. Application type: **Desktop app**. Name it `BillBoard`. Copy the client id and client secret. They stay in the macOS Keychain. Do not commit them.
5. Optional: create an API key restricted to the Google Picker API if you want to re-select an existing spreadsheet after a reinstall. Without it, Settings lists spreadsheets this app created and accepts a pasted spreadsheet id.

On first sign-in the app creates a Drive folder named `BillBoard` in My Drive, then a spreadsheet named `BillBoard` inside that folder, then the tabs. Encrypted backups can also go in a `Backups` folder inside that folder. That toggle is on by default, and the local backup folder is unchanged.

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

Open `.env` in any text editor and set two values:

| Name | What to put |
| --- | --- |
| `AUTH_SECRET` | A long random string, at least 16 characters. It signs the login cookie. |
| `APP_PASSWORD` | The one password the whole family will type in the browser. There are no accounts and no roles. |

The OAuth client id, client secret, and refresh token are entered in the app and stored with Electron `safeStorage`. They are not environment variables.

To make `AUTH_SECRET` on macOS or Linux:

```bash
openssl rand -hex 32
```

On Windows PowerShell:

```powershell
-join ((1..32 | ForEach-Object { '{0:x2}' -f (Get-Random -Maximum 256) }))
```

Do not commit `.env`. It holds the family password.

### 4. Install and run

From the project folder:

```bash
npm install
npm run dev
```

Open [http://127.0.0.1:3847](http://127.0.0.1:3847). Anyone in the household signs in with `APP_PASSWORD`. Open Settings → Data, enter the desktop OAuth client id and secret, and sign in. On this dev server, without the Mac shell, Sign in creates a practice sheet on this computer so you can click through the screens. The Mac app opens Google in the system browser.

Stop the app with Ctrl+C in that terminal.

A fresh practice sheet starts with homes and categories you can rename, archive, reorder, or delete:

- **Little Elm Home**, **Celina Home**, and **Personal**
- Starter categories (Mortgage, HOA, Property Tax, and the rest)
- Payment methods such as Cash, Check, ACH, and Chase with last 4 `4421`
- A handful of sample expenses whose payees start with `SAMPLE ·`

Re-running the seed does not rename rows you have edited. It only fills in a seed key that is missing, and it replaces the sample expenses. Clear samples without touching real expenses:

```bash
npm run db:clear-samples
```

Or use **Clear sample expenses** in Settings.

### Copy an existing Supabase database once

If the household already has rows in Postgres, put `DATABASE_URL` (and `DIRECT_URL`, if it differs) back in `.env` for this command only. Sign in under Settings → Data first so the BillBoard spreadsheet exists, then either click **Copy from Supabase** or run:

```bash
npm run migrate:supabase-to-sheet
```

The copy keeps ids when the sheet row is new. A starter home, category, person, payee, or label with the same slug or name is updated in place, and later rows point at that sheet id. Running it again does not add a second Little Elm. After the copy, the app never reads Postgres. You can remove `DATABASE_URL` from `.env`.

## Mac app

On your Mac (Apple Silicon), from this folder:

```bash
npm install
cp .env.example .env
```

Edit `.env` with `AUTH_SECRET` and `APP_PASSWORD`. Then:

```bash
npm run desktop:dev
```

If you already have the desktop app running, stop it, then:

```bash
git pull
npm install
npm run desktop:dev
```

`desktop:dev` compiles the Electron shell and starts the production Next.js server on port 3921. The first window asks you to create a lock password. That password is hashed and stored in BillBoard’s app data, sealed with the macOS Keychain when the system allows it. It is not `APP_PASSWORD`. `APP_PASSWORD` is only for the browser at `npm run dev`.

Unlock, open Settings → Data, paste the desktop OAuth client id and secret, and choose Sign in with Google. The system browser returns to a loopback page on `127.0.0.1`. BillBoard creates the Drive folder and the spreadsheet, or reuses them if they are still there. If either was deleted, Settings offers to recreate it. To attach a sheet after a reinstall, use the Picker or paste the spreadsheet id.

The menu bar icon stays after you close the window. Open BillBoard, Lock, and Quit are on that icon. In Settings, on this Mac, you can change the idle lock (default 10 minutes) and turn on launch at login. The app also locks when the Mac sleeps or the screen locks. While the window is open, BillBoard reloads sheet edits about once a minute and again when the Mac wakes.

Build an unsigned Apple Silicon app:

```bash
npm run desktop:build
```

The disk image is `dist/BillBoard-0.1.0-arm64.dmg`. The first time you open it, right-click the app and choose Open, because it is not signed. The packaged app does not read `.env`. The first window asks for `AUTH_SECRET` (and an optional `APP_PASSWORD`), or you can import an existing `.env` file. Those values are stored with Electron `safeStorage` (the macOS Keychain). Google credentials are stored the same way the first time you sign in.

## Scripts

| Script | What it does |
| --- | --- |
| `npm run dev` | Dev server on port 3847 |
| `npm run build` | Production build. No database is required. |
| `npm start` | Production server on port 3847 |
| `npm test` | Unit tests plus a database round-trip for create, filter, update, export, and delete |
| `npm run migrate:supabase-to-sheet` | One-time copy from Postgres into the sheet. Needs `DATABASE_URL`. |
| `npm run db:seed` | Fill starter homes and categories in the local practice store |
| `npm run db:clear-samples` | Delete rows marked as samples |
| `npm run desktop:dev` | Mac (or Linux) app shell around the production server |
| `npm run desktop:build` | Unsigned macOS arm64 `.dmg` on a Mac; a Linux folder build elsewhere |

## Where it runs

BillBoard runs on the Mac, and `npm run dev` serves the same screens at `http://127.0.0.1:3847`. There is no hosted database. `AUTH_SECRET` and `APP_PASSWORD` are the only values the server needs. Google credentials stay in the Keychain.

There is no public registration and no second login. The password check is the whole login. The session is an HttpOnly cookie. Do not commit `.env`.

On an Android phone, the day-to-day app is the Mac. The browser on the same computer can be installed from Chrome with **Install app** or **Add to Home screen**. The installed name is BillBoard.

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
- The Utilities tab lists utility bills for one home and month. Last 4 digits only. Other bills stay available with Show other bills, and the Due tab still tracks all of them.
- Recurrence covers weekly, every two weeks, monthly (including the last day), quarterly, twice a year, yearly, every N days/weeks/months, and one-time. A single date can be skipped or moved. Weekends can stay, move earlier, or move later.
- Mark a due date paid, including a partial amount, and undo it. History is on the bill.
- Credit cards store the last 4 digits. Issuer, nickname, statement day, due day, cardholder, home, and autopay are optional. With no due day, the card does not create a reminder. Balance, limit, minimum, and APR are not collected.
- The home screen is overdue, due today, the next 7 days, and the next 30 days, plus this month's paid-versus-due totals.
- Reminders default to 3 days before, 1 day before, and the due day. The menu-bar app checks every few minutes and on wake, shows a macOS notification (Mark paid and Snooze 1 day where the system allows it), and badges the overdue count. A daily summary defaults to 8:00 AM. SMS stays off.
- Settings exports an AES-256-GCM backup (password, scrypt) and restores it by merge or replace. CSV export covers bills, payments, and cards. CSV import previews the column mapping.
- Plugins register on an internal event bus. The sample JSON bills importer lives in `plugins/sample-json-bills` and can be turned off in Settings.
- This month is a checklist, not a spreadsheet. Each bill has one amount, paid date, and status per month. Statuses include done, not done, failed, not applicable, included in another bill, skipped, and pending confirmation. $0.00 is kept separate from a blank cell. N/A and included rows are left out of totals and reminders. Payment modes are auto paid, manual, by check, paid in paycheck, and paid through another bill.
- Default groups are Household, Insurance, Loans and overdrafts, Credit Cards, Kids' classes and fees, Medical, and Other. They have colors and can contain subgroups. People are a shared list used as cardholders and on medical bills.
- Months roll forward on their own. Fixed bills keep their amount. Variable bills ask for the actual. Archived months are read-only. A year-matrix CSV is in Settings. Workbook (.xlsx) import is not in this version.

Still later: loans, cash-flow forecasts, payoff planner, bank connections, email/push/SMS delivery, and signed Mac builds.

## Not in this version

Loans, cash-flow forecasts, a payoff planner, bank connections, receipt files, and email, push, or SMS delivery. People, vehicles, occupancy, and payer splits are stored on the sheet and have no screens yet. A person row is a name on the ledger, not a login.

Family edits in the Google Sheet show up in the app within about a minute, or when the window is focused. If someone changes a cell and leaves Updated at alone, the sheet still wins. If the app and the sheet both change the same row, the later Updated at wins. A row the app cannot read is listed under Settings → Data → Sheet issues and is skipped. Offline, the last copy opens from an encrypted cache on this computer and new edits wait in a banner: “Offline, N changes pending.” The sheet remains the source of truth when the computer is online again.
