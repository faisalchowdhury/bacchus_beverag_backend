import { Schema, model } from "mongoose";

import type { QuoteBreakdown, QuoteFormValues } from "./quote.interface";

/** Where an enquiry sits in the owner's pipeline. Set from the dashboard. */
export const QUOTE_STATUSES = ["New", "Contacted", "Won", "Lost"] as const;
export type QuoteStatus = (typeof QUOTE_STATUSES)[number];

/**
 * What the *client* has done with their estimate.
 *
 * Kept separate from the pipeline status above: that one is the venue's own
 * view and staff change it freely, whereas this is a record of an action the
 * client took and must not be editable from the dashboard.
 */
export const QUOTE_ACCEPTANCE_STATUSES = ["Pending", "Accepted", "Declined"] as const;
export type QuoteAcceptanceStatus = (typeof QUOTE_ACCEPTANCE_STATUSES)[number];

export interface IQuoteRequest {
  customerName: string;
  customerEmail: string;
  customerPhone?: string;

  eventType?: string;
  eventDate?: string;
  venueLocation?: string;
  guestCount: number;
  barType: string;

  /** Everything the wizard collected, stored verbatim. */
  selections: QuoteFormValues;
  /** The server-recalculated breakdown — the figures that were emailed. */
  breakdown: QuoteBreakdown;
  grandTotal: number;

  clientEmailSent: boolean;
  ownerEmailSent: boolean;

  /** Pipeline state, set from the dashboard. */
  status: QuoteStatus;

  /** What the client did with the estimate emailed to them. */
  acceptanceStatus: QuoteAcceptanceStatus;
  /**
   * SHA-256 of the token in the client's "Accept Quote" link.
   *
   * Only the hash is stored: the link lands in an inbox and gets forwarded,
   * and a leaked database should not hand anyone the ability to accept
   * quotes on a client's behalf.
   */
  acceptanceTokenHash?: string;
  acceptanceTokenExpiresAt?: Date;
  acceptedAt?: Date;
  declinedAt?: Date;
  /** Recorded at the moment of acceptance — this is the audit trail. */
  acceptanceIp?: string;
  acceptanceUserAgent?: string;
  /** Who was emailed the signed-ready contract when the client accepted. */
  acceptanceNotifiedEmails: string[];
  /** Private to the venue — never shown to the client or included in email. */
  adminNotes: string;

  submittedAt: Date;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Quote submissions are kept so the owner can look one up later without
 * digging through their inbox. `selections` and `breakdown` are stored as
 * free-form subdocuments — the rate card evolves, and an old quote should
 * still read back exactly as it was quoted.
 */
const quoteRequestSchema = new Schema<IQuoteRequest>(
  {
    customerName: { type: String, required: true, trim: true },
    customerEmail: { type: String, required: true, trim: true, lowercase: true, index: true },
    customerPhone: { type: String, trim: true },

    eventType: { type: String, trim: true },
    eventDate: { type: String, trim: true },
    venueLocation: { type: String, trim: true },
    guestCount: { type: Number, default: 0 },
    barType: { type: String, trim: true },

    selections: { type: Schema.Types.Mixed, required: true },
    breakdown: { type: Schema.Types.Mixed, required: true },
    grandTotal: { type: Number, default: 0, index: true },

    clientEmailSent: { type: Boolean, default: false },
    ownerEmailSent: { type: Boolean, default: false },

    status: {
      type: String,
      enum: QUOTE_STATUSES,
      default: "New",
      index: true,
    },

    acceptanceStatus: {
      type: String,
      enum: QUOTE_ACCEPTANCE_STATUSES,
      default: "Pending",
      index: true,
    },
    // Indexed: the public accept endpoint looks a quote up by this alone.
    acceptanceTokenHash: { type: String, index: true, sparse: true },
    acceptanceTokenExpiresAt: { type: Date },
    acceptedAt: { type: Date },
    declinedAt: { type: Date },
    acceptanceIp: { type: String, trim: true },
    acceptanceUserAgent: { type: String, trim: true },
    acceptanceNotifiedEmails: { type: [String], default: [] },
    adminNotes: { type: String, default: "", trim: true },

    submittedAt: { type: Date, default: Date.now, index: true },
  },
  { timestamps: true },
);

export const QuoteRequestModel = model<IQuoteRequest>(
  "QuoteRequest",
  quoteRequestSchema,
);
