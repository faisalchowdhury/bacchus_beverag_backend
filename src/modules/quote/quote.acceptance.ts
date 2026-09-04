/**
 * The client-facing "Accept Quote" flow.
 *
 * A client gets their estimate by email with a button in it. The button is a
 * link carrying a one-off token; it opens a page on the public website that
 * shows the quote back to them, and accepting there notifies the venue and
 * attaches the ready-to-sign contract.
 *
 * Security model, since this endpoint has no login behind it:
 *
 *   - The token is 32 random bytes, so it cannot be guessed.
 *   - Only its SHA-256 is stored, so a database leak does not let anyone
 *     accept on a client's behalf.
 *   - It expires (30 days by default), because an estimate is not open
 *     forever and a stale link in an old inbox should not still work.
 *   - Accepting is idempotent: a second click reports the existing acceptance
 *     rather than re-notifying the whole team.
 */

import crypto from "crypto";

import { QUOTE_ACCEPT_BASE_URL, QUOTE_ACCEPT_TOKEN_DAYS } from "../../config";

/** Raw token for the email link, plus the hash to store against the quote. */
export interface AcceptanceToken {
  token: string;
  hash: string;
  expiresAt: Date;
}

export const createAcceptanceToken = (): AcceptanceToken => {
  const token = crypto.randomBytes(32).toString("hex");
  return {
    token,
    hash: hashAcceptanceToken(token),
    expiresAt: new Date(
      Date.now() + Math.max(1, QUOTE_ACCEPT_TOKEN_DAYS) * 24 * 60 * 60 * 1000,
    ),
  };
};

/**
 * Hashes a token for storage and lookup.
 *
 * Plain SHA-256 rather than a slow KDF on purpose: the input is 256 bits of
 * entropy we generated ourselves, so there is nothing to brute-force, and the
 * lookup has to be a single indexed query.
 */
export const hashAcceptanceToken = (token: string): string =>
  crypto.createHash("sha256").update(String(token ?? "")).digest("hex");

/** The URL that goes in the client's email. */
export const buildAcceptanceUrl = (token: string): string =>
  `${QUOTE_ACCEPT_BASE_URL}/accept-quote/${encodeURIComponent(token)}`;

/** Rejects anything that is not a token we could have issued. */
export const isWellFormedToken = (token: unknown): boolean =>
  typeof token === "string" && /^[a-f0-9]{64}$/i.test(token.trim());

/**
 * The caller's IP, for the acceptance audit trail.
 *
 * `x-forwarded-for` is only trusted for its first entry, and only as a record
 * of what the proxy claimed — nothing is authorised on the strength of it.
 */
export const clientIpFrom = (headers: Record<string, unknown>, fallback = ""): string => {
  const forwarded = headers["x-forwarded-for"];
  const raw = Array.isArray(forwarded) ? forwarded[0] : forwarded;
  const first = String(raw ?? "").split(",")[0]?.trim();
  return (first || String(fallback ?? "")).slice(0, 120);
};
