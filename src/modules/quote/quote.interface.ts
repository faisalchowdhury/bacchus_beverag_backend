/**
 * Quote wizard contract.
 *
 * These types mirror `src/types/index.ts` in the frontend. They are duplicated
 * rather than shared because the two projects build independently — if you
 * change a field here, change it there too.
 */

export type BarType = "Open Bar" | "Cash Bar" | "Consumption Bar";

/** Beer + unfortified wine tiers. Priced per guest per Open Bar hour. */
export type WineBeerTier = "None" | "Tier 1" | "Tier 2" | "Tier 3";

/** Liquor shelves. Higher shelves inherit access to everything below. */
export type LiquorTier = "Well" | "Call" | "Top Shelf" | "Platinum";

/** How liquor is offered: not at all, a set of signature cocktails, or full shelf. */
export type LiquorMode = "None" | "Signature Cocktails" | "Full Shelf";

export type ChampagneSelection =
  | "J. Roget Brut"
  | "Perelada Cava Nature Stars Reserva"
  | "Devaux Blanc de Noirs Champagne";

export type ToastServiceStyle = "Stationary Display" | "Bar Cart / Table Service";

export type HouseAccountScope =
  | "Wine & Beer Only"
  | "Signature Cocktails"
  | "Liquor Shelf Tiers"
  | "Full Inventory";

export interface SignatureCocktail {
  name: string;
  /** No more than two liquors, drawn from the selected shelf tier. */
  liquors: string[];
}

export interface QuoteFormValues {
  // 1 — Event information
  eventType: string;
  eventDate: string;
  venueLocation: string;
  eventStartTime: string; // "HH:MM"
  eventEndTime: string; // "HH:MM"

  // 2 — Guest count (all guests, including minors)
  guestCount: number;

  // 3 — Glassware
  glasswareRental: boolean;

  // 4 — Bar type
  barType: BarType;

  // 5 — Bar stations beyond the included permanent bar
  additionalBarStations: number;

  // 6 — Beer & unfortified wine
  wineBeerTier: WineBeerTier;
  openBarHours: number;
  specialtyOrderRequest: string;
  specialtyOrderQuantity: number;

  // 7 — Liquor & signature cocktails
  liquorMode: LiquorMode;
  liquorTier: LiquorTier;
  signatureCocktailCount: number;
  signatureCocktails: SignatureCocktail[];

  // 8 — Champagne toast
  champagneToast: boolean;
  champagneSelection: ChampagneSelection;
  champagneGuests: number;
  champagneNonAlcoholicGuests: number;
  toastTime: string;
  toastServiceStyle: ToastServiceStyle;

  // 9 — Account options (Consumption house account / Cash bar tab)
  houseAccountAmount: number;
  houseAccountScope: HouseAccountScope;
  openTab: boolean;
  tabRestrictions: string;

  // 10 — Contact
  customerName: string;
  customerEmail: string;
  customerPhone: string;
}

export interface QuoteLineItem {
  id: string;
  label: string;
  /** How the amount was derived, e.g. "120 guests × $4.00". */
  detail?: string;
  amount: number;
  /** Excluded from the taxable base. */
  taxExempt?: boolean;
  /** A $0 row kept visible to explain why it is $0. */
  informational?: boolean;
}

export interface QuoteBreakdown {
  // Derived event/staffing facts
  eventHours: number;
  staffedHours: number;
  openBarHours: number;
  barStations: number;
  baseBartenders: number;
  additionalBartenders: number;
  bartenderCount: number;

  // Individual charges
  glasswareFee: number;
  additionalBarSetupFee: number;
  staffingFee: number;
  wineBeerRate: number;
  wineBeerFee: number;
  liquorRate: number;
  liquorFee: number;
  /** Beer + wine + liquor only — the figure the bar minimum is tested against. */
  beverageSubtotal: number;
  barMinimumFee: number;
  champagneFee: number;
  cashBarAdminFee: number;
  houseAccountFee: number;
  serviceFee: number;

  // Roll-up
  subtotal: number;
  gratuity: number;
  taxExemptTotal: number;
  taxableBase: number;
  tax: number;
  grandTotal: number;

  lineItems: QuoteLineItem[];
  warnings: string[];
}

/** The request body the wizard POSTs. */
export interface IQuoteSubmissionPayload {
  submittedAt?: string;
  client?: { name?: string; email?: string; phone?: string };
  event?: Record<string, unknown>;
  selections: QuoteFormValues;
  /** The client's own computed breakdown. Recorded, never trusted. */
  quote?: QuoteBreakdown;
}
