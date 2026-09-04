/**
 * Renders the Bacchus Beverages Bartending Service Contract as a PDF.
 *
 * The document is three parts, in the order the signed version has them:
 *
 *   1. Bartending Service Contract  — sections 1–13
 *   2. Exhibit A                    — Chateaux Gardens venue policies
 *   3. Schedule A                   — the bartending services agreement
 *
 * Every word of the terms is fixed boilerplate. Only the values threaded in
 * from `buildContractData` change between clients, which is why they are all
 * set in bold — an owner skimming a printed contract can see at a glance what
 * this particular client agreed to.
 *
 * PDFKit's built-in Times faces are used deliberately: they need no font files
 * on disk, and they match the serif setting of the template this replaces.
 */

import fs from "fs";
import path from "path";
import PDFDocument from "pdfkit";

import { article, type BarSectionFields, type ContractData } from "./quote.contract";

const BODY = "Times-Roman";
const BOLD = "Times-Bold";
const ITALIC = "Times-Italic";

const INK = "#111111";
const MUTED = "#555555";
const RULE = "#cccccc";

const MARGIN = 68;
/** Leaves room for the footer rule and page numbers. */
const BOTTOM_MARGIN = 78;

/** Sub-clause first-line indent, matching the template. */
const CLAUSE_INDENT = 20;

/**
 * Drop a Bacchus roundel at one of these paths and it replaces the typographic
 * lockup below. Checked in order; `logo.png` is deliberately not among them —
 * that file is the backend template's own mark, not this brand's.
 */
const LOGO_CANDIDATES = [
  path.resolve(process.cwd(), "public", "images", "bacchus-logo.png"),
  path.resolve(process.cwd(), "public", "images", "contract-logo.png"),
];

const findLogo = (): string | null =>
  LOGO_CANDIDATES.find((candidate) => fs.existsSync(candidate)) ?? null;

/**
 * PDFKit's standard fonts are WinAnsi-encoded, so a handful of typographic
 * characters that reach us from the rate card would drop out. Fold them onto
 * their nearest encodable equivalent rather than losing them silently.
 */
const sanitize = (value: string): string =>
  String(value ?? "")
    .replace(/−/g, "-")
    .replace(/[‐‑‒–]/g, "-")
    .replace(/[‘’‛]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/…/g, "...")
    .replace(/ /g, " ")
    .replace(/[​-‍﻿]/g, "");

export type ContractDoc = PDFKit.PDFDocument;

/* ══════════════════════════════════════════════════════════════════════
   Layout primitives
   ══════════════════════════════════════════════════════════════════════ */

class ContractWriter {
  readonly doc: ContractDoc;

  constructor(doc: ContractDoc) {
    this.doc = doc;
  }

  get contentWidth(): number {
    return this.doc.page.width - this.doc.page.margins.left - this.doc.page.margins.right;
  }

  /** Usable vertical space left before the footer area. */
  get remaining(): number {
    return this.doc.page.height - this.doc.page.margins.bottom - this.doc.y;
  }

  /** Starts a new page when a block would be split across the fold. */
  ensureSpace(height: number): this {
    if (this.remaining < height) this.doc.addPage();
    return this;
  }

  gap(height = 8): this {
    this.doc.y += height;
    return this;
  }

  /** A numbered top-level heading, e.g. "4. COMPLIANCE, RESPONSIBLE SERVICE". */
  heading(text: string): this {
    this.ensureSpace(56);
    this.gap(10);
    this.doc
      .font(BOLD)
      .fontSize(11.5)
      .fillColor(INK)
      .text(sanitize(text), { align: "left" });
    this.gap(4);
    return this;
  }

  /** A sub-heading inside a section, e.g. "Section 3a: Open Bar Details". */
  subheading(text: string): this {
    this.ensureSpace(48);
    this.gap(8);
    this.doc.font(BOLD).fontSize(11).fillColor(INK).text(sanitize(text));
    this.gap(3);
    return this;
  }

  /** A flowing paragraph of contract text. */
  paragraph(text: string, options: PDFKit.Mixins.TextOptions = {}): this {
    this.doc
      .font(BODY)
      .fontSize(10.5)
      .fillColor(INK)
      .text(sanitize(text), { align: "justify", lineGap: 1.5, ...options });
    this.gap(5);
    return this;
  }

  /** A lettered sub-clause: "(a) General Compliance: ...". */
  clause(label: string, text: string): this {
    this.doc
      .font(BODY)
      .fontSize(10.5)
      .fillColor(INK)
      .text(sanitize(`${label} `), {
        continued: true,
        indent: CLAUSE_INDENT,
        align: "justify",
        lineGap: 1.5,
      })
      .text(sanitize(text), { align: "justify", lineGap: 1.5 });
    this.gap(5);
    return this;
  }

  /**
   * A label with a client-specific value. The value is bold so the variable
   * parts of the contract stand out from the boilerplate.
   */
  field(label: string, value: string, indent = CLAUSE_INDENT): this {
    this.ensureSpace(22);
    this.doc
      .font(BODY)
      .fontSize(10.5)
      .fillColor(INK)
      .text(sanitize(`${label} `), { continued: true, indent, lineGap: 1.5 })
      .font(BOLD)
      .fillColor(INK)
      .text(sanitize(value || "—"), { lineGap: 1.5 })
      .font(BODY);
    this.gap(2);
    return this;
  }

  /** An unnumbered bullet, used by the payment-methods and prepaid lists. */
  bullet(text: string): this {
    this.doc
      .font(BODY)
      .fontSize(10.5)
      .fillColor(INK)
      .text(sanitize(`• ${text}`), {
        indent: CLAUSE_INDENT,
        align: "left",
        lineGap: 1.5,
      });
    this.gap(3);
    return this;
  }

  /** Small print, e.g. the note under the tax base. */
  note(text: string): this {
    this.doc
      .font(ITALIC)
      .fontSize(9)
      .fillColor(MUTED)
      .text(sanitize(text), { align: "left", lineGap: 1 })
      .fillColor(INK);
    this.gap(5);
    return this;
  }

  rule(): this {
    const { doc } = this;
    const y = doc.y + 2;
    doc
      .save()
      .strokeColor(RULE)
      .lineWidth(0.6)
      .moveTo(doc.page.margins.left, y)
      .lineTo(doc.page.width - doc.page.margins.right, y)
      .stroke()
      .restore();
    doc.y = y + 8;
    return this;
  }

