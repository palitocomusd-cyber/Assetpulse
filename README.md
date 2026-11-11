# AssetPulse

Investor dashboard + admin console with **real accounts**, a **server-side ledger**, **PostgreSQL persistence**, **Brevo email**, **PWA install** and **device notifications**.

Everything that used to live in `localStorage` now lives in the database behind an authenticated API, so a user sees the same balance, positions and history on every browser and device.

---

## 1. Stack

| Layer | Choice | Notes |
|---|---|---|
| Runtime | Node 20 | `server.js` (Express) |
| Database | PostgreSQL on Render (`DATABASE_URL`) | falls back to SQLite for local dev |
| Auth | bcrypt password hashes + opaque session tokens in `sessions`, `HttpOnly` cookie | 30-day sessions |
| Email | Brevo REST API (`/v3/smtp/email`) | key stays server-side |
| Realtime-ish | 60 s state poll + per-action state refresh | no websockets needed |
| PWA | `manifest.webmanifest` + `sw.js` | install prompt, lock-screen notifications |
| Chat | Tawk.to widget | offset so it never covers controls |

```
Browser (SPA, public/app.js)
   │  fetch /api/state, /api/action, /api/auth/*
   ▼
Express (server.js)
   ├── session middleware (cookie → sessions table → users row)
   ├── accrual engine (runs per request, writes Earning/Settlement transactions)
   ├── Brevo client (registration / deposit approved / withdrawal approved / broadcast)
   └── pg Pool  ──►  PostgreSQL (or better-sqlite3 locally)
```

---

## 2. Data model

| Table | Purpose |
|---|---|
| `users` | account, bcrypt password hash, PIN hash, KYC status, flags, three balances |
| `sessions` | opaque session token → user, expiry |
| `plans` | allocation plans (rate, term, min/max, risk, active) |
| `positions` | active/completed allocations, accrued yield, source balance |
| `transactions` | immutable ledger: Deposit, Withdrawal, Investment, Earning, Transfer, Settlement, Adjustment |
| `deposits` / `withdrawals` | funding and payout requests with review status |
| `kyc` | identity submissions and decisions |
| `notifications` | in-app notices per user |
| `payment_methods` / `withdraw_networks` | admin-managed funding rails |
| `withdrawal_audit` | admin-only record of withdrawal edits |
| `activity` | admin action log |
| `email_log` | every automatic and broadcast email with status |
| `settings` | maintenance mode, minimum withdrawal, fee |

Schema is created on boot (`db.js` → `migrate()`), and default plans / payment methods / networks / settings are seeded only when those tables are empty. **No demo users are created.**

---

## 3. Accounts

- **Registration** (`POST /api/auth/register`) — hashes the password with bcrypt, creates the user, opens a session, sends the welcome email.
- **The first account created on a fresh database becomes the administrator** (`is_admin = 1`, KYC `Verified`). Every later signup is a normal investor.
- **Login** — `POST /api/auth/login`, constant response for wrong email/password, refuses frozen accounts.
- **Sessions** — random 32-byte token stored in `sessions`, sent as `ap_session` (`HttpOnly`, `SameSite=Lax`, `Secure` over HTTPS). Logout deletes the row.
- **PIN** — separate bcrypt hash, required for invest / withdraw / transfer.
- Removing the demo accounts means there is nothing to reset: delete rows or drop the database to start over.

---

## 4. API

| Method | Path | Purpose |
|---|---|---|
| GET | `/api/config` | public: app URL, needsSetup, email status, active plans |
| POST | `/api/auth/register` | create account (first = admin) |
| POST | `/api/auth/login` | sign in |
| POST | `/api/auth/logout` | destroy session |
| GET | `/api/state` | role-appropriate snapshot (investor: own data, admin: everything) |
| POST | `/api/action` | all mutations, `{ type, ...payload }` |
| GET | `/api/health` | service + DB driver + email config |
| POST | `/api/email/*` | legacy transactional/broadcast endpoints (kept for integrations) |
| POST | `/api/push/subscribe` | Web Push subscription |

`/api/action` types: `invest`, `deposit.create`, `withdraw.create`, `transfer`, `kyc.submit`, `profile.update`, `pin.update`, `notifications.readAll`, and the `admin.*` family (deposit approve/reject, withdrawal approve/reject/edit, kyc approve/reject, user update/freeze, transaction create/update/delete, notification create/update/delete, payment method and network CRUD, plan CRUD, settings, email broadcast).

Each mutation returns the **new state**, so the client never re-derives balances.

---

## 5. Wiring it to a real backend and database

The app is already wired; this section is the map if you want to swap pieces.

