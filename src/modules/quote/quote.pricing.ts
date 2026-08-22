import type {
  ChampagneSelection,
  LiquorTier,
  QuoteBreakdown,
  QuoteFormValues,
  QuoteLineItem,
  WineBeerTier,
} from "./quote.interface";

/* ══════════════════════════════════════════════════════════════════════
   RATE CARD

   Server-side mirror of the frontend rate card
   (`src/features/quote-wizard/pricing.ts`). The wizard sends its own
   computed totals, but a browser payload can say anything — the figures
   that get emailed and stored are the ones recalculated here.

   ⚠ These two files must stay in step. Change a rate here and change it
     there, or the client will see one price and be quoted another.
   ══════════════════════════════════════════════════════════════════════ */

export const RATES = {
  /**
   * Glassware rental, per guest. Inclusive of the breakage fee — there is no
   * separate breakage charge.
   */
  glasswarePerGuest: 5,

  /** Bartender rate, per hour, per bartender. */
  bartenderHourlyRate: 45,
  /** 1 hour setup before service + 1 hour teardown after service. */
  staffingBufferHours: 2,

  /** Per additional bar station beyond the included permanent bar. */
  additionalBarSetupFee: 350,
  /** Every additional bar station also requires one additional bartender. */
  bartendersPerAdditionalBar: 1,

  /** Mandatory on every package. */
  serviceFee: 150,
  /** Cash Bar only — $0 for Consumption Bar and Open Bar. */
  cashBarAdminFee: 550,

  /** Beer + wine + liquor must reach this or the difference is charged. */
  barMinimum: 2000,
  /** Consumption Bar prepaid house account floor. */
  houseAccountMinimum: 2000,

  /** Mandatory gratuity on the package subtotal. */
  gratuityRate: 0.12,
  /** Applied to (subtotal + gratuity − tax-exempt charges). */
  taxRate: 0.07,
  /** Charged automatically on a tab left open at the end of the event. */
  openTabGratuityRate: 0.2,

  maxSignatureCocktails: 4,
  /** Liquors a client may pick per signature cocktail. */
  maxLiquorsPerCocktail: 2,
  /** Above this, the published bartender table stops and concierge review applies. */
  publishedGuestCeiling: 200,
} as const;

/** Bartenders included by guest count, before additional bar stations. */
export const BARTENDER_TIERS = [
  { maxGuests: 50, bartenders: 2, label: "50 guests or fewer" },
  { maxGuests: 125, bartenders: 3, label: "51 – 125 guests" },
  { maxGuests: 200, bartenders: 4, label: "126 – 200 guests" },
] as const;

/** Beer + unfortified wine, per guest per Open Bar hour. */
export const WINE_BEER_TIERS: { id: WineBeerTier; label: string; rate: number }[] = [
  { id: "None", label: "No Beer & Wine", rate: 0 },
  { id: "Tier 1", label: "Tier 1 Wine + Beer", rate: 2.5 },
  { id: "Tier 2", label: "Tier 2 Wine + Beer", rate: 3.5 },
  { id: "Tier 3", label: "Tier 3 Wine + Beer", rate: 4.5 },
];

/** Full shelf access, per guest per Open Bar hour. */
export const FULL_SHELF_RATES: Record<LiquorTier, number> = {
  Well: 5.5,
  Call: 7.5,
  "Top Shelf": 11.0,
  Platinum: 19.0,
};

/**
 * Signature cocktail rates, per guest per Open Bar hour, indexed by the
 * number of cocktails offered (1 – 4).
 */
export const SIGNATURE_COCKTAIL_RATES: Record<
  LiquorTier,
  [number, number, number, number]
> = {
  Well: [2, 3, 4, 5],
  Call: [3, 4, 5, 6],
  "Top Shelf": [6, 7, 8, 9],
  Platinum: [13, 14, 15, 16],
};