  /**
   * The Bacchus mark, centred.
   *
   * Falls back to the typographic lockup the website uses — BACCHUS over
   * BEVERAGES between two rules — because no roundel artwork ships with the
   * repo. Drop a PNG at one of `LOGO_CANDIDATES` and it is used instead.
   */
  logo(width = 118): this {
    const { doc } = this;
    const artwork = findLogo();

    if (artwork) {
      const x = (doc.page.width - width) / 2;
      doc.image(artwork, x, doc.y, { width });
      // `image` does not advance the cursor, and the mark is near enough square.
      doc.y += width * 0.99 + 18;
      return this;
    }

    const scale = width / 118;
    const ruleWidth = 132 * scale;
    const centre = doc.page.width / 2;

    const drawRule = (y: number) => {
      doc
        .save()
        .strokeColor("#999999")
        .lineWidth(0.6)
        .moveTo(centre - ruleWidth / 2, y)
        .lineTo(centre + ruleWidth / 2, y)
        .stroke()
        .restore();
    };

    drawRule(doc.y);
    doc.y += 9 * scale;

    doc
      .font(BOLD)
      .fontSize(23 * scale)
      .fillColor(INK)
      .text("BACCHUS", doc.page.margins.left, doc.y, {
        width: this.contentWidth,
        align: "center",
        characterSpacing: 5 * scale,
      });

    doc.y += 2 * scale;
    doc
      .font(BODY)
      .fontSize(8 * scale)
      .fillColor(MUTED)
      .text("BEVERAGES", doc.page.margins.left, doc.y, {
        width: this.contentWidth,
        align: "center",
        characterSpacing: 5.5 * scale,
      });

    doc.y += 7 * scale;
    drawRule(doc.y);

    doc.x = doc.page.margins.left;
    doc.y += 22 * scale;
    doc.fillColor(INK);
    return this;
  }

  /** A centred document title, as on the contract and exhibit covers. */
  title(text: string, size = 24): this {
    this.doc
      .font(BOLD)
      .fontSize(size)
      .fillColor(INK)
      .text(sanitize(text), { align: "center" });
    this.gap(14);
    return this;
  }

  subtitle(text: string, size = 14): this {
    this.doc
      .font(BOLD)
      .fontSize(size)
      .fillColor(INK)
      .text(sanitize(text), { align: "center" });
    this.gap(10);
    return this;
  }

  /**
   * Two signature columns. Kept on one page — a signature line orphaned at the
   * top of a fresh page is the classic way a contract gets signed twice.
   */
  signatures(leftRole: string, rightRole: string): this {
    this.ensureSpace(112);
    this.gap(26);

    const { doc } = this;
    const columnWidth = (this.contentWidth - 40) / 2;
    const left = doc.page.margins.left;
    const right = left + columnWidth + 40;
    const lineY = doc.y;

    doc.save().strokeColor("#888888").lineWidth(0.8);
    doc.moveTo(left, lineY).lineTo(left + columnWidth, lineY).stroke();
    doc.moveTo(right, lineY).lineTo(right + columnWidth, lineY).stroke();
    doc.restore();

    doc.y = lineY + 5;
    const labelY = doc.y;

    doc
      .font(BODY)
      .fontSize(9)
      .fillColor(MUTED)
      .text(sanitize(leftRole), left, labelY, { width: columnWidth })
      .text(sanitize(rightRole), right, labelY, { width: columnWidth });

    const dateY = Math.max(doc.y, labelY + 12) + 22;

    doc.save().strokeColor("#888888").lineWidth(0.8);
    doc.moveTo(left, dateY).lineTo(left + columnWidth * 0.6, dateY).stroke();
    doc.moveTo(right, dateY).lineTo(right + columnWidth * 0.6, dateY).stroke();
    doc.restore();

    doc
      .font(BODY)
      .fontSize(9)
      .fillColor(MUTED)
      .text("Date", left, dateY + 5, { width: columnWidth })
      .text("Date", right, dateY + 5, { width: columnWidth });

    doc.fillColor(INK);
    doc.x = doc.page.margins.left;
    doc.y = dateY + 24;
    return this;
  }

  /**
   * The itemised fee schedule. Drawn by hand rather than with a table helper so
   * a long detail line wraps under its label instead of pushing the amount
   * column out of alignment.
   */
  feeTable(data: ContractData): this {
    const { doc } = this;
    const amountWidth = 84;
    const labelWidth = this.contentWidth - amountWidth - 12;
    const left = doc.page.margins.left;
    const amountX = left + labelWidth + 12;

    const row = (
      label: string,
      detail: string,
      amount: string,
      style: "item" | "total" | "grand" = "item",
    ) => {
      const labelFont = style === "item" ? BODY : BOLD;
      const size = style === "grand" ? 12 : 10.5;

      // Measure first so the row can be kept whole across a page break.
      doc.font(labelFont).fontSize(size);
      const labelHeight = doc.heightOfString(sanitize(label), { width: labelWidth });
      const detailHeight = detail
        ? (doc.font(ITALIC).fontSize(9),
          doc.heightOfString(sanitize(detail), { width: labelWidth }))
        : 0;
      this.ensureSpace(labelHeight + detailHeight + 16);

      const top = doc.y;

      doc
        .font(labelFont)
        .fontSize(size)
        .fillColor(INK)
        .text(sanitize(label), left, top, { width: labelWidth });

      if (detail) {
        doc
          .font(ITALIC)
          .fontSize(9)
          .fillColor(MUTED)
          .text(sanitize(detail), left, doc.y + 1, { width: labelWidth });
      }

      doc
        .font(style === "item" ? BODY : BOLD)
        .fontSize(size)
        .fillColor(style === "grand" ? INK : INK)
        .text(sanitize(amount), amountX, top, { width: amountWidth, align: "right" });

      doc.x = left;
      doc.y = Math.max(doc.y, top + labelHeight + detailHeight) + 6;

      doc
        .save()
        .strokeColor(RULE)
        .lineWidth(style === "grand" ? 0 : 0.5)
        .moveTo(left, doc.y - 3)
        .lineTo(left + this.contentWidth, doc.y - 3)
        .stroke()
        .restore();
    };

    this.ensureSpace(90);
    this.gap(4);

    doc
      .save()
      .strokeColor("#888888")
      .lineWidth(0.8)
      .moveTo(left, doc.y)
      .lineTo(left + this.contentWidth, doc.y)
      .stroke()
      .restore();
    doc.y += 8;

    data.payment.lineItems.forEach((item) =>
      row(item.label, item.detail, item.amount, "item"),
    );

    row("Subtotal", "", data.payment.subtotal, "total");
    row("Gratuity (12%, mandatory)", "", data.payment.gratuity, "total");
    row(
      `Sales tax (7% on ${data.payment.taxableBase})`,
      `Taxable base = subtotal + gratuity - ${data.payment.taxExemptTotal} exempt (staffing, prepaid house account)`,
      data.payment.tax,
      "total",
    );

    this.gap(2);
    doc
      .save()
      .strokeColor("#888888")
      .lineWidth(0.8)
      .moveTo(left, doc.y)
      .lineTo(left + this.contentWidth, doc.y)
      .stroke()
      .restore();
    doc.y += 8;

    row("TOTAL CONTRACT PRICE", "", data.payment.total, "grand");

    this.gap(6);
    return this;
  }
}

