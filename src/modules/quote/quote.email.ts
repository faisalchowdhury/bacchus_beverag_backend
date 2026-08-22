import { APP_NAME, VENUE_NAME } from "../../config";
import { buildEmailTemplate, emailHelpers } from "../../utils/emailTemplate";
import { money, RATES } from "./quote.pricing";
import type { QuoteBreakdown, QuoteFormValues } from "./quote.interface";

const { paragraph, infoCard, noteBox } = emailHelpers;

const escapeHtml = (value: unknown): string =>
  String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");

/** "18:00" → "6:00 PM". Left as-is if it is not a recognisable time. */
const formatTime = (value: string): string => {
  const match = /^(\d{1,2}):(\d{2})$/.exec(String(value ?? "").trim());
  if (!match) return escapeHtml(value);
  const hours = Number(match[1]);
  const minutes = match[2];
  const suffix = hours >= 12 ? "PM" : "AM";
  const display = hours % 12 === 0 ? 12 : hours % 12;
  return `${display}:${minutes} ${suffix}`;
};

/** "2026-09-12" → "12 September 2026". Left as-is if unparseable. */
const formatDate = (value: string): string => {
  const raw = String(value ?? "").trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) return escapeHtml(raw || "—");
  const date = new Date(`${raw}T00:00:00Z`);
  if (Number.isNaN(date.getTime())) return escapeHtml(raw);
  return date.toLocaleDateString("en-US", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
};

/**
 * The itemised proposal, rendered as an email-safe table.
 *
 * Informational $0 rows are kept — they are the ones that explain *why* a
 * charge is absent, which is exactly what a client queries later.
 */
const lineItemTable = (breakdown: QuoteBreakdown): string => {
  const rows = breakdown.lineItems
    .map((item) => {
      const muted = item.informational ? "color: #a89b86;" : "color: #2e2a24;";
      const detail = item.detail
        ? `<div style="margin-top: 4px; font-size: 12px; line-height: 1.5; color: #a89b86;">${escapeHtml(item.detail)}${
            item.taxExempt
              ? ` <span style="color: #b58d4c; font-weight: 600;">· tax exempt</span>`
              : ""
          }</div>`
        : "";

      return `
      <tr>
        <td style="padding: 13px 18px; border-bottom: 1px solid #ede4d3; font-size: 14px; ${muted}">
          <strong style="font-weight: 600;">${escapeHtml(item.label)}</strong>
          ${detail}
        </td>
        <td style="padding: 13px 18px; border-bottom: 1px solid #ede4d3; font-size: 14px; text-align: right; white-space: nowrap; font-variant-numeric: tabular-nums; ${muted}">
          ${money(item.amount)}
        </td>
      </tr>`;
    })
    .join("");

  const summaryRow = (
    label: string,
    value: string,
    opts: { strong?: boolean; muted?: boolean } = {},
  ) => `
      <tr>
        <td style="padding: ${opts.strong ? "14px" : "9px"} 18px; font-size: ${opts.strong ? "15px" : "13px"}; color: ${opts.muted ? "#9a8a71" : "#2e2a24"}; font-weight: ${opts.strong ? "700" : "500"};">
          ${label}
        </td>
        <td style="padding: ${opts.strong ? "14px" : "9px"} 18px; font-size: ${opts.strong ? "15px" : "13px"}; text-align: right; white-space: nowrap; font-variant-numeric: tabular-nums; color: ${opts.muted ? "#9a8a71" : "#2e2a24"}; font-weight: ${opts.strong ? "700" : "500"};">
          ${value}
        </td>
      </tr>`;

  return `
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin: 24px 0; background: #ffffff; border: 1px solid #ede4d3; border-radius: 12px; overflow: hidden;">
    <tr>
      <td colspan="2" style="padding: 14px 18px; background: #fbf9f4; border-bottom: 1px solid #ede4d3; font-size: 12px; font-weight: 700; letter-spacing: 0.08em; text-transform: uppercase; color: #9a8a71;">
        Itemised Proposal
      </td>
    </tr>
    ${rows}
    ${summaryRow("Subtotal", money(breakdown.subtotal), { strong: true })}
    ${summaryRow(`Gratuity (${RATES.gratuityRate * 100}%)`, money(breakdown.gratuity), { muted: true })}
    ${summaryRow(
      `Tax (${RATES.taxRate * 100}% of ${money(breakdown.taxableBase)})`,
      money(breakdown.tax),
      { muted: true },
    )}
    <tr>
      <td colspan="2" style="padding: 0 18px 12px; font-size: 11px; line-height: 1.5; color: #a89b86;">
        Tax base = subtotal + gratuity − ${money(breakdown.taxExemptTotal)} in exempt charges
        (staffing, and any prepaid house account).
      </td>
    </tr>
    <tr>
      <td style="padding: 18px; background: #2e2a24; font-size: 13px; font-weight: 700; letter-spacing: 0.06em; text-transform: uppercase; color: #e8dcc0;">
        Estimated Grand Total
      </td>
      <td style="padding: 18px; background: #2e2a24; font-size: 22px; font-weight: 800; text-align: right; white-space: nowrap; color: #c5a66b;">
        ${money(breakdown.grandTotal)}
      </td>
    </tr>
  </table>`;
};

