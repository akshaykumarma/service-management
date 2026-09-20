# Deployment Setup: 002-auth-rbac

## Environment variables

Copy `.env.example` to `.env` and fill in:

- `DATABASE_URL` — PostgreSQL connection string (the `db` service in `docker-compose.yml`
  when self-hosted per the constitution's deployment target)
- `AUTH_SECRET` — generate with `openssl rand -base64 32`; used to key hashing operations
- `SESSION_IDLE_TIMEOUT_HOURS` — defaults to 8 if unset
- `SMTP_HOST` / `SMTP_PORT` / `SMTP_USER` / `SMTP_PASSWORD` / `SMTP_FROM` — any
  SMTP-compatible provider for password-reset email delivery
- `APP_BASE_URL` — used to build password-reset links (e.g. `https://your-domain.example`
  in production, behind the Nginx/TLS termination the constitution's deployment target
  describes)

## Database migration

```bash
npm run db:generate   # only when lib/db/schema.ts changes
npm run db:migrate    # applies pending migrations
```

## Seeding the first Super Admin

No API endpoint creates the first Super Admin account — `POST /api/auth/users` can only
create `admin`/`service_manager` roles (`contracts/auth-api.md`). Every subsequent
deployment needs exactly one seeded directly:

```bash
npm run seed:super-admin -- admin@example.com "a-strong-password" "Full Name"
```

This is a one-time step per deployment, run after migrations and before the app is opened
to real users. Every Super Admin created after the first one must be seeded the same way
(there is no in-app flow to create a second Super Admin in v1 — see `contracts/auth-api.md`'s
note on `POST /api/auth/users`).

## Local development

```bash
npm install
npm run db:migrate
npm run seed:super-admin -- dev@example.com "DevPassword123!" "Dev Admin"
npm run dev
```

Tests run against a **separate** database (`DATABASE_URL` in `.env.test`) so `npm test`
never touches development data:

```bash
npm test           # Vitest: contract + integration
npm run test:e2e   # Playwright: e2e (requires a production build + seeded Super Admin)
```