/* ══════════════════════════════════════════════════════════════════════
   Part 1 — Bartending Service Contract
   ══════════════════════════════════════════════════════════════════════ */

const writeContract = (w: ContractWriter, data: ContractData): void => {
  w.gap(6).logo().title("Bartending Service Contract");

  w.paragraph(
    `This Bartending Service Agreement ("Agreement") is made and entered into as of ${data.effectiveDate} ` +
      `("Effective Date"), by and between Bacchus Beverages ("Bartender"), a business duly licensed under ` +
      `applicable North Carolina Alcoholic Beverage Control ("ABC") laws, and the Client identified below ` +
      `("Client"). Bartender and Client are hereinafter collectively referred to as the "Parties."`,
  );

  w.heading("1. CLIENT INFORMATION");
  w.field("(a) Contact Name:", data.client.name);
  w.field("(b) Company Name (if applicable):", data.client.organisation);
  w.field("(c) Mailing Address:", data.client.address);
  w.field("(d) Phone Number:", data.client.phone);
  w.field("(e) Email Address:", data.client.email);

  w.heading("2. EVENT DETAILS");
  w.field("(a) Event Date:", data.event.date);
  w.field("(b) Event Type (e.g., wedding, reception, etc.):", data.event.type);
  w.field("(c) Event Venue:", data.event.venue);

  w.heading("3. BARTENDING SERVICE DETAILS");
  w.clause(
    "(a) Service Hours:",
    "Bartender shall render professional bartending services, including the serving of alcoholic and non-alcoholic beverages, during the hours specified in Schedule A.",
  );
  w.clause(
    "(b) Staffing and Equipment:",
    "Bartender shall provide a minimum of two professionally trained bartenders and all necessary equipment, tools, and bar supplies as detailed in Schedule A.",
  );
  w.clause(
    "(c) Alcohol Coordination:",
    "Bartender will coordinate with the Client regarding beverage selection and special requests in accordance with Schedule A.",
  );

  w.heading("4. COMPLIANCE, RESPONSIBLE SERVICE, AND LIABILITY");
  w.clause(
    "(a) General Compliance:",
    "The Bartender represents and warrants that it holds all necessary on-premise liquor licenses and ABC permits and shall comply with all North Carolina ABC statutes, regulations, and rules. Bartender shall maintain documentation of all required ABC permits and shall present such documentation upon request by any governmental authority.",
  );
  w.clause(
    "(b) Mandatory ID Checks and Refusal of Service:",
    "The Bartender is required by North Carolina law to check the valid government-issued photo identification of any person who appears to be under the age of 30 seeking alcoholic beverages to verify they are at least 21 years of age. Bartender shall refuse service to any person who cannot produce valid identification upon request.",
  );
  w.clause(
    "(c) Service to Intoxicated Persons:",
    "The Bartender is required by North Carolina law (G.S. 18B-305) to refuse service to, and cut off service from, any person who is visibly intoxicated. This legal duty supersedes any open-bar package purchased by the Client. The Client acknowledges and agrees that no refunds shall be issued, prorated or otherwise, for any guest who is refused service due to intoxication or who is evicted from the premises for any reason.",
  );
  w.clause(
    "(d) Liability for Service to Minors by Guests:",
    "The Bartender shall only serve alcoholic beverages directly to persons of legal drinking age. Once an alcoholic beverage is served to a person of legal drinking age, the Bartender's liability for that specific transaction ends. The Client assumes full legal and financial responsibility for any instance where the Client or any guest provides alcohol to a minor. If the Bartender or its staff observes any person providing alcohol to a minor, the Bartender will immediately notify venue security and require that both the person who provided the alcohol and the minor be evicted from the premises.",
  );
  w.clause(
    "(e) Camera Surveillance:",
    "The Client acknowledges that the Bartender maintains cameras in the bar service area to verify every instance of service and to mitigate risk and liability. The Bartender reserves the right to use said camera footage to exonerate itself from any frivolous or false accusations.",
  );

  w.heading("5. VENUE POLICIES AND AMENDMENTS");
  w.clause(
    "(a)",
    `Client acknowledges the Venue policies set forth by Chateau Des Fleures Wedding Venue (the "Venue Policies"), a copy of which is attached hereto as Exhibit A.`,
  );
  w.clause(
    "(b)",
    "Both Parties agree that the Venue Policies may be amended from time to time by the Venue, and the most current version shall govern. In the event of a change to the Venue Policies, the Bartender and Client shall comply with the revised policies as communicated by the Venue prior to the event.",
  );
  w.clause(
    "(c)",
    "In the event that any provision of this Agreement conflicts with subsequent Venue Policy changes, the Venue Policies shall govern solely with respect to the operation of the event at the Venue.",
  );

  w.heading("6. BARTENDER RESPONSIBILITIES");
  w.clause(
    "(a)",
    "The Bartender shall provide professional and responsible bartending services during the event as agreed in Schedule A.",
  );
  w.clause(
    "(b)",
    "The Bartender shall serve all alcoholic beverages in a manner that complies with applicable local, state, and federal laws, as well as the guidelines established by North Carolina ABC regulations.",
  );
  w.clause(
    "(c)",
    "The Bartender shall exercise due care and professional judgment in providing services and shall be solely responsible for the conduct and performance of its bartending staff.",
  );
  w.clause(
    "(d)",
    "In the event of any error, omission, or action by a member of the Bartender's staff, the Bartender shall be solely responsible and shall address and rectify any such issue without imposing liability upon the Client.",
  );

  w.heading("7. CLIENT RESPONSIBILITIES");
  w.clause(
    "(a) Payment:",
    "The Client shall pay all fees as set forth in Schedule A. To secure the contract and the price shown on Schedule A, the Client must pay a non-refundable initial payment of fifty percent (50%) of the total contract price within three (3) days of signing this Agreement. The final remaining balance must be paid in full no later than forty-five (45) days prior to the event date.",
  );
  w.clause(
    "(b) Alcohol Order and Selections:",
    "The Client agrees to provide final alcohol and beverage selections to the Bartender no later than 45 days prior to the event, as detailed in Schedule A.",
  );
  w.clause(
    "(c) Insurance:",
    "The Client shall provide proof of event insurance if required by the Venue.",
  );
  w.clause(
    "(d) Guest Conduct:",
    "The Client acknowledges and agrees that it shall be fully responsible for the conduct, actions, and omissions of all guests, contractors, subcontractors, and any other persons or entities brought to the event by or in connection with the Client, including any damage or negligence caused by such parties during the event.",
  );
  w.clause(
    "(e) Prohibition of Unlawful Inducement:",
    "The Client further agrees to be held responsible for any attempt by any guest, contractor, subcontractor, or any other person or entity acting on behalf of the Client to induce, encourage, or deceive the Bartender or its staff into engaging in any non-legal or unauthorized activity, including but not limited to the service of alcohol to a minor.",
  );
  w.clause(
    "(f) Compliance:",
    "The Client shall ensure compliance with the Venue Policies and shall cooperate with the Bartender to facilitate a safe and orderly event.",
  );

  w.heading("8. CANCELLATION, MODIFICATIONS, AND FORCE MAJEURE");
  w.clause(
    "(a) Cancellation by Client:",
    "The Client may cancel this Agreement by providing written notice to the Bartender at least 45 days prior to the event. Deposits and payments shall be managed in accordance with the cancellation terms detailed in Schedule A.",
  );
  w.clause(
    "(b) Cancellation by Bartender:",
    "Should the Bartender be unable to provide services due to unforeseen circumstances (e.g., illness, emergency), the Bartender shall notify the Client as soon as possible and shall use reasonable efforts to secure a qualified replacement or reschedule the services.",
  );
  w.clause(
    "(c) Force Majeure:",
    "Neither Party shall be liable for any failure to perform its obligations under this Agreement if such failure is due to events beyond its reasonable control, including natural disasters, governmental actions, or other unforeseeable events.",
  );

  w.heading("9. LIMITATION OF LIABILITY");
  w.clause(
    "(a)",
    "The Client shall not be held liable for any errors, omissions, or actions taken by the Bartender or its employees in the performance of bartending services.",
  );
  w.clause(
    "(b)",
    "The Bartender, in providing its services, shall assume full responsibility for any claims, damages, or liabilities arising from the conduct of its staff in connection with the service of alcoholic beverages, subject to the terms and limitations set forth in Section 4 of this Agreement.",
  );

  w.heading("10. BREACH OF CONTRACT CONTINGENCY");
  w.paragraph(
    "In the event that the Client breaches any provision of this Agreement, whether prior to or during the event, the Bartender shall have the right, at its sole discretion, to cancel the event immediately and to retain all monies paid by the Client as liquidated damages. The Client acknowledges that such retention and cancellation remedy is a reasonable estimate of the damages the Bartender would suffer as a direct result of a breach and is not intended as a penalty.",
  );

  w.heading("11. DISPUTE RESOLUTION AND LEGAL FEES");
  w.clause(
    "(a) Good Faith Negotiation:",
    "Any disputes arising under this Agreement shall be resolved first through good faith negotiation and mediation between the Parties.",
  );
  w.clause(
    "(b) Binding Arbitration:",
    `If resolution is not achieved through negotiation or mediation within thirty (30) days, any dispute, claim, or controversy arising out of or related to this Agreement, the Event, or the services provided by Bartender shall be resolved exclusively by binding arbitration administered by the American Arbitration Association ("AAA") under its Commercial Arbitration Rules, or a comparable forum agreed by the Parties. The seat of arbitration shall be Harnett County, North Carolina, and proceedings shall be conducted in English.`,
  );
  w.clause(
    "(c) Attorneys' Fees and Costs:",
    "The Bartender shall be entitled to recover all reasonable attorneys' fees, costs, and expenses (including arbitration fees and expert witness fees) incurred in connection with enforcing any rights under this Agreement, regardless of whether Bartender is deemed the prevailing party, unless the arbitrator expressly finds that Client's position was made in good faith and with substantial justification.",
  );
  w.clause(
    "(d) Frivolous or Bad-Faith Claims:",
    "If Client initiates any arbitration or legal proceeding that the arbitrator or court determines to be frivolous, made in bad faith, or intended primarily to harass or pressure Bartender, Client shall indemnify and reimburse Bartender for all legal costs, attorney's fees, expert fees, filing fees, and other related expenses incurred in defending against such claims.",
  );
  w.clause(
    "(e) Choice of Counsel and Fee Reasonableness:",
    "The Bartender reserves the sole right to select its legal counsel and determine the strategy for enforcement. The Client waives any right to challenge the reasonableness of counsel selection or fees incurred, provided such fees align with prevailing market rates in Harnett County for similar legal services.",
  );
  w.clause(
    "(f) Jury-Trial Waiver and Exclusive Forum:",
    "The Parties waive any right to a trial by jury in any proceeding arising out of or related to this Agreement. Arbitration shall be the exclusive forum for all disputes, except that Bartender may elect to pursue claims for unpaid fees or damages in small claims court or courts of general jurisdiction in Harnett County for amounts within their respective jurisdictional limits.",
  );

  w.heading("12. MISCELLANEOUS");
  w.clause(
    "(a) Entire Agreement:",
    "This Agreement, including its attachments and schedules, constitutes the entire understanding between the Parties and may not be modified except in writing signed by both Parties.",
  );
  w.clause(
    "(b) Governing Law:",
    "This Agreement shall be governed by and construed in accordance with the laws of the State of North Carolina.",
  );
  w.clause(
    "(c) Amendments:",
    "This Agreement may be amended from time to time to incorporate any changes in ABC statutes or Venue Policies. Any such amendments shall be effective upon written notice to both Parties.",
  );

  w.heading("13. ACKNOWLEDGMENT AND SIGNATURE");
  w.paragraph(
    "By executing below, the Parties acknowledge that they have read, understood, and agree to all the terms and conditions set forth in this Agreement and its attachments.",
  );
  w.gap(2);
  w.doc.font(BOLD).fontSize(10.5).fillColor(INK);
  w.doc.text("Exhibit A - Venue Policies attached hereto");
  w.gap(2);
  w.doc.text("Schedule A - Bartending Services Agreement attached hereto");
  w.doc.font(BODY);

  w.signatures("Bacchus Beverages (Bartender)", `Client - ${data.client.name}`);
};

