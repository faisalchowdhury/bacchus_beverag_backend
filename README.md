# Backend Template

Node + Express + TypeScript + MongoDB (Mongoose) starter with auth, roles,
file uploads, notifications, Stripe payments and admin settings pages already
wired up.

## Quick start

```bash
npm install
cp .env.sample .env        # then fill in DATABASE_URL, JWT_SECRET_KEY, SMTP…
npm run dev                # http://localhost:8080
```

On first boot the server seeds an admin account (`SEED_ADMIN_EMAIL` /
`SEED_ADMIN_PASSWORD`) and one placeholder document for each settings page.

| Script | What it does |
| --- | --- |
| `npm run dev` | nodemon + ts-node, restarts on change |
| `npm run build` | compiles to `dist/` |
| `npm start` | runs the compiled build |
| `npm run typecheck` | `tsc --noEmit` |
| `npm run lint` / `lint:fix` | ESLint |

## Layout

```
src/
  app.ts                 express app: middleware, CORS, static, routers
  server.ts              db connect, http server, socket.io, scheduler, seeds
  config/                env vars (index.ts), roles, firebase, cloudinary
  DB/                    startup seeds
  errors/                ApiError + mongoose error formatters
  logger/                winston logger + HTTP request logging
  middlewares/           roleGuard (auth), notFound, globalErrorHandler
  modules/
    user/                register, login, OTP, profile, admin user list
    admin/               dashboard stats
    notifications/       in-app notifications + FCM push
    payment/             Stripe Checkout + webhook
    settings/            about / terms / privacy pages
  multer/                disk upload config
  routes/                routesConfig.ts — one line per module
  utils/                 jwt, email template, socket, pagination, responses
```

## Adding a feature module

1. `src/modules/<name>/` with `<name>.interface.ts`, `.model.ts`, `.service.ts`,
   `.controller.ts`, `.route.ts` (copy the shape of `modules/user`).
2. Register it in [src/routes/routesConfig.ts](src/routes/routesConfig.ts) —
   everything there is mounted under `/api/v1/<path>`.
3. Protect routes with `guardRole(["admin"])` / `guardRole(ALL_ROLES)`.
4. Validate input in the controller and let `ApiError` carry the message.

## Roles

Defined in one place: [src/config/role.ts](src/config/role.ts). Adding a role
there makes it valid for the user schema and `guardRole`.

The user index is `{ email, role }` — the same address can hold two roles. For
strictly one account per email, drop `role` from that index in
[src/modules/user/user.model.ts](src/modules/user/user.model.ts).

## Auth endpoints (`/api/v1/auth`)

| Method | Path | Notes |
| --- | --- | --- |
| `POST` | `/register` | multipart, optional `profilePicture`; emails an OTP |
| `POST` | `/login` | email + password |
| `POST` | `/otp-login` | passwordless — emails a login OTP |
| `POST` | `/verify-otp` | consumes the OTP, verifies the account, returns a token |
| `POST` | `/resend-otp` | |
| `POST` | `/forgot-password` | emails an OTP, returns a 15-min reset token |
| `POST` | `/reset-password` | Bearer reset token + `{ otp, password }` |
| `POST` | `/change-password` | signed in |
| `GET` `PATCH` `DELETE` | `/me` | profile read / update / soft delete |
| `GET` | `/users` | admin — search, role filter, pagination |
| `PATCH` | `/users/:userId/block` | admin — `{ isBlocked }` |

Other mounts: `/api/v1/admin/dashboard-stats`, `/api/v1/notification`,
`/api/v1/about`, `/api/v1/terms`, `/api/v1/privacy`, and the public HTML page at
`/api/v1/privacy-policy-page`. `GET /health` returns uptime.

## Notifications

`NotificationService.notifyUser(userId, { title, message })` writes the DB row,
emits it over Socket.IO and sends an FCM push in one call. Push silently no-ops
until a Firebase service account JSON is present at
`FIREBASE_SERVICE_ACCOUNT_PATH`.

Socket clients authenticate with the same JWT, passed as `auth.token` in the
handshake.

## Quote requests

`POST /api/v1/quote` — public. The quote designer posts the client's selections;
the server **recalculates the estimate from its own rate card**
([src/modules/quote/quote.pricing.ts](src/modules/quote/quote.pricing.ts)) rather
than trusting the totals in the request body, stores the submission, then emails
the itemised estimate to the client and a full copy to `QUOTE_NOTIFY_EMAIL`.

⚠ That rate card is a mirror of `src/features/quote-wizard/pricing.ts` in the
frontend. **Change a rate in one and change it in the other**, or clients will
see one price on screen and receive another by email.

A submission is saved *before* either email is attempted, so a mail outage never
loses an enquiry — the response reports `clientEmailSent: false` and the UI says
so honestly.

### Mail

Gmail is used whenever `Nodemailer_GMAIL` and `Nodemailer_GMAIL_PASSWORD` are
both set (the latter is a Google **App Password**, not the account password —
spaces are stripped). Otherwise the `SMTP_*` block is used. Credentials are
verified on boot, so a bad password shows up in the startup log rather than on
the first client who submits a quote.

## Stripe payments

Sells one fixed product via hosted Stripe Checkout. **The webhook is the source
of truth** — the browser redirect never marks a payment paid.

| Method | Path |
| --- | --- |
| `POST` | `/api/payments/create-checkout-session` — `{ userId, quantity?, customerEmail? }` → `{ url, sessionId }` |
| `POST` | `/api/payments/webhook` — raw Stripe event |
| `GET` | `/api/payments/status/:sessionId` |
| `GET` | `/api/payments/admin/all` — admin, paginated |

Local webhook forwarding:

```bash
stripe listen --forward-to localhost:8080/api/payments/webhook
```

Copy the printed `whsec_...` into `STRIPE_WEBHOOK_SECRET`. Test card:
`4242 4242 4242 4242`, any future expiry / CVC / ZIP.

> The webhook route is registered with `express.raw()` **before** the global
> `express.json()` parser in [src/app.ts](src/app.ts) so the raw body survives
> for signature verification.

## Not included

Removed deliberately, add back if the project needs them: Redis caching, Twilio
SMS, response translation, and social login (Passport). The user model already
has a `type` field (`default | apple | google`) for provider sign-ups.
