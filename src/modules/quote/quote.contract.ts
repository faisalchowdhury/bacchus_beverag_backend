/**
 * Turns a stored quote into the values the Bartending Service Contract needs.
 *
 * The contract itself (terms, venue policies, Schedule A structure) is fixed
 * boilerplate and lives in `quote.pdf.ts`. Everything that varies from one
 * client to the next is computed here, so the renderer only ever lays out
 * strings that are already final.
 */

import type { IQuoteRequest } from "./quote.model";
import type { BarType, QuoteBreakdown, QuoteFormValues } from "./quote.interface";
import { money } from "./quote.pricing";

/** The venue this contract and its Exhibit A were written for. */
export const DEFAULT_VENUE =
  "Chateau Des Fleures Wedding Venue, 104 Pope Lake Rd, Angier, NC";

/** Minutes between last call and the bar closing. */
const LAST_CALL_LEAD_MINUTES = 30;

/** The venue rule: the bar opens an hour in and closes an hour before the end. */
const VENUE_BAR_BUFFER_MINUTES = 60;

const DAY = 24 * 60;

/* ── Small formatters ──────────────────────────────────────────────── */

const EM_DASH = "—";

const orDash = (value: unknown): string => {
  const text =
    typeof value === "string" ? value.trim() : value == null ? "" : String(value);
  return text.length ? text : EM_DASH;
};

/** "HH:MM" → minutes past midnight, or null if unparseable. */
const toMinutes = (value?: string): number | null => {
  const match = /^(\d{1,2}):(\d{2})$/.exec(String(value ?? "").trim());
  if (!match) return null;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (hours > 23 || minutes > 59) return null;
  return hours * 60 + minutes;
};

/** Minutes past midnight → "6:00 PM". Wraps past midnight. */
const fromMinutes = (value: number): string => {
  const wrapped = ((Math.round(value) % DAY) + DAY) % DAY;
  const hours24 = Math.floor(wrapped / 60);
  const minutes = wrapped % 60;
  const suffix = hours24 >= 12 ? "PM" : "AM";
  const hours12 = hours24 % 12 === 0 ? 12 : hours24 % 12;
  return `${hours12}:${String(minutes).padStart(2, "0")} ${suffix}`;
};

/** "18:00" → "6:00 PM", falling back to the raw value. */
export const clockTime = (value?: string): string => {
  const minutes = toMinutes(value);
  return minutes === null ? orDash(value) : fromMinutes(minutes);
};

/** "2026-09-12" → "Sat, Sep 12, 2026" — the sample contract's date style. */
export const longDate = (value?: string | Date | null): string => {
  if (!value) return EM_DASH;
  const date =
    value instanceof Date
      ? value
      : /^\d{4}-\d{2}-\d{2}$/.test(String(value).trim())
        ? new Date(`${String(value).trim()}T00:00:00Z`)
        : new Date(String(value));

  if (Number.isNaN(date.getTime())) return orDash(value as string);

  return date.toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  });
};

const plural = (count: number, one: string, many = `${one}s`) =>
  `${count} ${count === 1 ? one : many}`;

/** "Top Shelf" already carries the word, so "Top Shelf shelf" must not happen. */
const shelfName = (tier: string): string =>
  /shelf$/i.test(tier) ? tier : `${tier} shelf`;

/** "a Open Bar" reads wrong; pick the article from the leading sound. */
export const article = (word: string): string =>
  /^[aeiou]/i.test(word.trim()) ? "an" : "a";

/** Adds a full stop only when the text does not already end in punctuation. */
const endStop = (text: string): string =>
  /[.!?]$/.test(text.trim()) ? text.trim() : `${text.trim()}.`;

const hoursLabel = (hours: number) =>
  `${Number.isInteger(hours) ? hours : hours.toFixed(2)} ${hours === 1 ? "hour" : "hours"}`;

/* ── Service window ────────────────────────────────────────────────── */

export interface ServiceWindow {
  /** Whether start/end times were captured at all. */
  known: boolean;
  eventStart: string;
  eventEnd: string;
  /** Venue rule: one hour after the event starts. */
  barOpens: string;
  /** Venue rule: one hour before the event ends. */
  barCloses: string;
  barLastCall: string;
  /** The selected bar type's own window inside the mandatory bar window. */
  primaryOpens: string;
  primaryLastCall: string;
  primaryCloses: string;
  /**
   * The stretch the mandatory Cash Bar covers outside the primary window.
   * Empty when the primary service already spans the whole required window.
   */
  cashBarOpens: string;
  cashBarCloses: string;
  hasCashBarRemainder: boolean;
}

