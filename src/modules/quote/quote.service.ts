import httpStatus from "http-status";
import { isValidObjectId } from "mongoose";

import ApiError from "../../errors/ApiError";
import { DASHBOARD_URL, QUOTE_NOTIFY_EMAIL } from "../../config";
import {
  isMailConfigured,
  sendEmail,
  type EmailAttachment,
} from "../../utils/sendEmail";
import { StaffService } from "../staff/staff.service";
import {
  buildAcceptanceClientEmail,
  buildAcceptanceTeamEmail,
  buildClientQuoteEmail,
  buildOwnerQuoteEmail,
} from "./quote.email";
import {
  buildAcceptanceUrl,
  createAcceptanceToken,
  hashAcceptanceToken,
  isWellFormedToken,
} from "./quote.acceptance";
import { buildContractData, contractFileName } from "./quote.contract";
import {
  QuoteRequestModel,
  QUOTE_ACCEPTANCE_STATUSES,
  QUOTE_STATUSES,
  type IQuoteRequest,
  type QuoteAcceptanceStatus,
  type QuoteStatus,
} from "./quote.model";
import { renderContractPdf } from "./quote.pdf";
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
  /** Where the client's Accept button points. Never returned to the browser. */
  acceptUrl: string;
}

/**
 * Everyone who should receive a quote notification, as plain addresses.
 *
 * Admins and opted-in staff come from the accounts table; QUOTE_NOTIFY_EMAIL
 * is merged in so a shared inbox configured before staff accounts existed is
 * not silently dropped. De-duplicated, since one person often appears twice.
 */