1. **Point it at a database** — set `DATABASE_URL` (Render Postgres, Neon, Supabase, RDS…). `db.js` switches driver automatically; no code change. For local SQLite, leave it unset and use `SQLITE_PATH`.
2. **Run migrations** — `db.init()` runs `CREATE TABLE IF NOT EXISTS` for every table on boot. For a real migration history, move `SCHEMA` in `db.js` into numbered `.sql` files and apply them with `node-pg-migrate` or Prisma.
3. **Auth** — sessions are opaque tokens in Postgres, so multiple instances share them without sticky sessions. To use an external identity provider, replace `/api/auth/*` with your IdP callback and map the IdP subject onto `users.id`.
4. **Ledger correctness** — all money changes go through `adjust()` + `addTransaction()`, inside the action handler. If you expect concurrency, move each action into a transaction (`BEGIN … COMMIT`, or `pg` `client.query('BEGIN')`) and lock the user row (`SELECT … FOR UPDATE`) before reading balances.
5. **Accrual** — currently computed on each request from `start_at`/`credited`. For scheduled settlement, run a cron worker on Render (`type: cron`) that calls the same function and update `accrual_watermark`.
6. **Email** — `sendEventEmail()` calls Brevo. Swap the `brevoSend()` body for Postmark/SES/Resend and keep the three call sites (registration, deposit approved, withdrawal approved).
7. **File storage** — KYC currently stores a document *number*. Add S3/R2 upload endpoints and store object keys in `kyc`.
8. **Scaling** — the API is stateless apart from the `sessions` table, so it scales horizontally behind Render. The in-memory Web Push subscriber list is the only process-local state; move it to a table if you run more than one instance.

---

## 6. Deploy to Render (and assetpulse.app)

1. Push this folder to a GitHub repository.
2. Render → **New → Blueprint** → select the repo. `render.yaml` creates:
   - `assetpulse` web service (Node, `npm install --omit=dev`, `node server.js`, health check `/healthz`)
   - `assetpulse-db` PostgreSQL database, wired in as `DATABASE_URL`
3. Set the secrets in the service:
   - `APP_URL=https://assetpulse.app`
   - `BREVO_API_KEY`, `BREVO_SENDER_EMAIL`, optional `BREVO_SENDER_NAME`
   - `VAPID_PUBLIC_KEY` / `VAPID_PRIVATE_KEY` (optional, `npx web-push generate-vapid-keys`)
4. **Custom domain**: Render service → Settings → Custom Domains → add `assetpulse.app` (and `www`), then at your DNS provider:
   - apex `A` record → the IP Render shows (or `ALIAS`/`ANAME` to `assetpulse.onrender.com` if supported)
   - `www` `CNAME` → `assetpulse.onrender.com`
   - Render issues the TLS certificate automatically once DNS resolves.
5. Open the site and register — **the first account becomes the admin**.
6. Share `https://assetpulse.app`; the **Share** button in the nav/footer/dashboard copies it (and offers WhatsApp/Telegram/email/native share).

---

## 7. Email (Brevo)

Automatic email is limited to three events, exactly as specified:

1. account registration successful
2. deposit approved
3. withdrawal approved

Everything else is a manual broadcast from **Admin → Email centre** (all users or a hand-picked selection). Every send is recorded in `email_log` and shown in the admin UI.

Set `BREVO_TEST_MODE=true` to log instead of sending while you set up a verified sender/domain.

---

## 8. PWA and device notifications

- Installable over HTTPS: manifest + service worker + icons.
- **Install** button in the public nav, the dashboard top bar, and a dismissible card that appears after scrolling or entering the dashboard.
- **Enable alerts** requests notification permission, registers the service worker and shows notifications through it — they land in the device notification centre and on the lock screen when the app is installed. Deposits, withdrawals and admin notices trigger them.
- **Real Web Push** (works with the app closed): set `VAPID_PUBLIC_KEY` / `VAPID_PRIVATE_KEY` (generate with `npx web-push generate-vapid-keys`). The browser registers a push subscription, stored per user in `push_subscriptions`, and the server pushes on registration, deposit approved, withdrawal approved and admin notifications. `POST /api/push/test` sends a test to the signed-in user's devices.
- Push payloads are encrypted (`aes128gcm`) and expire after 4 weeks; expired endpoints are removed automatically.

---

## 9. Admin console

| Page | Capabilities |
|---|---|
| Overview | balances under management, pending queues, activity log, share link |
| Users | edit every field (name, email, phone, country, KYC, PIN, password, balances, freeze, admin), email changes migrate related records |
| Transactions | add / edit / delete any ledger entry |
| Notifications | compose to all or one user, edit/delete, optional device alert |
| Payment methods | full CRUD for deposit methods and withdrawal networks |
| Plans | create / edit / hide |
| Email centre | broadcast to all or selected users, delivery log |
| Settings | maintenance mode, minimum withdrawal, fee, public link, data counts |

**Withdrawal edits**: changing amount, network or destination writes a row to `withdrawal_audit` (visible only in the admin console) and the investor is not notified and sees no "edited" marker; their record simply shows the current details. Balances stay consistent — increases hold the difference from cash, decreases refund it.

---

## 10. Local development

```bash
npm install
npm start        # http://localhost:3000, SQLite at ./data/assetpulse.db
```

Optional `.env` values are documented in `.env.example`. With no email credentials the app runs normally and skips email.