/** Champagne toast options, per guest receiving champagne. */
export const CHAMPAGNE_OPTIONS: {
  id: ChampagneSelection;
  label: string;
  pricePerGuest: number;
}[] = [
  { id: "J. Roget Brut", label: "J. Roget Brut", pricePerGuest: 5 },
  {
    id: "Perelada Cava Nature Stars Reserva",
    label: "Perelada Cava Nature Stars Reserva",
    pricePerGuest: 8,
  },
  {
    id: "Devaux Blanc de Noirs Champagne",
    label: "Devaux Blanc de Noirs Champagne",
    pricePerGuest: 16,
  },
];

/* ══════════════════════════════════════════════════════════════════════
   HELPERS
   ══════════════════════════════════════════════════════════════════════ */

const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;
const atLeast0 = (n: number) => (Number.isFinite(n) && n > 0 ? n : 0);

/**
 * Bartenders required by guest count alone.
 * The published table stops at 200 guests; beyond it we continue the same
 * ~75-guest cadence so the estimate never under-staffs.
 */
export function bartendersForGuests(guestCount: number): number {
  const guests = atLeast0(guestCount);
  if (guests === 0) return 0;
  for (const tier of BARTENDER_TIERS) {
    if (guests <= tier.maxGuests) return tier.bartenders;
  }
  const last = BARTENDER_TIERS[BARTENDER_TIERS.length - 1];
  return last.bartenders + Math.ceil((guests - last.maxGuests) / 75);
}

/** Service hours between two "HH:MM" times. Handles events crossing midnight. */
export function computeEventHours(start: string, end: string): number {
  if (!start || !end) return 0;
  const [sh, sm] = start.split(":").map(Number);
  const [eh, em] = end.split(":").map(Number);
  if ([sh, sm, eh, em].some((n) => !Number.isFinite(n))) return 0;

  let minutes = eh * 60 + em - (sh * 60 + sm);
  if (minutes <= 0) minutes += 24 * 60; // crosses midnight
  return round2(minutes / 60);
}

/** The per-guest-per-hour liquor rate for the current selection. */
export function liquorRateFor(
  mode: QuoteFormValues["liquorMode"],
  tier: LiquorTier,
  cocktailCount: number,
): number {
  if (mode === "Full Shelf") return FULL_SHELF_RATES[tier] ?? 0;
  if (mode === "Signature Cocktails") {
    const count = Math.min(
      Math.max(Math.round(cocktailCount) || 1, 1),
      RATES.maxSignatureCocktails,
    );
    return SIGNATURE_COCKTAIL_RATES[tier]?.[count - 1] ?? 0;
  }
  return 0;
}

export const wineBeerRateFor = (tier: WineBeerTier): number =>
  WINE_BEER_TIERS.find((t) => t.id === tier)?.rate ?? 0;

export const champagneRateFor = (selection: ChampagneSelection): number =>
  CHAMPAGNE_OPTIONS.find((o) => o.id === selection)?.pricePerGuest ?? 0;