/**
 * Works out every time the contract quotes.
 *
 * The venue requires a bar from one hour after the event starts until one hour
 * before it ends. An Open Bar runs for the hours the client bought, starting
 * when the bar opens; whatever is left of the required window is covered by
 * the mandatory Cash Bar.
 */
export const buildServiceWindow = (
  selections: QuoteFormValues,
  breakdown: QuoteBreakdown,
): ServiceWindow => {
  const start = toMinutes(selections.eventStartTime);
  const end = toMinutes(selections.eventEndTime);

  if (start === null || end === null) {
    return {
      known: false,
      eventStart: orDash(selections.eventStartTime),
      eventEnd: orDash(selections.eventEndTime),
      barOpens: EM_DASH,
      barCloses: EM_DASH,
      barLastCall: EM_DASH,
      primaryOpens: EM_DASH,
      primaryLastCall: EM_DASH,
      primaryCloses: EM_DASH,
      cashBarOpens: EM_DASH,
      cashBarCloses: EM_DASH,
      hasCashBarRemainder: false,
    };
  }

  // Events routinely run past midnight, so work on a continuous timeline and
  // only wrap back to a clock face when formatting.
  const endAbsolute = end > start ? end : end + DAY;

  const barOpen = start + VENUE_BAR_BUFFER_MINUTES;
  const barClose = Math.max(barOpen, endAbsolute - VENUE_BAR_BUFFER_MINUTES);

  const isOpenBar = selections.barType === "Open Bar";
  const isConsumption = selections.barType === "Consumption Bar";

  // Only an Open Bar is sold by the hour; a Consumption Bar runs on its prepaid
  // balance and is contracted for the full required window.
  const primaryClose = isOpenBar
    ? Math.min(barClose, barOpen + Math.round(breakdown.openBarHours * 60))
    : barClose;

  const remainderMinutes = barClose - primaryClose;

  return {
    known: true,
    eventStart: fromMinutes(start),
    eventEnd: fromMinutes(endAbsolute),
    barOpens: fromMinutes(barOpen),
    barCloses: fromMinutes(barClose),
    barLastCall: fromMinutes(Math.max(barOpen, barClose - LAST_CALL_LEAD_MINUTES)),
    primaryOpens: fromMinutes(barOpen),
    primaryLastCall: fromMinutes(
      Math.max(barOpen, primaryClose - LAST_CALL_LEAD_MINUTES),
    ),
    primaryCloses: fromMinutes(primaryClose),
    cashBarOpens: fromMinutes(primaryClose),
    cashBarCloses: fromMinutes(barClose),
    hasCashBarRemainder: (isOpenBar || isConsumption) && remainderMinutes > 0,
  };
};

/* ── Beverage descriptions ─────────────────────────────────────────── */

/** How many signature cocktails were actually contracted for. */
export const cocktailCount = (selections: QuoteFormValues): number =>
  Math.min(Math.max(Math.round(Number(selections.signatureCocktailCount)) || 0, 0), 4);

const describeLiquor = (
  selections: QuoteFormValues,
  breakdown: QuoteBreakdown,
): string => {
  if (selections.liquorMode === "None") return "None selected";

  if (selections.liquorMode === "Full Shelf") {
    return `Full ${shelfName(selections.liquorTier)} access (${money(breakdown.liquorRate)} per guest, per hour)`;
  }

  const count = cocktailCount(selections);
  const named = (selections.signatureCocktails ?? [])
    .slice(0, count)
    .map((cocktail, index) => {
      const name =
        cocktail?.name?.trim() || `Signature Cocktail #${index + 1} (to be named)`;
      const liquors = cocktail?.liquors?.filter(Boolean) ?? [];
      return liquors.length ? `${name} (${liquors.join(" + ")})` : name;
    });

  const heading = `${plural(count, "signature cocktail")} from the ${shelfName(selections.liquorTier)} (${money(breakdown.liquorRate)} per guest, per hour)`;
  return named.length ? `${heading} — ${named.join("; ")}` : heading;
};

const describeWineBeer = (
  selections: QuoteFormValues,
  breakdown: QuoteBreakdown,
): string => {
  if (selections.wineBeerTier === "None") return "None selected";
  return `${selections.wineBeerTier} beer & unfortified wine (${money(breakdown.wineBeerRate)} per guest, per hour)`;
};

const describeChampagne = (selections: QuoteFormValues): string => {
  if (!selections.champagneToast) return "Not selected";

  const parts = [
    selections.champagneSelection,
    `${plural(selections.champagneGuests, "guest")} served`,
  ];
  if (selections.champagneNonAlcoholicGuests > 0) {
    parts.push(
      `${plural(selections.champagneNonAlcoholicGuests, "guest")} served sparkling grape juice`,
    );
  }
  if (selections.toastTime) parts.push(`toast at ${clockTime(selections.toastTime)}`);
  parts.push(selections.toastServiceStyle);

  return parts.join(" · ");
};

