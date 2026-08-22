import httpStatus from "http-status";
import { isValidObjectId } from "mongoose";

import ApiError from "../../errors/ApiError";
import { QUOTE_NOTIFY_EMAIL } from "../../config";
import { isMailConfigured, sendEmail } from "../../utils/sendEmail";
import { buildClientQuoteEmail, buildOwnerQuoteEmail } from "./quote.email";
import { QuoteRequestModel, QUOTE_STATUSES, type QuoteStatus } from "./quote.model";
import { calculateQuote } from "./quote.pricing";
import type {
  BarType,
  ChampagneSelection,
  HouseAccountScope,
  IQuoteSubmissionPayload,
  LiquorMode,
  LiquorTier,
  QuoteBreakdown,
  QuoteFormValues,
  SignatureCocktail,
  ToastServiceStyle,
  WineBeerTier,
} from "./quote.interface";

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const BAR_TYPES: BarType[] = ["Open Bar", "Cash Bar", "Consumption Bar"];
const WINE_BEER_TIER_IDS: WineBeerTier[] = ["None", "Tier 1", "Tier 2", "Tier 3"];
const LIQUOR_TIER_IDS: LiquorTier[] = ["Well", "Call", "Top Shelf", "Platinum"];
const LIQUOR_MODES: LiquorMode[] = ["None", "Signature Cocktails", "Full Shelf"];
const CHAMPAGNE_IDS: ChampagneSelection[] = [
  "J. Roget Brut",
  "Perelada Cava Nature Stars Reserva",
  "Devaux Blanc de Noirs Champagne",
];
const TOAST_STYLES: ToastServiceStyle[] = [
  "Stationary Display",
  "Bar Cart / Table Service",
];
const HOUSE_ACCOUNT_SCOPES: HouseAccountScope[] = [
  "Wine & Beer Only",
  "Signature Cocktails",
  "Liquor Shelf Tiers",
  "Full Inventory",
];

const str = (value: unknown, fallback = ""): string =>
  typeof value === "string" ? value.trim() : fallback;

const num = (value: unknown, fallback = 0): number => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const bool = (value: unknown): boolean => value === true || value === "true";

/** Falls back to the first option rather than rejecting an unknown value. */
const oneOf = <T extends string>(value: unknown, allowed: T[], fallback: T): T =>
  allowed.includes(value as T) ? (value as T) : fallback;

const toSignatureCocktails = (value: unknown): SignatureCocktail[] => {
  if (!Array.isArray(value)) return [];
  return value.slice(0, 8).map((entry) => ({
    name: str((entry as SignatureCocktail)?.name).slice(0, 120),
    liquors: Array.isArray((entry as SignatureCocktail)?.liquors)
      ? (entry as SignatureCocktail).liquors
          .slice(0, 4)
          .map((liquor) => str(liquor).slice(0, 120))
          .filter(Boolean)
      : [],
  }));
};

/**
 * Coerces the posted body into a well-formed `QuoteFormValues`.
 *
 * Unknown enum values fall back to a safe default rather than 400-ing: a
 * client who has filled in a ten-step wizard should not lose it to a stale
 * build sending a value we renamed. Only the fields we genuinely cannot
 * proceed without — name and a valid email — are hard requirements.
 */
export const normaliseSelections = (input: unknown): QuoteFormValues => {
  const raw = (input ?? {}) as Record<string, unknown>;

  const customerName = str(raw.customerName);
  const customerEmail = str(raw.customerEmail).toLowerCase();

  if (!customerName) {
    throw new ApiError(httpStatus.BAD_REQUEST, "Your name is required.");
  }
  if (!EMAIL_PATTERN.test(customerEmail)) {
    throw new ApiError(
      httpStatus.BAD_REQUEST,
      "A valid email address is required so we can send your estimate.",
    );
  }

  return {
    eventType: str(raw.eventType).slice(0, 120),
    eventDate: str(raw.eventDate).slice(0, 40),
    venueLocation: str(raw.venueLocation).slice(0, 240),
    eventStartTime: str(raw.eventStartTime).slice(0, 10),
    eventEndTime: str(raw.eventEndTime).slice(0, 10),

    guestCount: Math.max(0, Math.floor(num(raw.guestCount))),
    glasswareRental: bool(raw.glasswareRental),
    barType: oneOf(raw.barType, BAR_TYPES, "Open Bar"),
    additionalBarStations: Math.max(0, Math.floor(num(raw.additionalBarStations))),

    wineBeerTier: oneOf(raw.wineBeerTier, WINE_BEER_TIER_IDS, "None"),
    openBarHours: Math.max(0, num(raw.openBarHours)),
    specialtyOrderRequest: str(raw.specialtyOrderRequest).slice(0, 2000),
    specialtyOrderQuantity: Math.max(0, Math.floor(num(raw.specialtyOrderQuantity))),

    liquorMode: oneOf(raw.liquorMode, LIQUOR_MODES, "None"),
    liquorTier: oneOf(raw.liquorTier, LIQUOR_TIER_IDS, "Well"),
    signatureCocktailCount: Math.max(0, Math.floor(num(raw.signatureCocktailCount))),
    signatureCocktails: toSignatureCocktails(raw.signatureCocktails),

    champagneToast: bool(raw.champagneToast),
    champagneSelection: oneOf(raw.champagneSelection, CHAMPAGNE_IDS, "J. Roget Brut"),
    champagneGuests: Math.max(0, Math.floor(num(raw.champagneGuests))),
    champagneNonAlcoholicGuests: Math.max(
      0,
      Math.floor(num(raw.champagneNonAlcoholicGuests)),
    ),
    toastTime: str(raw.toastTime).slice(0, 10),
    toastServiceStyle: oneOf(raw.toastServiceStyle, TOAST_STYLES, "Stationary Display"),

    houseAccountAmount: Math.max(0, num(raw.houseAccountAmount)),
    houseAccountScope: oneOf(
      raw.houseAccountScope,
      HOUSE_ACCOUNT_SCOPES,
      "Full Inventory",
    ),
    openTab: bool(raw.openTab),
    tabRestrictions: str(raw.tabRestrictions).slice(0, 2000),

    customerName: customerName.slice(0, 160),
    customerEmail,
    customerPhone: str(raw.customerPhone).slice(0, 60),
  };
};

