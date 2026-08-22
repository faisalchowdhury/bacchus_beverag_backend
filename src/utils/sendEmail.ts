import nodemailer, { Transporter } from "nodemailer";

import ApiError from "../errors/ApiError";
import { MAIL } from "../config";
import { getEmailLogoAttachments } from "./emailTemplate";

/**
 * Shared mail transport. Lives here rather than inside a feature module so
 * anything that sends mail (auth OTPs, quote estimates) uses the same
 * credentials and the same failure handling.
 *
 * Which provider is used is decided in config — Gmail when its app password is
 * present, otherwise the generic SMTP_* block.
 *
 * The transport is created once and reused: nodemailer pools the connection,
 * and rebuilding it per message means a fresh TLS handshake every time.
 */
let transporter: Transporter | null = null;

const getMailTransporter = (): Transporter => {
  if (!MAIL.user || !MAIL.password) {
    throw new ApiError(500, "Email service is not configured.");
  }

  if (!transporter) {
    transporter = nodemailer.createTransport({
      host: MAIL.host,
      port: MAIL.port,
      secure: MAIL.port === 465,
      auth: { user: MAIL.user, pass: MAIL.password },
    });
  }

  return transporter;
};

/** True when mail credentials are present, so callers can degrade gracefully. */
export const isMailConfigured = (): boolean =>
  Boolean(MAIL.user && MAIL.password);

/**
 * Opens a connection and authenticates without sending anything. Useful at
 * startup to surface a bad app password immediately rather than on the first
 * client who submits a quote.
 */
export const verifyMailConnection = async (): Promise<boolean> => {
  if (!isMailConfigured()) return false;
  try {
    await getMailTransporter().verify();
    return true;
  } catch (error) {
    console.error("Mail transport verification failed:", error);
    return false;
  }
};

export const sendEmail = async (options: {
  to: string | string[];
  subject: string;
  html: string;
  replyTo?: string;
}): Promise<void> => {
  const mailer = getMailTransporter();

  try {
    await mailer.sendMail({
      from: MAIL.from,
      to: options.to,
      subject: options.subject,
      html: options.html,
      ...(options.replyTo && { replyTo: options.replyTo }),
      attachments: getEmailLogoAttachments(),
    });
  } catch (error: any) {
    // A rejected recipient shouldn't fail the API call that triggered the mail.
    if (error && (error.code === "EENVELOPE" || error.responseCode === 550)) {
      console.warn(`Email skipped (recipient rejected): ${options.to}`);
      return;
    }
    console.error("Email sending failed:", error);
    throw new ApiError(500, "Unexpected error occurred during email sending.");
  }
};

export default sendEmail;