const describeGlassware = (selections: QuoteFormValues): string =>
  selections.glasswareRental
    ? `Bacchus Beverages rented glassware for ${plural(selections.guestCount, "guest")} — breakage fee included`
    : "Declined — Client supplies all glassware or disposables, delivered to bar staff before service begins";

const describeSpecialty = (selections: QuoteFormValues): string => {
  const request = selections.specialtyOrderRequest?.trim();
  if (!request) return "None requested";
  return selections.specialtyOrderQuantity > 0
    ? `${request} (quantity ${selections.specialtyOrderQuantity})`
    : request;
};

const describeAdditionalBars = (
  selections: QuoteFormValues,
  breakdown: QuoteBreakdown,
): string =>
  selections.additionalBarStations > 0
    ? `${plural(selections.additionalBarStations, "additional bar station")} beyond the included permanent bar (${breakdown.barStations} in total)`
    : "None — the included permanent bar only";

const describeSpecialRequests = (selections: QuoteFormValues): string => {
  const notes: string[] = [];
  if (selections.barType === "Cash Bar" && selections.openTab) {
    notes.push(
      "Host tab requested — a tab left open at the end of service incurs an automatic 20% gratuity",
    );
  }
  const restrictions = selections.tabRestrictions?.trim();
  if (restrictions) notes.push(`Tab restrictions: ${restrictions}`);
  return notes.length ? notes.map(endStop).join(" ") : "None specified";
};

/* ── The assembled contract model ──────────────────────────────────── */

export interface ContractLineItem {
  label: string;
  detail: string;
  amount: string;
}

export interface BarSectionFields {
  /** False when this section's bar type was not the one selected. */
  applicable: boolean;
  opens: string;
  lastCall: string;
  closes: string;
  bartenders: string;
  liquor: string;
  wineBeer: string;
  champagne: string;
  glassware: string;
  specialty: string;
  additionalBars: string;
  specialRequests: string;
}

export interface ContractData {
  quoteId: string;
  effectiveDate: string;
  status: string;

  client: {
    name: string;
    organisation: string;
    address: string;
    phone: string;
    email: string;
  };

  event: {
    date: string;
    type: string;
    venue: string;
    description: string;
    guestCount: string;
    specialRequests: string;
  };

  barType: BarType | string;
  /** "X" against the selected row of the Bar Service Type table. */
  barTypeMark: Record<BarType, string>;

  window: ServiceWindow;
  staffing: string;

  openBar: BarSectionFields;
  cashBar: BarSectionFields;
  consumptionBar: BarSectionFields;

  houseAccount: {
    amount: string;
    scope: string;
  };

  payment: {
    total: string;
    deposit: string;
    balance: string;
    subtotal: string;
    gratuity: string;
    tax: string;
    taxableBase: string;
    taxExemptTotal: string;
    lineItems: ContractLineItem[];
  };

  warnings: string[];
}

/** The blank a client fills in by hand before signing. */
const TO_BE_COMPLETED = "________________________________";