const warningsBlock = (warnings: string[]): string => {
  if (!warnings.length) return "";
  return `
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin: 20px 0;">
    <tr>
      <td style="padding: 16px 20px; background: #fffbeb; border-left: 4px solid #f59e0b; border-radius: 0 12px 12px 0;">
        <p style="margin: 0 0 8px; font-size: 12px; font-weight: 700; letter-spacing: 0.06em; text-transform: uppercase; color: #92400e;">
          Worth knowing
        </p>
        ${warnings
          .map(
            (warning) =>
              `<p style="margin: 0 0 8px; font-size: 14px; line-height: 1.6; color: #78350f;">${escapeHtml(warning)}</p>`,
          )
          .join("")}
      </td>
    </tr>
  </table>`;
};

const eventFacts = (values: QuoteFormValues, breakdown: QuoteBreakdown) =>
  infoCard([
    { label: "Event type", value: escapeHtml(values.eventType || "—") },
    { label: "Date", value: formatDate(values.eventDate) },
    { label: "Venue", value: escapeHtml(values.venueLocation || "—") },
    {
      label: "Service window",
      value: `${formatTime(values.eventStartTime)} – ${formatTime(values.eventEndTime)} (${breakdown.eventHours} hrs)`,
    },
    { label: "Guests", value: `${values.guestCount}` },
    { label: "Bar type", value: escapeHtml(values.barType) },
    {
      label: "Bartenders",
      value: `${breakdown.bartenderCount} across ${breakdown.barStations} bar${breakdown.barStations === 1 ? "" : "s"}`,
    },
    ...(values.barType === "Open Bar"
      ? [{ label: "Open Bar hours", value: `${breakdown.openBarHours} hrs` }]
      : []),
  ]);

const signatureCocktailList = (values: QuoteFormValues): string => {
  if (values.barType !== "Open Bar" || values.liquorMode !== "Signature Cocktails") {
    return "";
  }
  const count = Math.min(
    Math.max(Math.round(Number(values.signatureCocktailCount)) || 1, 1),
    RATES.maxSignatureCocktails,
  );
  const items = (values.signatureCocktails ?? [])
    .slice(0, count)
    .map((cocktail, index) => {
      const name = cocktail?.name?.trim() || `Cocktail #${index + 1} — unnamed`;
      const liquors = cocktail?.liquors?.length
        ? cocktail.liquors.join(" + ")
        : "No liquors chosen yet";
      return `<li style="margin-bottom: 6px; font-size: 14px; line-height: 1.6; color: #4a443b;"><strong>${escapeHtml(name)}</strong> — <span style="color: #9a8a71;">${escapeHtml(liquors)}</span></li>`;
    })
    .join("");

  return `
    <p style="margin: 24px 0 8px; font-size: 13px; font-weight: 700; letter-spacing: 0.06em; text-transform: uppercase; color: #9a8a71;">
      Signature cocktails
    </p>
    <ul style="margin: 0 0 16px; padding-left: 20px;">${items}</ul>`;
};

/* ══════════════════════════════════════════════════════════════════════
   The two emails
   ══════════════════════════════════════════════════════════════════════ */