export interface QuoteSubmissionResult {
  breakdown: QuoteBreakdown;
  clientEmailSent: boolean;
  ownerEmailSent: boolean;
  quoteId: string;
}

/**
 * Recalculates, stores, then emails the client and the venue.
 *
 * The stored and emailed figures come from the server's own rate card — the
 * `quote` block the browser sends is never used for anything but comparison,
 * since a POST body can claim any total it likes.
 */
export const submitQuoteRequest = async (
  payload: IQuoteSubmissionPayload,
): Promise<QuoteSubmissionResult> => {
  const selections = normaliseSelections(payload?.selections);
  const breakdown = calculateQuote(selections);

  const submittedAt = (() => {
    const parsed = new Date(str(payload?.submittedAt));
    return Number.isNaN(parsed.getTime()) ? new Date() : parsed;
  })();

  // Worth knowing about: means the browser and the server disagree on price.
  const clientTotal = Number(payload?.quote?.grandTotal);
  if (Number.isFinite(clientTotal) && Math.abs(clientTotal - breakdown.grandTotal) > 0.01) {
    console.warn(
      `[quote] Client/server total mismatch for ${selections.customerEmail}: ` +
        `client ${clientTotal} vs server ${breakdown.grandTotal}. Server figure used.`,
    );
  }

  const record = await QuoteRequestModel.create({
    customerName: selections.customerName,
    customerEmail: selections.customerEmail,
    customerPhone: selections.customerPhone,
    eventType: selections.eventType,
    eventDate: selections.eventDate,
    venueLocation: selections.venueLocation,
    guestCount: selections.guestCount,
    barType: selections.barType,
    selections,
    breakdown,
    grandTotal: breakdown.grandTotal,
    submittedAt,
  });

  if (!isMailConfigured()) {
    console.error(
      "[quote] SMTP is not configured — quote stored but no email was sent.",
    );
    return {
      breakdown,
      clientEmailSent: false,
      ownerEmailSent: false,
      quoteId: String(record._id),
    };
  }

  // The submission is already saved, so a mail failure must not 500 the
  // request and make the client think their quote vanished.
  const clientMail = buildClientQuoteEmail(selections, breakdown);
  const clientEmailSent = await sendEmail({
    to: selections.customerEmail,
    subject: clientMail.subject,
    html: clientMail.html,
  })
    .then(() => true)
    .catch((error) => {
      console.error("[quote] Client estimate email failed:", error);
      return false;
    });

  const ownerMail = buildOwnerQuoteEmail(selections, breakdown, submittedAt);
  const ownerEmailSent = QUOTE_NOTIFY_EMAIL.length
    ? await sendEmail({
        to: QUOTE_NOTIFY_EMAIL,
        subject: ownerMail.subject,
        html: ownerMail.html,
        replyTo: selections.customerEmail,
      })
        .then(() => true)
        .catch((error) => {
          console.error("[quote] Owner notification email failed:", error);
          return false;
        })
    : false;

  await QuoteRequestModel.findByIdAndUpdate(record._id, {
    clientEmailSent,
    ownerEmailSent,
  });

  return {
    breakdown,
    clientEmailSent,
    ownerEmailSent,
    quoteId: String(record._id),
  };
};

/* ══════════════════════════════════════════════════════════════════════
   Admin reads
   ══════════════════════════════════════════════════════════════════════ */

export interface QuoteListFilters {
  page?: number;
  limit?: number;
  search?: string;
  status?: string;
  barType?: string;
  sortBy?: string;
  sortOrder?: "asc" | "desc";
}

/** Fields the list view needs — the full selections/breakdown stay out of it. */
const LIST_FIELDS =
  "customerName customerEmail customerPhone eventType eventDate venueLocation " +
  "guestCount barType grandTotal status clientEmailSent ownerEmailSent submittedAt createdAt";

