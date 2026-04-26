# Community Site

A zero / near-zero cost serverless community membership site for ~100 members.
Designed to be a reusable base for similar small-community sites.

- **Hosting**: Cloudflare Pages (static frontend + Pages Functions for the API)
- **DB**: Cloudflare D1 (serverless SQLite)
- **Auth**: Firebase Auth (Google sign-in by default)
- **Stack**: Vite + React + TypeScript + React Router, JWT verification with `jose`
- **Local dev**: Wrangler + Vite, optionally inside Docker

> **Why TypeScript and not Python?**
> Cloudflare Pages Functions only run JavaScript / TypeScript. The whole stack
> (Vite, Wrangler, `jose`, Vitest) is JS-native, which is what keeps hosting
> at zero cost on Cloudflare's free tier.

---

## Repository layout

```
.
├── functions/                  Cloudflare Pages Functions (the API)
│   ├── api/
│   │   ├── session.ts          GET  /api/session
│   │   ├── me.ts               GET  /api/me
│   │   ├── accept-invite.ts    POST /api/accept-invite
│   │   ├── member-content.ts   GET  /api/member-content
│   │   └── admin/
│   │       ├── members.ts      GET / POST / PATCH /api/admin/members
│   │       ├── accounting.ts   GET  /api/admin/accounting
│   │       ├── invites.ts      GET / POST / PATCH /api/admin/invites
│   │       └── payments.ts     POST /api/admin/payments
│   └── _shared/                shared modules: auth, db, access, audit, …
├── migrations/
│   ├── 0001_init.sql
│   └── 0002_seed_access_rules.sql
├── src/                        React frontend
│   ├── firebase/client.ts
│   ├── lib/                    api client, auth context, types, format
│   ├── pages/                  Home/About/Events/Membership/Login/AcceptInvite
│   ├── pages/members/          MemberLayout, Dashboard, Common, Profile
│   └── pages/admin/            AdminLayout, Dashboard, Members, Accounting, Invites, RecordPayment
├── wrangler.toml               Cloudflare config (D1 binding, project ID)
├── vite.config.ts
├── vitest.config.ts
├── Dockerfile / docker-compose.yml
├── .env.example / .dev.vars.example
└── package.json
```

---

## 1. Local setup

You need:

- Node.js 20+ and npm
- A Cloudflare account (free tier is fine)
- A Firebase project (free Spark plan is fine)
- Optionally Docker if you'd rather not install Node locally

```bash
git clone <this-repo>
cd <this-repo>
cp .env.example .env
cp .dev.vars.example .dev.vars
npm install
```

Fill in the env files (see the next two sections).

Run the dev server (frontend + API):

```bash
npm run cf:dev
```

This builds the app and then boots `wrangler pages dev` on
**http://localhost:8788**, serving `dist/` plus Pages Functions.
On Wrangler v4 this avoids the proxy-command conflict.

Run frontend only (no API) if you just want to iterate on UI:

```bash
npm run dev
```

Run tests:

```bash
npm run test
npm run typecheck
```

---

## 2. Firebase setup

1. Go to <https://console.firebase.google.com/> and create a project.
2. **Authentication → Sign-in method**: enable **Google** (and any others you want).
3. **Authentication → Settings → Authorized domains**: add the domains you'll
   serve from (e.g. `localhost`, `*.pages.dev`, your custom domain).
4. **Project settings → General → Your apps**: register a **Web app**. Copy
   the config values into `.env`:
    ```
    VITE_FIREBASE_API_KEY=...
    VITE_FIREBASE_AUTH_DOMAIN=...
    VITE_FIREBASE_PROJECT_ID=...
    VITE_FIREBASE_APP_ID=...
    ```
5. Set the same project ID server-side in **`.dev.vars`** and **`wrangler.toml`**:
    ```
    FIREBASE_PROJECT_ID=...
    ```

The worker uses this to verify ID tokens against Google's public certs at
`https://www.googleapis.com/robot/v1/metadata/x509/securetoken@system.gserviceaccount.com`.
We don't use the Firebase Admin SDK — `jose` + the JWKS are all you need, and
it works inside a Cloudflare Worker.

> **Heads up**: `VITE_FIREBASE_API_KEY` is **not a secret** — Firebase web
> API keys are public identifiers. The actual security boundary is server-side
> token verification (`functions/_shared/auth.ts`).

---

## 3. Cloudflare D1 setup

```bash
# Install wrangler if needed (already a devDep): npm i -D wrangler
npx wrangler login
npx wrangler d1 create community-site-db
```

Copy the `database_id` Wrangler prints into `wrangler.toml`:

```toml
[[d1_databases]]
binding = "DB"
database_name = "community-site-db"
database_id = "PASTE-HERE"
migrations_dir = "migrations"
```

### Run migrations

```bash
# local SQLite mirror used by `wrangler pages dev`
npm run db:migrate:local

# remote D1 (real Cloudflare instance)
npm run db:migrate:remote
```

You can run ad-hoc SQL with:

```bash
npm run db:console:local  -- "SELECT * FROM members LIMIT 5;"
npm run db:console:remote -- "SELECT * FROM members LIMIT 5;"
```