export const money = (n: number) =>
  `$${(Number.isFinite(n) ? n : 0).toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;

/* ══════════════════════════════════════════════════════════════════════
   THE QUOTE ENGINE

   Order of operations:
     1.  Glassware rental            guests × $5              (optional)
     2.  Staffing                    (event hours + 2) × bartenders × $45
     3.  Additional bar setup        stations × $350
     4.  Beer & wine                 guests × Open Bar hours × tier rate
     5.  Liquor / signature cocktails guests × Open Bar hours × tier rate
     6.  Bar minimum                 max(0, $2,000 − (4 + 5))
     7.  Champagne toast             champagne guests × bottle rate
     8.  Cash Bar admin fee          $550, or $0 for Open/Consumption
     9.  Consumption house account   max($2,000, requested)
    10.  Service fee                 $150, always
         Subtotal   = 1 … 10
         Gratuity   = Subtotal × 12%
         Tax        = (Subtotal + Gratuity − tax-exempt charges) × 7%
         Grand total = Subtotal + Gratuity + Tax
   ══════════════════════════════════════════════════════════════════════ */

export function calculateQuote(values: QuoteFormValues): QuoteBreakdown {
  const warnings: string[] = [];

  const guestCount = Math.floor(atLeast0(Number(values.guestCount)));
  const barType = values.barType || "Open Bar";
  const isOpenBar = barType === "Open Bar";
  const isCashBar = barType === "Cash Bar";
  const isConsumptionBar = barType === "Consumption Bar";

  /* ── Hours ─────────────────────────────────────────────────────── */
  const eventHours = computeEventHours(values.eventStartTime, values.eventEndTime);
  const staffedHours = eventHours > 0 ? round2(eventHours + RATES.staffingBufferHours) : 0;

  // The hourly beverage rate applies only to the hours an Open Bar is offered,
  // and an Open Bar cannot run longer than the event itself.
  const requestedOpenBarHours = atLeast0(Number(values.openBarHours));
  const openBarHours = isOpenBar ? round2(Math.min(requestedOpenBarHours, eventHours)) : 0;

  if (eventHours === 0) {
    warnings.push(
      "Enter the event start and end times so service hours and staffing can be calculated.",
    );
  }
  if (guestCount > RATES.publishedGuestCeiling) {
    warnings.push(
      `Guest counts above ${RATES.publishedGuestCeiling} fall outside the published bartender table and require concierge review.`,
    );
  }

  /* ── 1. Glassware rental ───────────────────────────────────────── */
  const glasswareFee = values.glasswareRental
    ? round2(guestCount * RATES.glasswarePerGuest)
    : 0;

  /* ── 2 & 3. Bar stations and staffing ──────────────────────────── */
  const additionalBarStations = Math.floor(atLeast0(Number(values.additionalBarStations)));
  const barStations = 1 + additionalBarStations; // one permanent bar is always included
  const baseBartenders = bartendersForGuests(guestCount);
  const additionalBartenders = additionalBarStations * RATES.bartendersPerAdditionalBar;
  const bartenderCount = baseBartenders + additionalBartenders;

  const staffingFee = round2(staffedHours * bartenderCount * RATES.bartenderHourlyRate);
  const additionalBarSetupFee = round2(
    additionalBarStations * RATES.additionalBarSetupFee,
  );

  /* ── 4. Beer & unfortified wine (Open Bar only) ────────────────── */
  const wineBeerRate = isOpenBar ? wineBeerRateFor(values.wineBeerTier) : 0;
  const wineBeerFee = round2(wineBeerRate * guestCount * openBarHours);

  /* ── 5. Liquor & signature cocktails (Open Bar only) ───────────── */
  const liquorMode = isOpenBar ? values.liquorMode : "None";
  const liquorRate = isOpenBar
    ? liquorRateFor(liquorMode, values.liquorTier, values.signatureCocktailCount)
    : 0;
  const liquorFee = round2(liquorRate * guestCount * openBarHours);

  if (isOpenBar && liquorMode !== "None" && wineBeerRate === 0) {
    warnings.push(
      "Beer & wine is mandatory whenever liquor is selected — choose a wine + beer tier to complete the proposal.",
    );
  }
  if (isOpenBar && liquorMode === "Signature Cocktails") {
    const count = Math.min(
      Math.max(Math.round(Number(values.signatureCocktailCount)) || 1, 1),
      RATES.maxSignatureCocktails,
    );
    const named = (values.signatureCocktails ?? [])
      .slice(0, count)
      .filter((c) => c?.name?.trim());
    if (named.length < count) {
      warnings.push(
        `Name all ${count} signature cocktail${count > 1 ? "s" : ""} so our mixologists can build the recipes.`,
      );
    }
  }
  if (isOpenBar && openBarHours === 0 && eventHours > 0) {
    warnings.push(
      "Set the number of Open Bar hours — beverage rates apply only to hours the Open Bar is offered.",
    );
  }

  /* ── 6. Bar minimum ───────────────────────────────────────────────
     Tested against beer + wine + liquor only, excluding every other
     event cost. Cash and Consumption bars carry their own floor
     ($550 admin fee / $2,000 house account) instead. */
  const beverageSubtotal = round2(wineBeerFee + liquorFee);
  const barMinimumFee = isOpenBar
    ? round2(Math.max(0, RATES.barMinimum - beverageSubtotal))
    : 0;

  if (barMinimumFee > 0 && beverageSubtotal > 0) {
    warnings.push(
      `Beverage selections total ${money(beverageSubtotal)} — ${money(barMinimumFee)} has been added to meet the ${money(RATES.barMinimum)} bar minimum.`,
    );
  }

  /* ── 7. Champagne toast ────────────────────────────────────────── */
  const champagneGuests = values.champagneToast
    ? Math.floor(atLeast0(Number(values.champagneGuests)))
    : 0;
  const champagneNonAlcoholicGuests = values.champagneToast
    ? Math.floor(atLeast0(Number(values.champagneNonAlcoholicGuests)))
    : 0;
  const champagneRate = values.champagneToast
    ? champagneRateFor(values.champagneSelection)
    : 0;
  const champagneFee = round2(champagneGuests * champagneRate);

  if (
    values.champagneToast &&
    guestCount > 0 &&
    champagneGuests + champagneNonAlcoholicGuests > guestCount
  ) {
    warnings.push(
      "Champagne and non-alcoholic toast counts add up to more than the total guest count.",
    );
  }

  /* ── 8, 9, 10. Bar-type fees and the mandatory service fee ─────── */
  const cashBarAdminFee = isCashBar ? RATES.cashBarAdminFee : 0;
  const houseAccountFee = isConsumptionBar
    ? round2(
        Math.max(RATES.houseAccountMinimum, atLeast0(Number(values.houseAccountAmount))),
      )
    : 0;
  const serviceFee = RATES.serviceFee;

  if (isCashBar && values.openTab) {
    warnings.push(
      `Tabs must be closed before the event concludes. A tab left open automatically incurs a ${RATES.openTabGratuityRate * 100}% gratuity.`,
    );
  }
  if (
    isConsumptionBar &&
    atLeast0(Number(values.houseAccountAmount)) < RATES.houseAccountMinimum
  ) {
    warnings.push(
      `The house account has been raised to the ${money(RATES.houseAccountMinimum)} Consumption Bar minimum.`,
    );
  }
  if (!isOpenBar && (values.specialtyOrderRequest ?? "").trim()) {
    warnings.push(
      "Specialty beer & wine requests are purchased in advance and billed on the final invoice once availability and cost are confirmed.",
    );
  }

  /* ── Roll-up ───────────────────────────────────────────────────── */
  const subtotal = round2(
    glasswareFee +
      staffingFee +
      additionalBarSetupFee +
      wineBeerFee +
      liquorFee +
      barMinimumFee +
      champagneFee +
      cashBarAdminFee +
      houseAccountFee +
      serviceFee,
  );

  const gratuity = round2(subtotal * RATES.gratuityRate);

  // Staffing fees are tax exempt. Drinks charged against a prepaid house
  // account are likewise exempt.
  const taxExemptTotal = round2(staffingFee + houseAccountFee);
  const taxableBase = round2(Math.max(0, subtotal + gratuity - taxExemptTotal));
  const tax = round2(taxableBase * RATES.taxRate);
  const grandTotal = round2(subtotal + gratuity + tax);

  /* ── Itemised proposal ─────────────────────────────────────────── */
  const lineItems: QuoteLineItem[] = [];
  const push = (item: QuoteLineItem) => lineItems.push(item);

  push(
    values.glasswareRental
      ? {
          id: "glassware",
          label: "Glassware Rental",
          detail: `${guestCount} guests × ${money(RATES.glasswarePerGuest)} · breakage fee included`,
          amount: glasswareFee,
        }
      : {
          id: "glassware",
          label: "Glassware Rental",
          detail:
            "Declined — client committed to supplying glassware or disposables, delivered to bar staff before service start",
          amount: 0,
          informational: true,
        },
  );

  push({
    id: "staffing",
    label: "Staffing Fee",
    detail: `(${eventHours} event hrs + ${RATES.staffingBufferHours}) × ${bartenderCount} bartender${bartenderCount === 1 ? "" : "s"} × ${money(RATES.bartenderHourlyRate)}`,
    amount: staffingFee,
    taxExempt: true,
  });

  if (additionalBarStations > 0) {
    push({
      id: "additional-bars",
      label: "Additional Bar Setup",
      detail: `${additionalBarStations} additional station${additionalBarStations === 1 ? "" : "s"} × ${money(RATES.additionalBarSetupFee)}`,
      amount: additionalBarSetupFee,
    });
  }

  if (isOpenBar) {
    push({
      id: "wine-beer",
      label: `Beer & Wine — ${values.wineBeerTier === "None" ? "Not selected" : values.wineBeerTier}`,
      detail:
        wineBeerRate > 0
          ? `${guestCount} guests × ${openBarHours} Open Bar hrs × ${money(wineBeerRate)}`
          : "No beer & wine tier selected",
      amount: wineBeerFee,
      informational: wineBeerFee === 0,
    });

    push({
      id: "liquor",
      label:
        liquorMode === "Full Shelf"
          ? `Full ${values.liquorTier} Shelf Access`
          : liquorMode === "Signature Cocktails"
            ? `${Math.min(Math.max(Math.round(Number(values.signatureCocktailCount)) || 1, 1), RATES.maxSignatureCocktails)} ${values.liquorTier} Signature Cocktail${(Number(values.signatureCocktailCount) || 1) > 1 ? "s" : ""}`
            : "Liquor & Signature Cocktails",
      detail:
        liquorRate > 0
          ? `${guestCount} guests × ${openBarHours} Open Bar hrs × ${money(liquorRate)}`
          : "No liquor selected",
      amount: liquorFee,
      informational: liquorFee === 0,
    });

    if (barMinimumFee > 0) {
      push({
        id: "bar-minimum",
        label: "Bar Minimum Fee",
        detail: `${money(RATES.barMinimum)} minimum − ${money(beverageSubtotal)} in beverage selections`,
        amount: barMinimumFee,
      });
    }
  } else {
    push({
      id: "liquor",
      label: "Beer, Wine & Liquor",
      detail: `${barType} — beverages are not preselected, so this calculates as ${money(0)}`,
      amount: 0,
      informational: true,
    });
  }

  if (values.champagneToast) {
    push({
      id: "champagne",
      label: `Champagne Toast — ${values.champagneSelection}`,
      detail: `${champagneGuests} guests × ${money(champagneRate)}${
        champagneNonAlcoholicGuests > 0
          ? ` · ${champagneNonAlcoholicGuests} sparkling grape juice`
          : ""
      }`,
      amount: champagneFee,
    });
  }

  if (isCashBar) {
    push({
      id: "cash-bar-admin",
      label: "Cash Bar Administrative Fee",
      detail: `${money(RATES.cashBarAdminFee)} — waived on Open Bar and Consumption Bar`,
      amount: cashBarAdminFee,
    });
  }

  if (isConsumptionBar) {
    push({
      id: "house-account",
      label: "Prepaid House Account",
      detail: `${values.houseAccountScope} · ${money(RATES.houseAccountMinimum)} minimum`,
      amount: houseAccountFee,
      taxExempt: true,
    });
  }

  push({
    id: "service-fee",
    label: "Service Fee",
    detail: "Mandatory on every package",
    amount: serviceFee,
  });

  return {
    eventHours,
    staffedHours,
    openBarHours,
    barStations,
    baseBartenders,
    additionalBartenders,
    bartenderCount,

    glasswareFee,
    additionalBarSetupFee,
    staffingFee,
    wineBeerRate,
    wineBeerFee,
    liquorRate,
    liquorFee,
    beverageSubtotal,
    barMinimumFee,
    champagneFee,
    cashBarAdminFee,
    houseAccountFee,
    serviceFee,

    subtotal,
    gratuity,
    taxExemptTotal,
    taxableBase,
    tax,
    grandTotal,

    lineItems,
    warnings,
  };
}
