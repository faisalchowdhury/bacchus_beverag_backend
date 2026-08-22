import fs from "fs";
import path from "path";
import { APP_NAME, BRAND_URL, EMAIL_LOGO_URL } from "../config";

export const EMAIL_LOGO_CID = "appLogo@app";
const LOGO_FILE_PATH = path.resolve(
  process.cwd(),
  process.env.EMAIL_LOGO_PATH || "public/images/logo.png",
);

const usesExternalLogo = (): boolean => EMAIL_LOGO_URL.startsWith("https://");

/** CID attachment — most reliable way to show logos in Gmail/Outlook. */
export const getEmailLogoAttachments = () => {
  if (usesExternalLogo()) return [];

  if (!fs.existsSync(LOGO_FILE_PATH)) {
    console.warn(`Email logo not found at: ${LOGO_FILE_PATH}`);
    return [];
  }

  return [
    {
      filename: "logo.png",
      path: LOGO_FILE_PATH,
      cid: EMAIL_LOGO_CID,
    },
  ];
};

const getEmailLogoSrc = (): string => {
  if (usesExternalLogo()) return EMAIL_LOGO_URL;
  return `cid:${EMAIL_LOGO_CID}`;
};

type EmailTemplateOptions = {
  preheader?: string;
  greeting?: string;
  body: string;
  footerNote?: string;
};

/*
 * Bacchus palette, mirroring src/index.css on the website so an email and the
 * site read as the same brand. Inline hex only — Gmail and Outlook strip
 * custom properties and most <style> rules.
 */
const GOLD = "#c5a66b";
const GOLD_DEEP = "#9e753b";
const CHAMPAGNE = "#e8dcc0";
const INK = "#0a0a0b";
const GOLD_GRADIENT = `linear-gradient(135deg, ${CHAMPAGNE} 0%, ${GOLD} 50%, ${GOLD_DEEP} 100%)`;

const otpBlock = (otp: string, label = "Your verification code") => `
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin: 28px 0;">
    <tr>
      <td align="center">
        <p style="margin: 0 0 10px; font-size: 13px; font-weight: 600; letter-spacing: 0.08em; text-transform: uppercase; color: #9a8a71;">
          ${label}
        </p>
        <div style="display: inline-block; padding: 18px 28px; background: ${INK}; border: 1px solid ${GOLD}; border-radius: 14px; box-shadow: 0 10px 24px rgba(10, 10, 11, 0.18);">
          <span style="font-family: 'Courier New', Courier, monospace; font-size: 34px; font-weight: 700; letter-spacing: 0.35em; color: ${CHAMPAGNE};">
            ${otp}
          </span>
        </div>
        <p style="margin: 14px 0 0; font-size: 13px; color: #dc2626; font-weight: 600;">
          This code expires shortly — use it right away.
        </p>
      </td>
    </tr>
  </table>
`;

const ctaButton = (label: string, href: string) => `
  <table role="presentation" cellspacing="0" cellpadding="0" style="margin: 28px auto;">
    <tr>
      <td align="center" style="border-radius: 999px; background: ${GOLD};">
        <a href="${href}" target="_blank" style="display: inline-block; padding: 14px 32px; font-size: 12px; font-weight: 700; color: ${INK}; text-decoration: none; letter-spacing: 0.12em; text-transform: uppercase;">
          ${label}
        </a>
      </td>
    </tr>
  </table>
`;

/** Big highlighted number — balances, counts, amounts. */
const statBadge = (value: string | number, label = "") => `
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin: 24px 0;">
    <tr>
      <td align="center">
        <div style="display: inline-block; padding: 22px 36px; background: ${INK}; border-radius: 16px; box-shadow: 0 12px 28px rgba(10, 10, 11, 0.22);">
          ${label ? `<p style="margin: 0 0 6px; font-size: 12px; font-weight: 600; letter-spacing: 0.12em; text-transform: uppercase; color: rgba(232, 220, 192, 0.75);">${label}</p>` : ""}
          <p style="margin: 0; font-family: Georgia, 'Times New Roman', serif; font-size: 44px; font-weight: 700; color: ${GOLD}; line-height: 1;">${value}</p>
        </div>
      </td>
    </tr>
  </table>
`;

/** Callout box for a quoted note or reason. */
const noteBox = (note: string, label = "Note") => `
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin: 20px 0;">
    <tr>
      <td style="padding: 18px 22px; background: #fbf9f4; border-left: 3px solid ${GOLD}; border-radius: 0 12px 12px 0;">
        <p style="margin: 0 0 6px; font-size: 11px; font-weight: 700; letter-spacing: 0.1em; text-transform: uppercase; color: ${GOLD_DEEP};">${label}</p>
        <p style="margin: 0; font-size: 15px; line-height: 1.65; color: #3f3a33;">${note}</p>
      </td>
    </tr>
  </table>
`;