### Seed your first admin

There is no self-service admin signup. To bootstrap:

1. Make sure migrations are applied (`db:migrate:local` and/or `db:migrate:remote`).
2. Insert your admin row by email **before** signing in:

    ```bash
    npm run db:console:remote -- \
      "INSERT INTO members (email, name, status, role) VALUES ('you@example.com', 'You', 'active', 'admin');"
    ```

3. Add a paid membership period for the current year so `/members` works too
   (admins are allowed regardless, but this keeps everything consistent):

    ```bash
    npm run db:console:remote -- \
      "INSERT INTO membership_periods (member_id, year, valid_from, valid_until, fee_paid, amount_due_cents, amount_paid_cents) \
       VALUES ((SELECT id FROM members WHERE email='you@example.com'), 2026, '2026-01-01', '2026-12-31', 1, 0, 0);"
    ```

4. Sign in with that same Google account on the deployed site. The first
   `/api/session` call will link your `firebase_uid` to the row automatically.

After that, you can use the Admin → Invites screen to invite everyone else.

---

## 4. Docker

```bash
cp .env.example .env
docker compose up --build
```

Visit <http://localhost:8788>. Source is volume-mounted.
If you change frontend code, restart the container to rebuild `dist/`.

> Migrations are not run automatically. From the host:
> `npm run db:migrate:local`. Or open a shell in the container with
> `docker compose exec community-site sh` and run them there.

---

## 5. Deployment to Cloudflare Pages

You can connect the repo through the Cloudflare dashboard, or push directly:

```bash
npm run cf:deploy
```

(Equivalent to `npm run build && wrangler pages deploy dist`.)

In the Cloudflare dashboard, set the project's **Functions → D1 bindings** to
point to your `community-site-db` (binding name `DB`) and **Functions →
Environment variables** to include `FIREBASE_PROJECT_ID`. Frontend
`VITE_FIREBASE_*` values are exposed to the browser — set them in the build
environment for the Pages project.

When you're ready, point your custom domain at the Pages project under
**Custom domains** and update Firebase **Authorized domains** to match.

---

## 6. API summary

| Method | Path                       | Auth                    | Purpose |
| ------ | -------------------------- | ----------------------- | ------- |
| GET    | `/api/session`             | optional Firebase token | resolves identity + access decision (`allowedMember`, `allowedAdmin`) |
| GET    | `/api/me`                  | active+paid member      | returns the caller's own member record, current period, recent transactions |
| POST   | `/api/accept-invite`       | Firebase token          | redeems an invite; creates/upgrades the members row |
| GET    | `/api/member-content`      | active+paid member      | returns common member-only content |
| GET    | `/api/admin/members`       | admin                   | list members |
| POST   | `/api/admin/members`       | admin                   | create member |
| PATCH  | `/api/admin/members`       | admin                   | update member fields |
| GET    | `/api/admin/accounting`    | admin                   | totals by year, dues, outstanding, recent txns |
| GET    | `/api/admin/invites`       | admin                   | list invites |
| POST   | `/api/admin/invites`       | admin                   | create invite (returns `code` and `acceptUrl`) |
| PATCH  | `/api/admin/invites`       | admin                   | revoke invite |
| POST   | `/api/admin/payments`      | admin                   | record a transaction; optionally upsert a `membership_periods` row and mark fee paid |

All sensitive endpoints follow the same flow:

1. Read `Authorization: Bearer <token>`.
2. Verify the JWT against Firebase's public certs (`jose`).
3. Look up the user in D1 (by `firebase_uid`, falling back to email on first login).
4. Decide access via the pure `decideAccess()` function (`functions/_shared/access.ts`).

The browser **never** sends an email body that the server trusts. The verified
Firebase email is the only identity input.

---

## 7. Security notes

- The repo is public. **Do not** commit `.env`, `.dev.vars`, or any production
  secrets. `.gitignore` already covers them.
- Firebase web API keys are public — that is by design. The protection comes
  from server-side token verification, not from hiding the key.
- Pages Functions are the only path to private data. Static files in
  `dist/` may be cached and viewed by anyone.
- The `audit_log` table records sensitive admin actions. IPs are SHA-256
  hashed.
- D1's free tier limits are well above what 100 members at low access rate
  will produce.
- Rotate Firebase Auth keys / users via the Firebase console; revoking an
  admin only requires changing their D1 `role` to `member` (or `status` to
  `revoked`).

---

## 8. Customizing this base

This project is intentionally a reusable starting point. The most common
customizations:

- **Different access rules**: edit `decideAccess()` in
  `functions/_shared/access.ts` and the `page_access_rules` seed.
- **Different identity providers**: keep `verifyFirebaseIdToken()` and add
  more sign-in methods in `src/firebase/client.ts`.
- **Different content gates**: add new `requireMember`/`requireAdmin`-guarded
  endpoints under `functions/api/` and call them from React.
- **Theming / branding**: edit `src/styles.css` and the strings in
  `src/App.tsx` and the public pages.

Run `npm run test && npm run typecheck && npm run build` before deploying.
