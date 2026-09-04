import { APP_NAME, DASHBOARD_URL } from "../../config";
import { buildEmailTemplate, emailHelpers } from "../../utils/emailTemplate";

const { paragraph, infoCard, noteBox, ctaButton } = emailHelpers;

const escapeHtml = (value: unknown): string =>
  String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");

/**
 * Sent to a new staff member with their sign-in details, and again when an
 * admin resets their password.
 */
export const buildStaffWelcomeEmail = ({
  name,
  email,
  password,
  generated,
  reset = false,
}: {
  name: string;
  email: string;
  password: string;
  /** Whether we made the password up, or the admin set it. */
  generated: boolean;
  reset?: boolean;
}): { subject: string; html: string } => {
  const firstName = (name || "").trim().split(/\s+/)[0] || "there";

  const body = `
    ${paragraph(
      reset
        ? `Your ${APP_NAME} dashboard password has been reset by an administrator. Your new sign-in details are below.`
        : `You have been added to the ${APP_NAME} team. You can now sign in to the dashboard to see quote requests, client details and contracts as they come in.`,
    )}
    ${infoCard([
      { label: "Dashboard", value: `<a href="${escapeHtml(DASHBOARD_URL)}" style="color: #9e753b; text-decoration: none;">${escapeHtml(DASHBOARD_URL)}</a>` },
      { label: "Email", value: escapeHtml(email) },
      {
        label: reset ? "New password" : "Temporary password",
        value: `<code style="font-family: 'Courier New', Courier, monospace; font-size: 15px; font-weight: 700; letter-spacing: 0.04em; color: #2e2a24;">${escapeHtml(password)}</code>`,
      },
    ])}
    ${ctaButton("Open the dashboard", DASHBOARD_URL)}
    ${
      generated
        ? noteBox(
            "Please change this password after your first sign-in, from Account &rarr; Change password. This email is the only copy of it.",
            "Before you do anything else",
          )
        : ""
    }
    ${paragraph(
      "You will also be emailed whenever a client submits a new quote and whenever a client accepts one, so nothing waits on somebody checking the dashboard.",
    )}
  `;

  return {
    subject: reset
      ? `Your ${APP_NAME} password has been reset`
      : `You have been added to the ${APP_NAME} team`,
    html: buildEmailTemplate({
      preheader: reset
        ? "Your new dashboard password is inside."
        : `Your ${APP_NAME} dashboard sign-in details are inside.`,
      greeting: reset ? `Hi ${escapeHtml(firstName)}` : `Welcome, ${escapeHtml(firstName)}`,
      body,
      footerNote:
        "If you were not expecting this email, please tell the venue straight away.",
    }),
  };
};