const statusBadge = (status: "approved" | "rejected") => {
  const isApproved = status === "approved";
  const background = isApproved
    ? "linear-gradient(135deg, #059669 0%, #10b981 100%)"
    : "linear-gradient(135deg, #dc2626 0%, #ef4444 100%)";
  const label = isApproved ? "Request Approved" : "Request Rejected";
  const shadow = isApproved
    ? "rgba(5, 150, 105, 0.25)"
    : "rgba(220, 38, 38, 0.25)";

  return `
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin: 24px 0;">
    <tr>
      <td align="center">
        <div style="display: inline-block; padding: 16px 28px; background: ${background}; border-radius: 14px; box-shadow: 0 10px 24px ${shadow};">
          <p style="margin: 0; font-size: 18px; font-weight: 800; letter-spacing: 0.04em; text-transform: uppercase; color: #ffffff;">
            ${label}
          </p>
        </div>
      </td>
    </tr>
  </table>
`;
};

const infoCard = (rows: { label: string; value: string }[]) => `
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin: 24px 0; background: #fbf9f4; border: 1px solid #ede4d3; border-radius: 12px; overflow: hidden;">
    ${rows
      .map(
        (row, index) => `
      <tr>
        <td style="padding: 13px 20px; font-size: 11px; font-weight: 700; letter-spacing: 0.08em; text-transform: uppercase; color: #9a8a71; width: 40%; vertical-align: top;${index < rows.length - 1 ? " border-bottom: 1px solid #ede4d3;" : ""}">
          ${row.label}
        </td>
        <td style="padding: 13px 20px; font-size: 15px; color: #2e2a24; font-weight: 500; word-break: break-word;${index < rows.length - 1 ? " border-bottom: 1px solid #ede4d3;" : ""}">
          ${row.value}
        </td>
      </tr>`,
      )
      .join("")}
  </table>
`;

export const buildEmailTemplate = ({
  preheader = "",
  greeting = "Hello",
  body,
  footerNote = "If you did not request this email, you can safely ignore it.",
}: EmailTemplateOptions): string => `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${APP_NAME}</title>
</head>
<body style="margin: 0; padding: 0; background-color: #f3eee3; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;">
  <div style="display: none; max-height: 0; overflow: hidden; opacity: 0;">${preheader}</div>
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background-color: #f3eee3; padding: 32px 16px;">
    <tr>
      <td align="center">
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width: 600px; background-color: #ffffff; border-radius: 18px; overflow: hidden; box-shadow: 0 16px 40px rgba(46, 42, 36, 0.12);">
          <!-- Dark masthead: the site's signature black + gold. -->
          <tr>
            <td style="padding: 34px 32px 30px; background: ${INK}; text-align: center;">
              <img src="${getEmailLogoSrc()}" alt="${APP_NAME}" width="120" style="display: block; margin: 0 auto 14px; max-width: 120px; height: auto; border: 0;" />
              <p style="margin: 0; font-family: Georgia, 'Times New Roman', serif; font-size: 21px; font-weight: 700; letter-spacing: 0.22em; color: #faf8f5; text-transform: uppercase;">
                Bacchus
              </p>
              <p style="margin: 4px 0 0; font-size: 9px; font-weight: 600; letter-spacing: 0.4em; color: ${GOLD}; text-transform: uppercase;">
                Beverages
              </p>
            </td>
          </tr>
          <!-- Gold hairline under the masthead. -->
          <tr>
            <td style="height: 3px; background: ${GOLD_GRADIENT}; font-size: 0; line-height: 0;">&nbsp;</td>
          </tr>
          <tr>
            <td style="padding: 36px 32px 28px;">
              <h2 style="margin: 0 0 16px; font-family: Georgia, 'Times New Roman', serif; font-size: 24px; line-height: 1.3; color: #2e2a24; font-weight: 700;">
                ${greeting}
              </h2>
              ${body}
            </td>
          </tr>
          <tr>
            <td style="padding: 24px 32px 32px; background-color: #fbf9f4; border-top: 1px solid #ede4d3;">
              <p style="margin: 0 0 10px; font-size: 14px; line-height: 1.6; color: #6b6154; text-align: center;">
                ${footerNote}
              </p>
              <p style="margin: 0; font-size: 12px; line-height: 1.6; color: #9a8a71; text-align: center;">
                © ${new Date().getFullYear()} ${APP_NAME} ·
                <a href="${BRAND_URL}" style="color: ${GOLD_DEEP}; text-decoration: none; font-weight: 600;">${BRAND_URL.replace(/^https?:\/\//, "")}</a>
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
`;

export const emailHelpers = {
  otpBlock,
  ctaButton,
  statBadge,
  noteBox,
  statusBadge,
  infoCard,
  paragraph: (text: string) =>
    `<p style="margin: 0 0 16px; font-size: 16px; line-height: 1.7; color: #4a443b;">${text}</p>`,
  highlight: (text: string) =>
    `<strong style="color: #9e753b;">${text}</strong>`,
};