const SORTABLE = new Set([
  "submittedAt",
  "createdAt",
  "grandTotal",
  "guestCount",
  "eventDate",
  "customerName",
]);

/** Paginated quote list for the dashboard. */
const getQuoteList = async ({
  page = 1,
  limit = 10,
  search,
  status,
  barType,
  sortBy = "submittedAt",
  sortOrder = "desc",
}: QuoteListFilters) => {
  const query: Record<string, unknown> = {};

  if (status && QUOTE_STATUSES.includes(status as QuoteStatus)) {
    query.status = status;
  }
  if (barType) query.barType = barType;

  if (search?.trim()) {
    // Escaped — a client's name could contain regex metacharacters.
    const safe = search.trim().replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const rx = { $regex: safe, $options: "i" };
    query.$or = [
      { customerName: rx },
      { customerEmail: rx },
      { customerPhone: rx },
      { venueLocation: rx },
      { eventType: rx },
    ];
  }

  const sortField = SORTABLE.has(sortBy) ? sortBy : "submittedAt";
  const safePage = Math.max(1, Math.floor(page) || 1);
  const safeLimit = Math.min(100, Math.max(1, Math.floor(limit) || 10));

  const [quotes, totalData] = await Promise.all([
    QuoteRequestModel.find(query)
      .select(LIST_FIELDS)
      .sort({ [sortField]: sortOrder === "asc" ? 1 : -1 })
      .skip((safePage - 1) * safeLimit)
      .limit(safeLimit)
      .lean(),
    QuoteRequestModel.countDocuments(query),
  ]);

  return { quotes, totalData, page: safePage, limit: safeLimit };
};

/** One quote, with everything the client submitted. */
const getQuoteById = async (id: string) => {
  if (!isValidObjectId(id)) {
    throw new ApiError(httpStatus.BAD_REQUEST, "That is not a valid quote id.");
  }

  const quote = await QuoteRequestModel.findById(id).lean();
  if (!quote) {
    throw new ApiError(httpStatus.NOT_FOUND, "Quote not found.");
  }
  return quote;
};

/** Pipeline state and private notes. Nothing here reaches the client. */
const updateQuoteAdminFields = async (
  id: string,
  updates: { status?: unknown; adminNotes?: unknown },
) => {
  if (!isValidObjectId(id)) {
    throw new ApiError(httpStatus.BAD_REQUEST, "That is not a valid quote id.");
  }

  const patch: Record<string, unknown> = {};

  if (updates.status !== undefined) {
    if (!QUOTE_STATUSES.includes(updates.status as QuoteStatus)) {
      throw new ApiError(
        httpStatus.BAD_REQUEST,
        `Status must be one of: ${QUOTE_STATUSES.join(", ")}.`,
      );
    }
    patch.status = updates.status;
  }

  if (updates.adminNotes !== undefined) {
    patch.adminNotes = str(updates.adminNotes).slice(0, 5000);
  }

  if (!Object.keys(patch).length) {
    throw new ApiError(httpStatus.BAD_REQUEST, "Nothing to update.");
  }

  const quote = await QuoteRequestModel.findByIdAndUpdate(
    id,
    { $set: patch },
    { new: true, runValidators: true },
  ).lean();

  if (!quote) throw new ApiError(httpStatus.NOT_FOUND, "Quote not found.");
  return quote;
};

/** Headline counts for the dashboard overview. */
const getQuoteStats = async () => {
  const [byStatus, totals, recent] = await Promise.all([
    QuoteRequestModel.aggregate<{ _id: string; count: number }>([
      { $group: { _id: "$status", count: { $sum: 1 } } },
    ]),
    QuoteRequestModel.aggregate<{
      _id: null;
      total: number;
      pipelineValue: number;
      averageValue: number;
      totalGuests: number;
    }>([
      {
        $group: {
          _id: null,
          total: { $sum: 1 },
          pipelineValue: { $sum: "$grandTotal" },
          averageValue: { $avg: "$grandTotal" },
          totalGuests: { $sum: "$guestCount" },
        },
      },
    ]),
    QuoteRequestModel.find().select(LIST_FIELDS).sort({ submittedAt: -1 }).limit(5).lean(),
  ]);

  const statusCounts = Object.fromEntries(
    QUOTE_STATUSES.map((s) => [s, byStatus.find((b) => b._id === s)?.count ?? 0]),
  ) as Record<QuoteStatus, number>;

  const summary = totals[0];

  return {
    statusCounts,
    total: summary?.total ?? 0,
    pipelineValue: Math.round((summary?.pipelineValue ?? 0) * 100) / 100,
    averageValue: Math.round((summary?.averageValue ?? 0) * 100) / 100,
    totalGuests: summary?.totalGuests ?? 0,
    recent,
  };
};

export const QuoteService = {
  submitQuoteRequest,
  normaliseSelections,
  getQuoteList,
  getQuoteById,
  updateQuoteAdminFields,
  getQuoteStats,
};