/* ══════════════════════════════════════════════════════════════════════
   Part 2 — Exhibit A, the venue policies
   ══════════════════════════════════════════════════════════════════════ */

const writeExhibitA = (w: ContractWriter, data: ContractData): void => {
  w.doc.addPage();
  w.gap(40).logo(132).title("Exhibit A");

  w.doc.addPage();
  w.doc.font(BOLD).fontSize(12).fillColor(INK).text("CHATEAUX GARDENS, LLC");
  w.gap(2);
  w.doc.text("Venue Policies for Chateau Des Fleures");
  w.gap(8);
  w.field("Effective Date:", data.effectiveDate, 0);
  w.gap(4);

  w.paragraph(
    `These Venue Policies ("Policies") are established by Chateaux Gardens, LLC ("Policy Maker") as the ` +
      `manager and policymaker for Chateau Des Fleures ("Venue") and apply to all renters, event organizers, ` +
      `guests, vendors, and invitees ("Attendees") utilizing the Venue. By using the Venue, Renters and ` +
      `Attendees agree to strictly abide by these Policies. Failure to comply may result in immediate event ` +
      `termination, forfeiture of all fees paid, and any other remedies available to the Owner at law.`,
  );

  w.heading("1. General Conduct and Communication");
  w.clause(
    "(a)",
    "All Attendees shall conduct themselves in a respectful, orderly, and professional manner. Offensive, vulgar, or derogatory language is strictly prohibited in all communications and interactions with the Owner, its personnel, and associated vendors.",
  );
  w.clause("(b)", "The use of chewing gum on the Venue premises is strictly forbidden.");
  w.clause(
    "(c)",
    "Smoking, vaping, or the use of cannabis in any form is not permitted. Violators will be immediately removed from the Venue.",
  );

  w.heading("2. Event Decorations and Fixtures");
  w.clause(
    "(a)",
    "Only non-flammable, battery-powered candles are permitted. Open flame candles are expressly prohibited.",
  );
  w.clause(
    "(b)",
    "Renters shall not affix decorations, equipment, cables, wires, or any personal property to the Venue structures using tape, wire, nails, screws, or any items that may cause damage. Zip ties may be used only if they do not cause any damage. Any damage caused by installations or decorations shall be the sole responsibility of the Renter.",
  );
  w.clause(
    "(c)",
    "Farewell decorations are limited to approved items. Bubbles are permitted for outdoor use during farewells; however, materials such as rice, confetti, candles, birdseed, flower petals, balloons, glitter, and pyrotechnic devices are not allowed on or off the premises unless expressly approved in writing by the Owner.",
  );
  w.clause(
    "(d)",
    "For safety reasons, no decorations may be attached to or alter the chandeliers. Decorating chandeliers is strictly prohibited to prevent any risk of damage or injury.",
  );

  w.heading("3. Noise and Music Regulations");
  w.clause(
    "(a)",
    "Music and amplified sound must cease at least one hour prior to the end of the rental period. All music shall comply with county sound ordinances and must not include profanity or vulgarity.",
  );
  w.clause(
    "(b)",
    "Quiet hours are established from 9:00 p.m. to 11:00 a.m. Only interior music or non-amplified sound is permitted during these hours.",
  );

  w.heading("4. Alcohol Service and Related Conduct");
  w.clause(
    "(a)",
    "All alcoholic beverage services must be conducted exclusively by Owner-approved licensed bartenders in accordance with the policies set forth in the Bacchus Beverages Agreement. No self-service or unauthorized alcohol service is permitted.",
  );
  w.clause(
    "(b)",
    "Under no circumstances shall personal alcoholic beverages be brought onto or consumed within the Venue.",
  );
  w.clause(
    "(c)",
    "Renters and their Attendees are strictly prohibited from engaging in any attempt to induce or deceive bartenders or staff into serving alcohol unlawfully, including but not limited to the service of alcohol to minors.",
  );
  w.clause(
    "(d)",
    "Any violation of the alcohol service policy will result in immediate termination of the event and forfeiture of all fees paid.",
  );

  w.heading("5. Attendee and Vendor Liability for Conduct");
  w.clause(
    "(a)",
    "The Renter is fully responsible for the conduct, actions, and omissions of all Attendees, vendors, contractors, subcontractors, and their respective invitees associated with the event.",
  );
  w.clause(
    "(b)",
    "The Renter shall be liable for any damage, negligence, or breach of these Policies by any party associated with the event.",
  );
  w.clause(
    "(c)",
    "Any attempt by any party to circumvent or undermine these Policies shall result in immediate termination of the event, and the Owner shall retain all fees paid as liquidated damages.",
  );

  w.heading("6. Safety, Security, and Emergency Procedures");
  w.clause(
    "(a)",
    "The Renter agrees to comply with all security measures and protocols implemented by the Owner. This includes, but is not limited to, cooperation with security personnel, submission to security screenings (such as bag checks or metal detector scans), and adherence to any instructions provided by Owner-designated emergency personnel.",
  );
  w.clause(
    "(b)",
    "The Venue employs surveillance systems for safety and security purposes. The Owner reserves the right to review surveillance recordings to verify compliance with these Policies.",
  );
  w.clause(
    "(c)",
    "The Renter shall be solely responsible for arranging any additional security measures necessary for the protection of their guests, personal property, or event personnel. All additional protocols must be approved in writing by the Owner at least two weeks prior to the event.",
  );
  w.clause(
    "(d)",
    "In the event of an emergency, the Renter must immediately follow all directions provided by the Owner's emergency personnel. Non-compliance may result in immediate event termination without any refund.",
  );

  w.heading("7. Damages, Property Loss, and Venue Access Restrictions");
  w.clause(
    "(a)",
    "The Renter is solely responsible for the protection and security of all personal property, equipment, and any items brought onto the Venue.",
  );
  w.clause(
    "(b)",
    "All property must be removed by the end of the rental term. Items left behind will be secured in the Venue's Lost and Found, and appropriate incident reports will be filed.",
  );
  w.clause(
    "(c)",
    "The Venue is not liable for any lost, stolen, or damaged property. Any damage to the Venue resulting from the Renter's actions will be subject to repair costs at the sole responsibility of the Renter.",
  );
  w.clause("(d)", "No overnight storage is permitted on the premises.");
  w.clause(
    "(e)",
    "Access to the Venue is strictly limited to the hours specified in the rental contract. No access will be granted outside of these hours. Should the Renter require additional time at the Venue, such extra time will incur additional costs as determined by the Owner.",
  );

  w.heading("8. Modification of Policies");
  w.clause(
    "(a)",
    "Chateaux Gardens, LLC reserves the right to modify, amend, or update these Policies at any time.",
  );
  w.clause(
    "(b)",
    "The most current version of these Policies will apply, regardless of the version initially agreed to by the Renter or event organizer.",
  );
  w.clause(
    "(c)",
    "It is the responsibility of the Renter to remain informed of the current Policies; continued use of the Venue constitutes acceptance of the most current version.",
  );

  w.heading("9. Enforcement and Termination");
  w.clause(
    "(a)",
    "The Owner, in its sole discretion, reserves the right to immediately terminate any event for violation of any of these Policies.",
  );
  w.clause(
    "(b)",
    "In the event of termination due to a breach, the Owner shall retain all fees paid by the Renter as liquidated damages, and the Renter shall have no claim against the Owner for any refund or additional compensation.",
  );
  w.clause(
    "(c)",
    "Such termination is without prejudice to any other legal remedies the Owner may pursue for breach of these Policies.",
  );

  w.gap(6);
  w.paragraph(
    "By utilizing the Venue, the Renter acknowledges receipt of these Policies and agrees to strictly abide by them. The Renter understands that non-compliance may result in immediate event termination, forfeiture of all fees paid, and potential legal action to recover any additional damages.",
  );

  w.ensureSpace(150);
  w.gap(6);
  w.doc.font(BODY).fontSize(10.5).fillColor(INK).text("Chateaux Gardens, LLC");
  w.doc.text("Management of Chateau Des Fleures");

  w.signatures("Chateaux Gardens, LLC", `Renter - ${data.client.name}`);
};