const resolveTeamAddresses = async (
  event: "newQuote" | "quoteAccepted",
): Promise<string[]> => {
  const recipients = await StaffService.getNotificationRecipients(event).catch(
    (error) => {
      // A database hiccup here must not stop the notification entirely — fall
      // back to the configured inbox rather than telling nobody.
      console.error("[quote] Could not load notification recipients:", error);
      return [] as { email: string }[];
    },
  );

  const seen = new Set<string>();
  const addresses: string[] = [];

  for (const address of [
    ...recipients.map((recipient) => recipient.email),
    ...QUOTE_NOTIFY_EMAIL,
  ]) {
    const clean = String(address ?? "").trim().toLowerCase();
    if (!clean || seen.has(clean)) continue;
    seen.add(clean);
    addresses.push(clean);
  }

  return addresses;
};

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

  // Issued up front so the estimate email can carry the Accept button. Only
  // the hash is stored; the raw token exists just long enough to build the URL.
  const acceptance = createAcceptanceToken();

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
    acceptanceStatus: "Pending",
    acceptanceTokenHash: acceptance.hash,
    acceptanceTokenExpiresAt: acceptance.expiresAt,
  });

  const acceptUrl = buildAcceptanceUrl(acceptance.token);

  if (!isMailConfigured()) {
    console.error(
      "[quote] SMTP is not configured — quote stored but no email was sent.",
    );
    return {
      breakdown,
      clientEmailSent: false,
      ownerEmailSent: false,
      quoteId: String(record._id),
      acceptUrl,
    };
  }

  // The submission is already saved, so a mail failure must not 500 the
  // request and make the client think their quote vanished.
  const clientMail = buildClientQuoteEmail(selections, breakdown, acceptUrl);
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

  /*
   * The venue copy goes to every admin plus any staff who have new-quote
   * notifications switched on. QUOTE_NOTIFY_EMAIL is folded in as well so a
   * shared inbox configured before staff accounts existed keeps working.
   */
  const ownerMail = buildOwnerQuoteEmail(selections, breakdown, submittedAt);
  const teamAddresses = await resolveTeamAddresses("newQuote");

  const ownerEmailSent = teamAddresses.length
    ? await sendEmail({
        to: teamAddresses,
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
    acceptUrl,
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
  /** "Pending" | "Accepted" | "Declined" — what the client did. */
  acceptanceStatus?: string;
  barType?: string;
  sortBy?: string;
  sortOrder?: "asc" | "desc";
}

/** Fields the list view needs — the full selections/breakdown stay out of it. */
const LIST_FIELDS =
  "customerName customerEmail customerPhone eventType eventDate venueLocation " +
  "guestCount barType grandTotal status clientEmailSent ownerEmailSent submittedAt createdAt " +
  "acceptanceStatus acceptedAt";

const SORTABLE = new Set([
  "submittedAt",
  "createdAt",
  "grandTotal",
  "guestCount",
  "eventDate",
  "customerName",
  "acceptedAt",
]);

/** Paginated quote list for the dashboard. */
const getQuoteList = async ({
  page = 1,
  limit = 10,
  search,
  status,
  acceptanceStatus,
  barType,
  sortBy = "submittedAt",
  sortOrder = "desc",
}: QuoteListFilters) => {
  const query: Record<string, unknown> = {};

  if (status && QUOTE_STATUSES.includes(status as QuoteStatus)) {
    query.status = status;
  }
  if (
    acceptanceStatus &&
    QUOTE_ACCEPTANCE_STATUSES.includes(acceptanceStatus as QuoteAcceptanceStatus)
  ) {
    // Quotes predating this feature have no acceptanceStatus at all, so
    // "Pending" has to mean "not accepted or declined", not just the literal.
    query.acceptanceStatus =
      acceptanceStatus === "Pending"
        ? { $in: ["Pending", null] }
        : acceptanceStatus;
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

/**
 * One quote, with everything the client submitted.
 *
 * The acceptance token hash is projected away. Nothing in the dashboard needs
 * it, and a credential-shaped value is better off never leaving the database —
 * even a hash, and even on an admin-only route.
 */
const getQuoteById = async (id: string) => {
  if (!isValidObjectId(id)) {
    throw new ApiError(httpStatus.BAD_REQUEST, "That is not a valid quote id.");
  }

  const quote = await QuoteRequestModel.findById(id)
    .select("-acceptanceTokenHash")
    .lean();
  if (!quote) {
    throw new ApiError(httpStatus.NOT_FOUND, "Quote not found.");
  }
  return quote;
};

export interface QuoteContractResult {
  buffer: Buffer;
  fileName: string;
}

/**
 * The signable Bartending Service Contract for one quote.
 *
 * Rendered on demand rather than stored: the terms are boilerplate and the
 * figures come from the quote, so there is nothing to keep that regenerating
 * would not reproduce — and a stored PDF would silently go stale the moment
 * the quote's status or notes changed.
 */
const getQuoteContractPdf = async (id: string): Promise<QuoteContractResult> => {
  const quote = await getQuoteById(id);

  if (!quote.selections || !quote.breakdown) {
    throw new ApiError(
      httpStatus.UNPROCESSABLE_ENTITY,
      "This quote predates the contract generator and is missing the selections it needs.",
    );
  }

  const buffer = await renderContractPdf(buildContractData(quote));

  return { buffer, fileName: contractFileName(quote) };
};

/* ══════════════════════════════════════════════════════════════════════
   Client-facing acceptance
   ══════════════════════════════════════════════════════════════════════ */

/**
 * What the public accept page is allowed to see.
 *
 * Deliberately hand-built rather than returning the record: the quote document
 * holds `adminNotes`, the pipeline status and the token hash, none of which
 * belong in a response anyone holding a link can fetch.
 */
export interface PublicQuoteView {
  quoteId: string;
  acceptanceStatus: QuoteAcceptanceStatus;
  acceptedAt: string | null;
  customerName: string;
  customerEmail: string;
  customerPhone: string;
  eventType: string;
  eventDate: string;
  venueLocation: string;
  guestCount: number;
  barType: string;
  submittedAt: string;
  selections: QuoteFormValues;
  breakdown: QuoteBreakdown;
  /** True once the link has aged out — the page explains rather than 404s. */
  linkExpired: boolean;
}

const toPublicView = (
  quote: IQuoteRequest & { _id?: unknown },
  linkExpired: boolean,
): PublicQuoteView => ({
  quoteId: String(quote._id ?? ""),
  acceptanceStatus: quote.acceptanceStatus ?? "Pending",
  acceptedAt: quote.acceptedAt ? new Date(quote.acceptedAt).toISOString() : null,
  customerName: quote.customerName,
  customerEmail: quote.customerEmail,
  customerPhone: quote.customerPhone ?? "",
  eventType: quote.eventType ?? "",
  eventDate: quote.eventDate ?? "",
  venueLocation: quote.venueLocation ?? "",
  guestCount: quote.guestCount,
  barType: quote.barType,
  submittedAt: new Date(quote.submittedAt).toISOString(),
  selections: quote.selections,
  breakdown: quote.breakdown,
  linkExpired,
});

const LINK_NOT_VALID =
  "This link is not valid. Please use the button in your estimate email, or " +
  "contact us and we will send you a fresh copy.";

/** Finds the quote a raw acceptance token belongs to. */
const findQuoteByAcceptanceToken = async (token: string) => {
  if (!isWellFormedToken(token)) {
    throw new ApiError(httpStatus.NOT_FOUND, LINK_NOT_VALID);
  }

  const quote = await QuoteRequestModel.findOne({
    acceptanceTokenHash: hashAcceptanceToken(token.trim()),
  });

  if (!quote) throw new ApiError(httpStatus.NOT_FOUND, LINK_NOT_VALID);
  return quote;
};

const isLinkExpired = (quote: IQuoteRequest): boolean =>
  Boolean(
    quote.acceptanceTokenExpiresAt &&
      new Date(quote.acceptanceTokenExpiresAt).getTime() < Date.now(),
  );

/**
 * GET side of the accept page — the client reviewing before they commit.
 *
 * An expired link still returns the quote: the client should see what they
 * were quoted and be told the link needs reissuing, not hit a dead end.
 */
const getQuoteByAcceptanceToken = async (token: string): Promise<PublicQuoteView> => {
  const quote = await findQuoteByAcceptanceToken(token);
  return toPublicView(quote.toObject() as IQuoteRequest, isLinkExpired(quote));
};

export interface AcceptQuoteResult {
  quote: PublicQuoteView;
  /** False when this click repeated an acceptance already recorded. */
  firstAcceptance: boolean;
  teamEmailSent: boolean;
  clientEmailSent: boolean;
  contractAttached: boolean;
}

/**
 * Records a client's acceptance and notifies the team with the contract.
 *
 * Idempotent by design. Mail clients prefetch links, people double-click, and
 * a client may reopen the same email a week later — none of that should
 * re-notify the whole team. The acceptance is claimed with a conditional
 * update, so only the first request through does the work.
 */
const acceptQuoteByToken = async (
  token: string,
  context: { ip?: string; userAgent?: string } = {},
): Promise<AcceptQuoteResult> => {
  const found = await findQuoteByAcceptanceToken(token);

  if (isLinkExpired(found) && found.acceptanceStatus !== "Accepted") {
    throw new ApiError(
      httpStatus.GONE,
      "This acceptance link has expired. Please contact us and we will send you a fresh copy of your estimate.",
    );
  }

  const acceptedAt = new Date();

  /*
   * Claim the acceptance atomically: the filter only matches while the quote
   * is not yet Accepted, so concurrent clicks cannot both send the team email.
   */
  const claimed = await QuoteRequestModel.findOneAndUpdate(
    { _id: found._id, acceptanceStatus: { $ne: "Accepted" } },
    {
      $set: {
        acceptanceStatus: "Accepted",
        acceptedAt,
        acceptanceIp: String(context.ip ?? "").slice(0, 120),
        acceptanceUserAgent: String(context.userAgent ?? "").slice(0, 400),
      },
    },
    { new: true },
  );

  if (!claimed) {
    // Already accepted — report the existing state rather than notifying again.
    const existing = await QuoteRequestModel.findById(found._id).lean();
    return {
      quote: toPublicView(existing as IQuoteRequest, false),
      firstAcceptance: false,
      teamEmailSent: false,
      clientEmailSent: false,
      contractAttached: false,
    };
  }

  const selections = claimed.selections;
  const breakdown = claimed.breakdown;
  const quoteId = String(claimed._id);

  // The acceptance is recorded. Everything below is best-effort: a mail or PDF
  // failure must not make the client think their click did not register.
  let contractAttached = false;
  let attachments: EmailAttachment[] = [];

  try {
    const contractQuote = claimed.toObject() as IQuoteRequest & { _id: unknown };
    attachments = [
      {
        filename: contractFileName(contractQuote),
        content: await renderContractPdf(buildContractData(contractQuote)),
        contentType: "application/pdf",
      },
    ];
    contractAttached = true;
  } catch (error) {
    console.error(`[quote] Contract PDF failed for accepted quote ${quoteId}:`, error);
  }

  if (!isMailConfigured()) {
    console.error("[quote] SMTP is not configured — acceptance notified nobody.");
    return {
      quote: toPublicView(claimed.toObject() as IQuoteRequest, false),
      firstAcceptance: true,
      teamEmailSent: false,
      clientEmailSent: false,
      contractAttached,
    };
  }

  const teamAddresses = await resolveTeamAddresses("quoteAccepted");
  const teamMail = buildAcceptanceTeamEmail(selections, breakdown, {
    acceptedAt,
    quoteId,
    dashboardUrl: `${DASHBOARD_URL.replace(/\/+$/, "")}/quotes/${quoteId}`,
    contractAttached,
  });

  const teamEmailSent = teamAddresses.length
    ? await sendEmail({
        to: teamAddresses,
        subject: teamMail.subject,
        html: teamMail.html,
        replyTo: selections.customerEmail,
        attachments,
      })
        .then(() => true)
        .catch((error) => {
          console.error("[quote] Acceptance notification to the team failed:", error);
          return false;
        })
    : false;

  const clientMail = buildAcceptanceClientEmail(selections, breakdown, acceptedAt);
  const clientEmailSent = await sendEmail({
    to: selections.customerEmail,
    subject: clientMail.subject,
    html: clientMail.html,
  })
    .then(() => true)
    .catch((error) => {
      console.error("[quote] Acceptance confirmation to the client failed:", error);
      return false;
    });

  const finalQuote = await QuoteRequestModel.findByIdAndUpdate(
    claimed._id,
    { $set: { acceptanceNotifiedEmails: teamEmailSent ? teamAddresses : [] } },
    { new: true },
  ).lean();

  return {
    quote: toPublicView((finalQuote ?? claimed.toObject()) as IQuoteRequest, false),
    firstAcceptance: true,
    teamEmailSent,
    clientEmailSent,
    contractAttached,
  };
};

/**
 * Reissues an acceptance link and re-sends the estimate.
 *
 * For the case the client says they never got the email, or clicked after the
 * link aged out. Admin only, and it invalidates whatever token came before.
 */
const reissueAcceptanceLink = async (id: string) => {
  if (!isValidObjectId(id)) {
    throw new ApiError(httpStatus.BAD_REQUEST, "That is not a valid quote id.");
  }

  const quote = await QuoteRequestModel.findById(id);
  if (!quote) throw new ApiError(httpStatus.NOT_FOUND, "Quote not found.");

  if (quote.acceptanceStatus === "Accepted") {
    throw new ApiError(
      httpStatus.CONFLICT,
      "This quote has already been accepted — there is nothing to resend.",
    );
  }

  const acceptance = createAcceptanceToken();
  quote.acceptanceTokenHash = acceptance.hash;
  quote.acceptanceTokenExpiresAt = acceptance.expiresAt;
  await quote.save();

  const acceptUrl = buildAcceptanceUrl(acceptance.token);

  if (!isMailConfigured()) return { acceptUrl, emailSent: false };

  const mail = buildClientQuoteEmail(quote.selections, quote.breakdown, acceptUrl);
  const emailSent = await sendEmail({
    to: quote.customerEmail,
    subject: mail.subject,
    html: mail.html,
  })
    .then(() => true)
    .catch((error) => {
      console.error("[quote] Resending the estimate failed:", error);
      return false;
    });

  return { acceptUrl, emailSent };
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
  const [byStatus, byAcceptance, totals, acceptedTotals, recent] = await Promise.all([
    QuoteRequestModel.aggregate<{ _id: string; count: number }>([
      { $group: { _id: "$status", count: { $sum: 1 } } },
    ]),
    QuoteRequestModel.aggregate<{ _id: string; count: number }>([
      { $group: { _id: "$acceptanceStatus", count: { $sum: 1 } } },
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
    // Accepted value is the figure that actually matters to the owner — it is
    // money the venue is about to contract, not money it hopes to.
    QuoteRequestModel.aggregate<{ _id: null; count: number; value: number }>([
      { $match: { acceptanceStatus: "Accepted" } },
      { $group: { _id: null, count: { $sum: 1 }, value: { $sum: "$grandTotal" } } },
    ]),
    QuoteRequestModel.find().select(LIST_FIELDS).sort({ submittedAt: -1 }).limit(5).lean(),
  ]);

  const statusCounts = Object.fromEntries(
    QUOTE_STATUSES.map((s) => [s, byStatus.find((b) => b._id === s)?.count ?? 0]),
  ) as Record<QuoteStatus, number>;

  const summary = totals[0];
  const accepted = acceptedTotals[0];

  const acceptanceCounts = Object.fromEntries(
    QUOTE_ACCEPTANCE_STATUSES.map((s) => [
      s,
      byAcceptance.find((b) => b._id === s)?.count ?? 0,
    ]),
  ) as Record<QuoteAcceptanceStatus, number>;

  // Records written before acceptance tracking existed have no value for the
  // field; they are pending by any sensible reading.
  acceptanceCounts.Pending +=
    byAcceptance.find((b) => b._id === null || b._id === undefined)?.count ?? 0;

  const acceptedCount = accepted?.count ?? 0;
  const total = summary?.total ?? 0;

  return {
    statusCounts,
    acceptanceCounts,
    total,
    pipelineValue: Math.round((summary?.pipelineValue ?? 0) * 100) / 100,
    averageValue: Math.round((summary?.averageValue ?? 0) * 100) / 100,
    totalGuests: summary?.totalGuests ?? 0,
    acceptedCount,
    acceptedValue: Math.round((accepted?.value ?? 0) * 100) / 100,
    /** Percentage of quotes the client accepted, to one decimal place. */
    acceptanceRate: total ? Math.round((acceptedCount / total) * 1000) / 10 : 0,
    recent,
  };
};

export const QuoteService = {
  submitQuoteRequest,
  normaliseSelections,
  getQuoteList,
  getQuoteById,
  getQuoteContractPdf,
  updateQuoteAdminFields,
  getQuoteStats,

  getQuoteByAcceptanceToken,
  acceptQuoteByToken,
  reissueAcceptanceLink,
};
