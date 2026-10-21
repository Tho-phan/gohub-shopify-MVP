@AGENTS.md

# GoHub eSIM — reseller app

Shopify reseller app (embedded admin + backend). TypeScript, **Vite + React Router 7**
(not Remix — use `react-router` imports, not `@remix-run/*`), Prisma + SQLite, Polaris UI.
Full build spec: `../GOHUB_SHOPIFY_MVP.md`.

## Commands (from package.json)

- **Dev server:** `npm run dev` — runs `shopify app dev` (tunnel + auto webhook forwarding, no manual ngrok).
- **Build:** `npm run build` — `react-router build`.
- **Typecheck:** `npm run typecheck` — `react-router typegen && tsc --noEmit`.
- **Lint:** `npm run lint` — ESLint.
- **DB setup:** `npm run setup` — `prisma generate && prisma migrate deploy`. For a new dev migration: `npx prisma migrate dev --name <name>` (`npx prisma studio` to inspect tables).
- **Tests:** none configured yet — no test runner in `package.json`. Add one (e.g. Vitest) before relying on `npm test`.

## Repo-specific notes

- **React Router 7, not Remix.** The spec's `@remix-run/node` / `@remix-run/react` imports map to `react-router`. Shopify helper imports stay the same but the package is `@shopify/shopify-app-react-router`.
- **GoHub client is the one swap point.** Code talks to the `GoHubClient` interface in `app/gohub.server.ts`; `getGoHub()` returns the mock or live client based on `GOHUB_MODE` (`mock` | `live`). Routes, UI, webhooks, DB, and email never call GoHub directly.
- **Never process a webhook body without `authenticate.webhook(request)`** — that call *is* the HMAC check. The `orders/paid` → provision path spends a reseller's money; an unauthenticated POST must never reach `provisionOrder`.
- **Provisioning is idempotent** at the DB layer (`ProvisionedEsim.idempotencyKey` unique). Shopify retries webhooks — keep retries from double-provisioning.
- **Secrets live only in env** (`SHOPIFY_API_SECRET`, `GOHUB_API_KEY`, SMTP). Never commit them or put them in client code.
- **Email in dev** uses the console transport (`EMAIL_TRANSPORT=console`): QR PNGs are written to `./tmp/emails/` and the send is logged — no real SMTP needed.
- **Scopes & webhook subscriptions** are declared in `shopify.app.toml` (currently `api_version = "2027-01"`), not in code.
- Products pushed to the store are **digital**: `requiresShipping = false`, inventory not tracked.

## Build status (vs spec)

Scaffold has `app._index.tsx`, `app.tsx`, `auth.$.tsx`, `webhooks.app.uninstalled.tsx`,
`webhooks.app.scopes_update.tsx`. Still to build per spec: `orders/paid` webhook + provision
pipeline, reseller catalog UI, GoHub client, QR/email, Prisma `ResellerPlan`/`ProvisionedEsim`
models, and the compliance webhooks.