/* ══════════════════════════════════════════════════════════════════════
   Part 3 — Schedule A, the bartending services agreement
   ══════════════════════════════════════════════════════════════════════ */

/** The eleven lettered rows shared by the Open, Cash and Consumption sections. */
const writeBarSectionBody = (
  w: ContractWriter,
  fields: BarSectionFields,
  labels: { liquor: string; wineBeer: string },
): void => {
  w.field("(c) Staffing - minimum bartenders:", fields.bartenders);
  w.note("Additional staff may be required based on guest count.");
  w.field(
    "(d) Equipment Provided:",
    "All bartending tools; rented glassware (no disposables provided).",
  );
  w.field(`(e) ${labels.liquor}`, fields.liquor);
  w.field(`(f) ${labels.wineBeer}`, fields.wineBeer);
  w.field("(g) Champagne Toast (if applicable):", fields.champagne);
  w.field("(h) Glass Rental (if applicable):", fields.glassware);
  w.field("(i) Specialty Order (if applicable):", fields.specialty);
  w.field("(j) Additional Bars (if applicable):", fields.additionalBars);
  w.field("(k) Special Requests:", fields.specialRequests);
};

const writeScheduleA = (w: ContractWriter, data: ContractData): void => {
  w.doc.addPage();
  w.gap(20).logo(104).title("Schedule A", 26).subtitle("Bartending Services Agreement");

  w.field("Effective Date:", data.effectiveDate, 0);
  w.gap(6);

  w.paragraph(
    "This Schedule A replaces any previously executed Schedule A for the Bartending Service Agreement and " +
      "defines the specifics of the bartending service. This Schedule A is incorporated by reference into and " +
      "forms an integral part of the Bartending Service Agreement, collectively constituting a single, " +
      "integrated agreement between the Parties. All terms herein are fully consistent with the Bartending " +
      "Service Contract, including the provisions that the Bartender is solely responsible for the conduct " +
      "and performance of its staff.",
  );

  w.heading("1. Client Information");
  w.field("(a) Contact Name:", data.client.name);
  w.field("(b) Company Name (if applicable):", data.client.organisation);
  w.field("(c) Mailing Address:", data.client.address);
  w.field("(d) Phone Number:", data.client.phone);
  w.field("(e) Email Address:", data.client.email);

  w.heading("2. Event Description");
  w.field("(a) Event Name/Description:", data.event.description);
  w.field("(b) Number of Guests:", data.event.guestCount);
  w.field("(c) Event Venue:", data.event.venue);
  w.field("(d) Special Requests/Considerations:", data.event.specialRequests);

  w.heading('3. Bar Service Type (Selection Required. Marked With "X")');
  w.paragraph(
    "The Client must select one bar service type below. Only ONE may be selected as the primary service type:",
  );
  w.field(
    `[ ${data.barTypeMark["Open Bar"] || " "} ]`,
    "Open Bar (Section 3a applies; Section 4 applies for mandatory cash bar hours)",
  );
  w.field(
    `[ ${data.barTypeMark["Consumption Bar"] || " "} ]`,
    "Consumption Bar (Prepaid House Account) (Section 5 applies; Section 4 applies for mandatory cash bar hours)",
  );
  w.field(
    `[ ${data.barTypeMark["Cash Bar"] || " "} ]`,
    "Cash Bar (Section 4 applies)",
  );

  w.subheading("Venue Requirement (Applies to All Events)");
  w.paragraph(
    "We require a Cash Bar to be available for the entirety of every event. In accordance with updated " +
      "Chateaux Gardens, LLC procedures, this policy is designed to prevent guests from bringing personal " +
      "alcohol onto the premises, an action that could jeopardize both the Client's security deposit with the " +
      "venue and our liquor license.",
  );

  if (!data.window.known) {
    // Quoting "from — to —" would read as an error. Say plainly that the
    // schedule is still open, and restate the rule that will set it.
    w.paragraph(
      "Event start and end times have not yet been confirmed. Once they are, the Bar will open one hour " +
        "after the event start and remain open until one hour before the event end, and the service hours " +
        `below will be completed accordingly. The Client has selected ${article(data.barType)} ` +
        `${data.barType}.`,
    );
  } else {
    w.paragraph(
      `Because your event begins at ${data.window.eventStart} and ends at ${data.window.eventEnd}, the Bar ` +
        `would open at ${data.window.barOpens} (one hour after the event start) and remain open until ` +
        `${data.window.barCloses} (one hour before the event end).`,
    );
  }

  if (!data.window.known) {
    // Nothing more to say about the split until the times exist.
  } else if (data.window.hasCashBarRemainder) {
    w.paragraph(
      `You have selected ${article(data.barType)} ${data.barType} from ${data.window.primaryOpens} to ` +
        `${data.window.primaryCloses}. Therefore, the Cash Bar will operate during the required hours outside ` +
        `of the ${data.barType} window, specifically:`,
    );
    w.field(
      "   ",
      `${data.window.cashBarOpens} - ${data.window.cashBarCloses} (Cash Bar)`,
      0,
    );
  } else if (data.barType === "Cash Bar") {
    w.paragraph(
      `You have selected a Cash Bar, which will operate for the entirety of the required window, ` +
        `specifically ${data.window.barOpens} - ${data.window.barCloses}.`,
    );
  } else {
    w.paragraph(
      `You have selected ${article(data.barType)} ${data.barType} from ${data.window.primaryOpens} to ` +
        `${data.window.primaryCloses}, which spans the entire required bar window. No additional Cash Bar ` +
        `hours are required.`,
    );
  }

  w.paragraph(
    "The staffing fee associated with this required bar schedule has been added to your Invoice total.",
  );

  /* ── Section 3a — Open Bar ───────────────────────────────────────── */
  w.subheading("Section 3a: Open Bar Details");
  if (!data.openBar.applicable) {
    w.note(`Not applicable - the Client selected ${article(data.barType)} ${data.barType}.`);
  }
  w.field("(a) Open Bar Service Hours - Opens:", data.openBar.opens);
  w.field("      Last Call:", data.openBar.lastCall);
  w.field("      Closes:", data.openBar.closes);
  w.note(
    "If the Open Bar does not extend through the venue's required final hour of event time, service will convert to a Cash Bar for the remaining duration (see Section 4).",
  );
  w.field("(b) Mandatory Cash Bar Coverage (Venue Rule) - Cash Bar Opens:", data.cashBar.opens);
  w.field("      Cash Bar Closes:", data.cashBar.closes);
  w.note(
    "These fields are automatically required regardless of Open Bar selection. Cash Bar Opens must be at least 1 hour after event start; Cash Bar Closes must be at least 1 hour before event end.",
  );
  writeBarSectionBody(w, data.openBar, {
    liquor: "Liquor(s) Included:",
    wineBeer: "Wine & Beer Included:",
  });

  /* ── Section 4 — Cash Bar ────────────────────────────────────────── */
  w.heading("4. Cash Bar Details");
  if (!data.cashBar.applicable) {
    w.note("Not applicable - no Cash Bar hours are required for this event.");
  }
  w.clause(
    "(a) Cash Bar Service Hours:",
    "A Cash Bar will operate during the periods required by the venue policy and any additional time requested by the Client.",
  );
  w.field("      Opens:", data.cashBar.opens);
  w.field("      Last Call:", data.cashBar.lastCall);
  w.field("      Closes:", data.cashBar.closes);

  w.gap(2);
  w.doc.font(BODY).fontSize(10.5).fillColor(INK).text("(b) Payment Methods Accepted:", {
    indent: CLAUSE_INDENT,
  });
  w.gap(3);
  w.bullet("All major credit and debit cards (tap, chip, swipe)");
  w.bullet("Apple Pay / Google Pay / NFC mobile wallets");
  w.bullet("EBT cards");
  w.bullet("QR code payments");
  w.bullet(
    "Approved custom house-account arrangements for businesses. Each drink is closed out individually unless a guest explicitly opens a tab. Tabs remain open until the guest instructs the Bartender to close it or service ends. A guest may place a card on file to cover multiple individuals' drinks at their own discretion.",
  );

  writeBarSectionBody(w, data.cashBar, {
    liquor: "Available Liquor(s) For Purchase:",
    wineBeer: "Available Wine & Beer For Purchase:",
  });

  /* ── Section 5 — Consumption Bar ─────────────────────────────────── */
  w.heading("5. Consumption Bar (Prepaid House Account)");
  if (!data.consumptionBar.applicable) {
    w.note(`Not applicable - the Client selected ${article(data.barType)} ${data.barType}.`);
  }
  w.paragraph(
    'A Consumption Bar is a prepaid bar service where the Client deposits a set dollar amount ("Prepaid House Account"), which is drawn down based on actual drink consumption.',
  );
  w.field("(a) Prepaid House Account Amount (paid prior to the event):", data.houseAccount.amount);
  w.field("      Account scope:", data.houseAccount.scope);
  w.field("(b) Service Hours - Consumption Bar Opens:", data.consumptionBar.opens);
  w.field("      Consumption Bar Closes:", data.consumptionBar.closes);
  w.note(
    "Transition Rule: If the Consumption Bar ends before the final hour of event time, the Bartender will convert to a Cash Bar (see Section 4) to remain compliant with venue policy.",
  );

  w.gap(2);
  w.doc
    .font(BODY)
    .fontSize(10.5)
    .fillColor(INK)
    .text("(c) Important Terms Regarding Prepaid Amount:", { indent: CLAUSE_INDENT });
  w.gap(3);
  w.bullet("All drink charges will be deducted from the Prepaid House Account until depleted.");
  w.bullet("Unused prepaid funds are non-refundable and non-transferable.");
  w.bullet(
    "The Client is encouraged to fully utilize the prepaid amount; any remaining balance expires at the end of the event.",
  );
  w.bullet(
    "Once the prepaid balance reaches zero, service will automatically convert to a Cash Bar unless the Client immediately adds additional prepaid funds.",
  );
  w.bullet(
    "The Prepaid House Account functions as a gift card-style balance used for all beverages. Guests may order freely until funds run out.",
  );
  w.bullet(
    "The Client may restrict what can be purchased with the prepaid balance (e.g., no shots, specific tiers, signature cocktails, etc.).",
  );
  w.bullet("A live running total can be provided upon request.");
  w.bullet(
    "Guests may pay individually using all Cash Bar payment methods (see Section 4) unless the Client adds additional prepaid funds to continue the Consumption Bar.",
  );

  writeBarSectionBody(w, data.consumptionBar, {
    liquor: "Liquor(s) Permitted To Be Used:",
    wineBeer: "Wine & Beer Permitted To Be Used:",
  });

  /* ── Section 6 — Payment terms ───────────────────────────────────── */
  w.heading("6. Payment Terms");
  w.field(
    "(a) Non-Refundable Deposit (50% of the total fee):",
    data.payment.deposit,
  );
  w.field("(b) Total Payment for the alcohol and bar services provided above:", data.payment.total);
  w.field("      Remaining balance, due 45 days prior to the event:", data.payment.balance);
  w.clause(
    "(c) Payment Schedule:",
    "The Client shall pay the Rental Payment in accordance with the payment schedule outlined on the Invoice.",
  );
  w.clause("(d) Gratuity:", "A gratuity has been included in the total cost of these services.");

  w.subheading("(e) Itemised Fee Schedule");
  w.feeTable(data);

  if (data.warnings.length) {
    w.subheading("(f) Notes on This Estimate");
    data.warnings.forEach((warning) => w.bullet(warning));
  }

  /* ── Sections 7–10 ───────────────────────────────────────────────── */
  w.heading("7. Cancellation and Modifications");
  w.clause(
    "(a) Cancellation by Client:",
    "In the event of cancellation, the Client must notify the Bartender in writing at least 45 days prior to the event date.",
  );
  w.clause(
    "(b) Cancellation by Bartender:",
    "If the Bartender is unable to provide services due to unforeseen circumstances (e.g., illness, emergency), the Bartender will notify the Client promptly and will work with the Client to secure a qualified replacement or reschedule the event if possible.",
  );
  w.clause(
    "(c) Force Majeure:",
    "Neither Party will be held liable for any failure to perform its obligations under this Agreement if such failure is due to events beyond their reasonable control, including but not limited to natural disasters and governmental restrictions.",
  );

  w.heading("8. Client Responsibilities");
  w.clause(
    "(a) Alcohol Order and Final Selections:",
    "The Client agrees to submit the alcohol order and final beverage selections to the Bartender no later than 45 days prior to the event.",
  );
  w.clause(
    "(b) Liability and Insurance:",
    "The Client agrees to indemnify and hold the Bartender harmless for any claims or damages arising from the service of alcohol and must provide proof of event insurance as required by the Venue.",
  );
  w.clause(
    "(c) Compliance with Laws:",
    "The Client is responsible for ensuring that all alcohol service complies with state and local laws, including prohibitions on serving underage or intoxicated guests.",
  );
  w.clause(
    "(d) Guest Responsibility and Liability:",
    "The Client is responsible for all guests and any issues arising from their actions during the event, including but not limited to injuries, arrests, or other damages. The Client shall also be fully responsible for any contractors or subcontractors brought by vendors for the event, as well as for any breach of these responsibilities.",
  );
  w.clause(
    "(e) Deception of Staff:",
    "The Client shall be held responsible if any guest, contractor, subcontractor, or any affiliated party attempts to induce or deceive the Bartender or its staff into engaging in non-legal or unauthorized activities, including the service of alcohol to minors.",
  );

  w.heading("9. Venue Damage and Clean-Up");
  w.clause(
    "(a) Bartender Responsibilities:",
    "The Bartender will maintain a clean bar area throughout the event and perform a thorough clean-up upon conclusion of the event.",
  );

  w.heading("10. Additional Integrated Provisions");
  w.clause(
    "(a)",
    "The Client hereby acknowledges that they have read, understand, and agree to be bound by the Bacchus Beverages Bartending Service Agreement - including the language specifying that the Bartender is solely responsible for its bartending staff - and the Chateaux Gardens, LLC Venue Policies.",
  );
  w.clause(
    "(b)",
    "By executing this Schedule A, the Client confirms that these documents (including all amendments made prior to the event) are fully incorporated by reference and shall form one integrated agreement governing the event.",
  );

  w.gap(6);
  w.doc.font(BOLD).fontSize(10.5).fillColor(INK);
  w.doc.text(
    sanitize(
      "WHEREFORE, the Parties hereto have executed this Schedule A as of the Effective Date, thereby acknowledging that the terms and specifics outlined herein accurately represent the services to be provided and the responsibilities of the Parties.",
    ),
    { align: "justify", lineGap: 1.5 },
  );
  w.doc.font(BODY);

  w.signatures("Bacchus Beverages (Bartender)", `Client - ${data.client.name}`);
};