/** Sent to the client: their estimate, itemised exactly as the wizard showed it. */
export const buildClientQuoteEmail = (
  values: QuoteFormValues,
  breakdown: QuoteBreakdown,
): { subject: string; html: string } => {
  const firstName = (values.customerName || "").trim().split(/\s+/)[0] || "there";

  const body = `
    ${paragraph(
      `Thank you for designing your bar program with ${APP_NAME}. Your itemised estimate is below — every figure is calculated from our published rate card, with nothing estimated or hidden.`,
    )}
    ${eventFacts(values, breakdown)}
    ${signatureCocktailList(values)}
    ${lineItemTable(breakdown)}
    ${warningsBlock(breakdown.warnings)}
    ${noteBox(
      `${escapeHtml(VENUE_NAME)} will set your event up and email you a link to your own secure HoneyBook portal. Everything after this point — questions, contracts, payments and your final beverage program — happens there.`,
      "What happens next",
    )}
    ${paragraph(
      `This is an estimate, not an invoice. Once an invoice is raised your guest count is locked and cannot be reduced, and it is verified on the day of the event.`,
    )}
  `;

  return {
    subject: `Your ${APP_NAME} estimate — ${money(breakdown.grandTotal)}`,
    html: buildEmailTemplate({
      preheader: `Your estimated grand total is ${money(breakdown.grandTotal)}.`,
      greeting: `Hi ${escapeHtml(firstName)}, here is your estimate`,
      body,
      footerNote:
        "Prices are held for 14 days. Reply to this email if anything needs adjusting.",
    }),
  };
};

/** Sent to the venue: the full submission plus the client's contact details. */
export const buildOwnerQuoteEmail = (
  values: QuoteFormValues,
  breakdown: QuoteBreakdown,
  submittedAt: Date,
): { subject: string; html: string } => {
  const specialty = (values.specialtyOrderRequest ?? "").trim();

  const body = `
    ${paragraph(
      `A new quote was submitted through the website. The client has been emailed a copy of the estimate below.`,
    )}
    ${infoCard([
      { label: "Name", value: escapeHtml(values.customerName) },
      {
        label: "Email",
        value: `<a href="mailto:${escapeHtml(values.customerEmail)}" style="color: #9e753b; text-decoration: none;">${escapeHtml(values.customerEmail)}</a>`,
      },
      { label: "Phone", value: escapeHtml(values.customerPhone || "—") },
      { label: "Submitted", value: submittedAt.toUTCString() },
    ])}
    ${eventFacts(values, breakdown)}
    ${signatureCocktailList(values)}
    ${
      values.barType === "Consumption Bar"
        ? infoCard([
            { label: "House account", value: money(breakdown.houseAccountFee) },
            { label: "Scope", value: escapeHtml(values.houseAccountScope) },
          ])
        : ""
    }
    ${
      values.barType === "Cash Bar" && values.openTab
        ? noteBox(
            escapeHtml(values.tabRestrictions || "No restrictions specified."),
            "Host tab requested",
          )
        : ""
    }
    ${
      values.champagneToast
        ? infoCard([
            { label: "Champagne", value: escapeHtml(values.champagneSelection) },
            { label: "Guests toasting", value: `${values.champagneGuests}` },
            {
              label: "Sparkling grape juice",
              value: `${values.champagneNonAlcoholicGuests}`,
            },
            { label: "Toast time", value: formatTime(values.toastTime) },
            { label: "Service style", value: escapeHtml(values.toastServiceStyle) },
          ])
        : ""
    }
    ${
      specialty
        ? noteBox(
            `${escapeHtml(specialty)}${values.specialtyOrderQuantity ? ` — qty ${values.specialtyOrderQuantity}` : ""}`,
            "Specialty beer / wine request",
          )
        : ""
    }
    ${lineItemTable(breakdown)}
    ${warningsBlock(breakdown.warnings)}
  `;

  return {
    subject: `New quote — ${values.customerName || "Unknown"} · ${values.guestCount} guests · ${money(breakdown.grandTotal)}`,
    html: buildEmailTemplate({
      preheader: `${values.eventType || "Event"} on ${values.eventDate || "an unspecified date"} — ${money(breakdown.grandTotal)}`,
      greeting: "New quote request",
      body,
      footerNote: "Sent automatically by the quote designer.",
    }),
  };
};
