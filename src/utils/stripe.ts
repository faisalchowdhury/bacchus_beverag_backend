import Stripe from "stripe";

import { STRIPE_SECRET_KEY } from "../config";
import ApiError from "../errors/ApiError";

let client: Stripe | null = null;

export const isStripeConfigured = () => Boolean(STRIPE_SECRET_KEY);

/** Builds the client on first use, so the app boots without Stripe keys set. */
export const getStripe = (): Stripe => {
  if (!STRIPE_SECRET_KEY) {
    throw new ApiError(
      500,
      "Stripe is not configured. Set STRIPE_SECRET_KEY in .env.",
    );
  }
  if (!client) {
    client = new Stripe(STRIPE_SECRET_KEY, {
      apiVersion: "2025-07-30.basil" as any,
    });
  }
  return client;
};

/**
 * Lazy proxy so `stripe.checkout.sessions.create(...)` still reads naturally
 * while the underlying client is only constructed on the first real call.
 */
const stripe = new Proxy({} as Stripe, {
  get: (_target, prop) => (getStripe() as any)[prop],
});

export default stripe;