/* ══════════════════════════════════════════════════════════════════════
   Footer
   ══════════════════════════════════════════════════════════════════════ */

const stampFooters = (doc: ContractDoc, data: ContractData): void => {
  const range = doc.bufferedPageRange();

  for (let i = range.start; i < range.start + range.count; i += 1) {
    doc.switchToPage(i);

    // Writing below the bottom margin would otherwise spawn another page.
    const savedBottom = doc.page.margins.bottom;
    doc.page.margins.bottom = 0;

    const left = doc.page.margins.left;
    const width = doc.page.width - doc.page.margins.left - doc.page.margins.right;
    const y = doc.page.height - 52;

    doc
      .save()
      .strokeColor(RULE)
      .lineWidth(0.5)
      .moveTo(left, y - 8)
      .lineTo(left + width, y - 8)
      .stroke()
      .restore();

    doc
      .font(BODY)
      .fontSize(8)
      .fillColor(MUTED)
      .text(
        sanitize(`Bacchus Beverages - Bartending Service Contract (${data.barType})`),
        left,
        y,
        { width, align: "left", lineBreak: false },
      )
      .text(`Page ${i + 1} of ${range.count}`, left, y, {
        width,
        align: "right",
        lineBreak: false,
      })
      .text(sanitize(`Ref ${data.quoteId} - ${data.client.name}`), left, y + 10, {
        width,
        align: "left",
        lineBreak: false,
      });

    doc.page.margins.bottom = savedBottom;
  }
};