/** Everything the renderer needs, already formatted. */
export const buildContractData = (
  quote: IQuoteRequest & { _id?: unknown },
): ContractData => {
  const s = quote.selections;
  const b = quote.breakdown;

  const window = buildServiceWindow(s, b);

  const bartenders = `${plural(b.bartenderCount, "bartender")} (${b.baseBartenders} by guest count${
    b.additionalBartenders > 0
      ? ` + ${b.additionalBartenders} for additional stations`
      : ""
  })`;

  const shared = {
    bartenders,
    liquor: describeLiquor(s, b),
    wineBeer: describeWineBeer(s, b),
    champagne: describeChampagne(s),
    glassware: describeGlassware(s),
    specialty: describeSpecialty(s),
    additionalBars: describeAdditionalBars(s, b),
    specialRequests: describeSpecialRequests(s),
  };

  /** A bar section the client did not select reads the same way throughout. */
  const notApplicable = (filler = "N/A"): BarSectionFields => ({
    applicable: false,
    opens: filler,
    lastCall: filler,
    closes: filler,
    bartenders: filler,
    liquor: filler,
    wineBeer: filler,
    champagne: filler,
    glassware: filler,
    specialty: filler,
    additionalBars: filler,
    specialRequests: filler,
  });

  const isOpenBar = s.barType === "Open Bar";
  const isCashBar = s.barType === "Cash Bar";
  const isConsumption = s.barType === "Consumption Bar";

  const openBar: BarSectionFields = isOpenBar
    ? {
        applicable: true,
        opens: window.primaryOpens,
        lastCall: window.primaryLastCall,
        closes: window.primaryCloses,
        ...shared,
      }
    : notApplicable();

  // The Cash Bar section is live for a cash-bar booking, and also for the
  // mandatory hours either side of an Open or Consumption Bar.
  const cashBarLive = isCashBar || window.hasCashBarRemainder;
  const cashBar: BarSectionFields = cashBarLive
    ? {
        applicable: true,
        opens: isCashBar ? window.barOpens : window.cashBarOpens,
        lastCall: window.barLastCall,
        closes: window.barCloses,
        bartenders,
        // Nothing is prepaid on a cash bar — the shelf is simply available.
        liquor: isCashBar
          ? "Full bar available for purchase at posted per-drink prices"
          : shared.liquor,
        wineBeer: isCashBar
          ? "Beer & unfortified wine available for purchase at posted per-drink prices"
          : shared.wineBeer,
        champagne: shared.champagne,
        glassware: shared.glassware,
        specialty: shared.specialty,
        additionalBars: shared.additionalBars,
        specialRequests: shared.specialRequests,
      }
    : // The venue mandates a bar across the whole window, so a cash bar with no
      // hours means the primary service already covers it — not that the rule
      // was skipped. Say so rather than printing a bare "N/A".
      notApplicable("None required — the selected bar spans the full required window");

  const consumptionBar: BarSectionFields = isConsumption
    ? {
        applicable: true,
        opens: window.primaryOpens,
        lastCall: window.primaryLastCall,
        closes: window.primaryCloses,
        ...shared,
      }
    : notApplicable();

  const lineItems: ContractLineItem[] = b.lineItems.map((item) => ({
    label: item.label,
    detail: `${item.detail ?? ""}${item.taxExempt ? " · tax exempt" : ""}`.trim(),
    amount: money(item.amount),
  }));

  const deposit = Math.round(b.grandTotal * 50) / 100;

  return {
    quoteId: String(quote._id ?? ""),
    effectiveDate: longDate(quote.submittedAt ?? new Date()),
    status: quote.status,

    client: {
      name: orDash(s.customerName),
      // The wizard does not collect these, so they stay open for the client to
      // complete before signing — exactly as the blank template does.
      organisation: TO_BE_COMPLETED,
      address: TO_BE_COMPLETED,
      phone: orDash(s.customerPhone),
      email: orDash(s.customerEmail),
    },

    event: {
      date: longDate(s.eventDate),
      type: orDash(s.eventType),
      venue: s.venueLocation?.trim() || DEFAULT_VENUE,
      description: window.known
        ? `${orDash(s.eventType)}, ${window.eventStart} – ${window.eventEnd} (${hoursLabel(b.eventHours)})`
        : orDash(s.eventType),
      guestCount: `${s.guestCount} (including minors)`,
      specialRequests: describeSpecialRequests(s),
    },

    barType: s.barType,
    barTypeMark: {
      "Open Bar": isOpenBar ? "X" : "",
      "Consumption Bar": isConsumption ? "X" : "",
      "Cash Bar": isCashBar ? "X" : "",
    },

    window,
    staffing: `${bartenders} across ${hoursLabel(b.staffedHours)} on site — ${hoursLabel(b.eventHours)} of event time plus one hour setup and one hour teardown`,

    openBar,
    cashBar,
    consumptionBar,

    houseAccount: {
      amount: isConsumption ? money(b.houseAccountFee) : "N/A",
      scope: isConsumption ? s.houseAccountScope : "N/A",
    },

    payment: {
      total: money(b.grandTotal),
      deposit: money(deposit),
      balance: money(Math.round((b.grandTotal - deposit) * 100) / 100),
      subtotal: money(b.subtotal),
      gratuity: money(b.gratuity),
      tax: money(b.tax),
      taxableBase: money(b.taxableBase),
      taxExemptTotal: money(b.taxExemptTotal),
      lineItems,
    },

    warnings: b.warnings ?? [],
  };
};

/** Filename the browser should save the contract under. */
export const contractFileName = (
  quote: IQuoteRequest & { _id?: unknown },
): string => {
  const name = (quote.customerName || "client")
    .normalize("NFKD")
    .replace(/[^\w\s-]/g, "")
    .trim()
    .replace(/\s+/g, "-")
    .slice(0, 60);
  const date = (quote.eventDate || "").trim().replace(/[^\d-]/g, "") || "undated";
  return `Bacchus-Bartending-Contract-${name || "client"}-${date}.pdf`;
};
