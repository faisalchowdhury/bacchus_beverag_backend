import dotenv from "dotenv";
import path from "path";

dotenv.config({ path: path.join(process.cwd(), ".env") });

// ---------------------------------------------------------------------------
// App
// ---------------------------------------------------------------------------
export const APP_NAME = process.env.APP_NAME || "Bacchus Beverages";
export const NODE_ENV = process.env.NODE_ENV || "development";
export const PORT = Number(process.env.PORT || 8080);

// ---------------------------------------------------------------------------
// Database & auth
// ---------------------------------------------------------------------------
export const DATABASE_URL = process.env.DATABASE_URL;
export const JWT_SECRET_KEY = process.env.JWT_SECRET_KEY;
export const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || "7d";

// ---------------------------------------------------------------------------
// URLs
// ---------------------------------------------------------------------------
/** Frontend origin — used for CORS and payment redirects. */
export const CLIENT_URL = process.env.CLIENT_URL || "http://localhost:5173";

/** Extra allowed CORS origins, comma separated. */
export const EXTRA_CORS_ORIGINS = (process.env.EXTRA_CORS_ORIGINS || "")
  .split(",")
  .map((origin) => origin.trim())
  .filter(Boolean);

/** Public URL of this API — used to build absolute asset links. */
export const PUBLIC_BASE_URL =
  process.env.PUBLIC_BASE_URL || `http://localhost:${PORT}`;

/** Marketing / brand site linked from emails. */
export const BRAND_URL = process.env.BRAND_URL || CLIENT_URL;

// ---------------------------------------------------------------------------
// Mail (SMTP)
// ---------------------------------------------------------------------------
export const SMTP_HOST = process.env.SMTP_HOST || "";
export const SMTP_PORT = Number(process.env.SMTP_PORT || 465);
export const SMTP_USER = process.env.SMTP_USER || "";
export const SMTP_PASSWORD = process.env.SMTP_PASSWORD || "";
export const SMTP_FROM = process.env.SMTP_FROM || SMTP_USER;
export const EMAIL_LOGO_URL =
  process.env.EMAIL_LOGO_URL ||
  `${PUBLIC_BASE_URL.replace(/\/$/, "")}/images/logo.png`;

/**
 * Gmail credentials. Google prints app passwords in four spaced groups
 * ("abcd efgh ijkl mnop"); SMTP wants the 16 characters unbroken, so the
 * spaces are stripped here rather than relying on how it was pasted.
 */
export const GMAIL_USER = (process.env.Nodemailer_GMAIL || "").trim();
export const GMAIL_APP_PASSWORD = (process.env.Nodemailer_GMAIL_PASSWORD || "").replace(
  /\s+/g,
  "",
);

/**
 * Resolved mail transport. Gmail wins when its credentials are present,
 * otherwise the generic SMTP_* block is used — so an existing SMTP setup keeps
 * working and adding Gmail is enough to switch over.
 *
 * Gmail will not send as an arbitrary address: it rewrites (or rejects) any
 * From that is not the authenticated account, so SMTP_FROM is deliberately
 * ignored on that path.
 */
const useGmail = Boolean(GMAIL_USER && GMAIL_APP_PASSWORD);

export const MAIL = {
  provider: useGmail ? ("gmail" as const) : ("smtp" as const),
  host: useGmail ? "smtp.gmail.com" : SMTP_HOST,
  port: useGmail ? 465 : SMTP_PORT,
  user: useGmail ? GMAIL_USER : SMTP_USER,
  password: useGmail ? GMAIL_APP_PASSWORD : SMTP_PASSWORD,
  /** Bare address, for reply-to and as the owner-notification fallback. */
  address: useGmail ? GMAIL_USER : SMTP_FROM,
  /** Full From header, display name included. */
  from: useGmail ? `"${APP_NAME}" <${GMAIL_USER}>` : SMTP_FROM,
};

// ---------------------------------------------------------------------------
// Quote requests
// ---------------------------------------------------------------------------
/**
 * Inbox that receives a copy of every submitted quote. Comma separated for
 * multiple recipients. Falls back to the sending address so a submission is
 * never silently lost just because this was not configured.
 */
export const QUOTE_NOTIFY_EMAIL = (process.env.QUOTE_NOTIFY_EMAIL || MAIL.address)
  .split(",")
  .map((address) => address.trim())
  .filter(Boolean);

/** Venue name used in client-facing quote copy. */
export const VENUE_NAME = process.env.VENUE_NAME || "Chateau Des Fleures";

// ---------------------------------------------------------------------------
// Uploads
// ---------------------------------------------------------------------------
export const UPLOAD_FOLDER = process.env.UPLOAD_FOLDER || "public/images";
export const MAX_FILE_SIZE = Number(process.env.MAX_FILE_SIZE || 52428800); // 50MB

// ---------------------------------------------------------------------------
// Stripe
// ---------------------------------------------------------------------------
export const STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY || "";
export const STRIPE_PUBLISH_KEY = process.env.STRIPE_PUBLISH_KEY || "";
export const STRIPE_WEBHOOK_SECRET = process.env.STRIPE_WEBHOOK_SECRET || "";
/** Stripe Price id used by the default checkout flow. */
export const PRODUCT_PRICE_ID = process.env.PRODUCT_PRICE_ID || "";

// ---------------------------------------------------------------------------
// Firebase (push notifications) — optional; push no-ops when unset.
// ---------------------------------------------------------------------------
export const FIREBASE_SERVICE_ACCOUNT_PATH =
  process.env.FIREBASE_SERVICE_ACCOUNT_PATH ||
  path.resolve(process.cwd(), "src/config/firebase-service-account.json");