/* ══════════════════════════════════════════════════════════════════════
   Public entry point
   ══════════════════════════════════════════════════════════════════════ */

/**
 * Builds the contract and returns it as a single Buffer.
 *
 * Buffered rather than streamed straight to the response: the footer needs the
 * final page count, and an error thrown mid-render must not leave the client
 * with a half-written PDF and a 200 status.
 */
export const renderContractPdf = (data: ContractData): Promise<Buffer> =>
  new Promise((resolve, reject) => {
    const doc = new PDFDocument({
      size: "LETTER",
      bufferPages: true,
      autoFirstPage: true,
      margins: {
        top: MARGIN,
        left: MARGIN,
        right: MARGIN,
        bottom: BOTTOM_MARGIN,
      },
      info: {
        Title: `Bartending Service Contract - ${data.client.name}`,
        Author: "Bacchus Beverages",
        Subject: `${data.barType} - ${data.event.date}`,
        Keywords: "bartending, contract, Bacchus Beverages",
      },
    });

    const chunks: Buffer[] = [];
    doc.on("data", (chunk: Buffer) => chunks.push(chunk));
    doc.on("error", reject);
    doc.on("end", () => resolve(Buffer.concat(chunks)));

    try {
      const w = new ContractWriter(doc);

      writeContract(w, data);
      writeExhibitA(w, data);
      writeScheduleA(w, data);

      stampFooters(doc, data);

      doc.end();
    } catch (error) {
      reject(error);
    }
  });
