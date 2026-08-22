import { Schema, model } from "mongoose";

import type { QuoteBreakdown, QuoteFormValues } from "./quote.interface";

/** Where an enquiry sits in the owner's pipeline. */
export const QUOTE_STATUSES = ["New", "Contacted", "Won", "Lost"] as const;
export type QuoteStatus = (typeof QUOTE_STATUSES)[number];

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
    adminNotes: { type: String, default: "", trim: true },

    submittedAt: { type: Date, default: Date.now, index: true },
  },
  { timestamps: true },
);

export const QuoteRequestModel = model<IQuoteRequest>(
  "QuoteRequest",
  quoteRequestSchema,
);
