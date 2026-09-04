/**
 * Staff accounts — the venue's own team.
 *
 * Staff exist for two reasons: they are the people copied on quote
 * notifications, and they can sign in to the dashboard to read the pipeline.
 * Only an admin can create them; there is deliberately no self-registration
 * path onto this role.
 */

import crypto from "crypto";
import httpStatus from "http-status";
import { isValidObjectId } from "mongoose";

import ApiError from "../../errors/ApiError";
import { UserModel } from "../user/user.model";
import { hashPassword } from "../user/user.utils";
import { isMailConfigured, sendEmail } from "../../utils/sendEmail";
import { buildStaffWelcomeEmail } from "./staff.email";

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const str = (value: unknown, fallback = ""): string =>
  typeof value === "string" ? value.trim() : fallback;

const bool = (value: unknown, fallback: boolean): boolean => {
  if (value === undefined || value === null || value === "") return fallback;
  return value === true || value === "true";
};

/** Fields the dashboard reads. Never includes the password hash. */
const STAFF_FIELDS =
  "name email phone jobTitle role isVerified isBlocked isDeleted " +
  "notifyOnNewQuote notifyOnQuoteAccepted profilePicture createdBy createdAt updatedAt";

/**
 * A first password for a new staff account.
 *
 * Generated rather than chosen by the admin so one person's idea of a
 * password never becomes the whole team's. It is emailed to the staff member
 * and never shown to the admin who created the account.
 */
const generateTemporaryPassword = (): string => {
  // Ambiguous glyphs (O/0, l/1) are excluded — this gets retyped by hand.
  const alphabet = "ABCDEFGHJKMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789";
  const symbols = "!@#$%&*";
  const pick = (source: string) => source[crypto.randomInt(source.length)];

  const core = Array.from({ length: 12 }, () => pick(alphabet)).join("");
  // Guarantee the mix a password policy would ask for.
  return `${pick("ABCDEFGHJKMNPQRSTUVWXYZ")}${core}${pick("23456789")}${pick(symbols)}`;
};

export interface CreateStaffInput {
  name?: unknown;
  email?: unknown;
  phone?: unknown;
  jobTitle?: unknown;
  notifyOnNewQuote?: unknown;
  notifyOnQuoteAccepted?: unknown;
  /** Optional — one is generated when omitted. */
  password?: unknown;
}

/**
 * Creates a staff account and emails them their sign-in details.
 *
 * The account is created verified: an admin adding a colleague has already
 * vouched for the address, and making them run an OTP dance before they can
 * receive quote notifications would only delay the thing they were added for.
 */
const createStaff = async (input: CreateStaffInput, createdBy?: string) => {
  const name = str(input.name);
  const email = str(input.email).toLowerCase();

  if (!name) throw new ApiError(httpStatus.BAD_REQUEST, "Staff name is required.");
  if (!EMAIL_PATTERN.test(email)) {
    throw new ApiError(httpStatus.BAD_REQUEST, "A valid email address is required.");
  }

  const existing = await UserModel.findOne({ email, role: "staff" });
  if (existing && !existing.isDeleted) {
    throw new ApiError(
      httpStatus.CONFLICT,
      "A staff member with this email already exists.",
    );
  }

  const providedPassword = str(input.password);
  if (providedPassword && providedPassword.length < 8) {
    throw new ApiError(
      httpStatus.BAD_REQUEST,
      "Password must be at least 8 characters.",
    );
  }
  const password = providedPassword || generateTemporaryPassword();

  const doc = {
    name,
    email,
    phone: str(input.phone) || undefined,
    jobTitle: str(input.jobTitle) || undefined,
    password: await hashPassword(password),
    role: "staff" as const,
    type: "default" as const,
    isVerified: true,
    isBlocked: false,
    isDeleted: false,
    notifyOnNewQuote: bool(input.notifyOnNewQuote, true),
    notifyOnQuoteAccepted: bool(input.notifyOnQuoteAccepted, true),
    ...(createdBy && isValidObjectId(createdBy) ? { createdBy } : {}),
  };

  // Re-activate a previously removed colleague rather than colliding with the
  // unique (email, role) index.
  const staff = existing
    ? await UserModel.findByIdAndUpdate(existing._id, { $set: doc }, { new: true })
    : await UserModel.create(doc);

  if (!staff) {
    throw new ApiError(httpStatus.INTERNAL_SERVER_ERROR, "Could not create the account.");
  }

  // The account is already saved; a mail failure must not undo it. Report the
  // outcome so the admin knows whether to pass the password on by hand.
  let welcomeEmailSent = false;
  if (isMailConfigured()) {
    const mail = buildStaffWelcomeEmail({
      name,
      email,
      password,
      generated: !providedPassword,
    });
    welcomeEmailSent = await sendEmail({ to: email, subject: mail.subject, html: mail.html })
      .then(() => true)
      .catch((error) => {
        console.error("[staff] Welcome email failed:", error);
        return false;
      });
  } else {
    console.error("[staff] SMTP is not configured — no welcome email was sent.");
  }

  const created = await UserModel.findById(staff._id).select(STAFF_FIELDS).lean();

  return {
    staff: created,
    welcomeEmailSent,
    /** Returned only when we could not email it, so it is not lost. */
    temporaryPassword: welcomeEmailSent || providedPassword ? undefined : password,
  };
};

export interface StaffListFilters {
  search?: string;
  includeInactive?: boolean;
}

/** Every staff member, newest first. Small team — no pagination needed. */
const getStaffList = async ({ search, includeInactive }: StaffListFilters = {}) => {
  const query: Record<string, unknown> = { role: "staff" };
  if (!includeInactive) query.isDeleted = { $ne: true };

  if (search?.trim()) {
    const safe = search.trim().replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const rx = { $regex: safe, $options: "i" };
    query.$or = [{ name: rx }, { email: rx }, { jobTitle: rx }];
  }

  return UserModel.find(query).select(STAFF_FIELDS).sort({ createdAt: -1 }).lean();
};

const getStaffById = async (id: string) => {
  if (!isValidObjectId(id)) {
    throw new ApiError(httpStatus.BAD_REQUEST, "That is not a valid staff id.");
  }
  const staff = await UserModel.findOne({ _id: id, role: "staff" })
    .select(STAFF_FIELDS)
    .lean();
  if (!staff) throw new ApiError(httpStatus.NOT_FOUND, "Staff member not found.");
  return staff;
};

export interface UpdateStaffInput {
  name?: unknown;
  phone?: unknown;
  jobTitle?: unknown;
  notifyOnNewQuote?: unknown;
  notifyOnQuoteAccepted?: unknown;
  isBlocked?: unknown;
}

/**
 * Edits a staff member's details and notification preferences.
 *
 * Email is deliberately not editable: it is half the unique index and the
 * address notifications have been going to. Changing who a login belongs to
 * is a new account, not an edit.
 */
const updateStaff = async (id: string, updates: UpdateStaffInput) => {
  if (!isValidObjectId(id)) {
    throw new ApiError(httpStatus.BAD_REQUEST, "That is not a valid staff id.");
  }

  const patch: Record<string, unknown> = {};

  if (updates.name !== undefined) {
    const name = str(updates.name);
    if (!name) throw new ApiError(httpStatus.BAD_REQUEST, "Name cannot be empty.");
    patch.name = name;
  }
  if (updates.phone !== undefined) patch.phone = str(updates.phone);
  if (updates.jobTitle !== undefined) patch.jobTitle = str(updates.jobTitle);
  if (updates.notifyOnNewQuote !== undefined) {
    patch.notifyOnNewQuote = bool(updates.notifyOnNewQuote, true);
  }
  if (updates.notifyOnQuoteAccepted !== undefined) {
    patch.notifyOnQuoteAccepted = bool(updates.notifyOnQuoteAccepted, true);
  }
  if (updates.isBlocked !== undefined) patch.isBlocked = bool(updates.isBlocked, false);

  if (!Object.keys(patch).length) {
    throw new ApiError(httpStatus.BAD_REQUEST, "Nothing to update.");
  }

  const staff = await UserModel.findOneAndUpdate(
    { _id: id, role: "staff" },
    { $set: patch },
    { new: true, runValidators: true },
  )
    .select(STAFF_FIELDS)
    .lean();

  if (!staff) throw new ApiError(httpStatus.NOT_FOUND, "Staff member not found.");
  return staff;
};

/**
 * Removes a staff member.
 *
 * Soft delete: quote records reference who was notified, and a hard delete
 * would leave those dangling. A soft-deleted account cannot sign in and is
 * skipped by the notification lookup.
 */
const removeStaff = async (id: string) => {
  if (!isValidObjectId(id)) {
    throw new ApiError(httpStatus.BAD_REQUEST, "That is not a valid staff id.");
  }

  const staff = await UserModel.findOneAndUpdate(
    { _id: id, role: "staff" },
    {
      $set: {
        isDeleted: true,
        isBlocked: true,
        notifyOnNewQuote: false,
        notifyOnQuoteAccepted: false,
      },
    },
    { new: true },
  )
    .select(STAFF_FIELDS)
    .lean();

  if (!staff) throw new ApiError(httpStatus.NOT_FOUND, "Staff member not found.");
  return staff;
};

/** Issues a fresh password and emails it. Used when someone is locked out. */
const resetStaffPassword = async (id: string) => {
  if (!isValidObjectId(id)) {
    throw new ApiError(httpStatus.BAD_REQUEST, "That is not a valid staff id.");
  }

  const staff = await UserModel.findOne({ _id: id, role: "staff" });
  if (!staff || staff.isDeleted) {
    throw new ApiError(httpStatus.NOT_FOUND, "Staff member not found.");
  }

  const password = generateTemporaryPassword();
  staff.password = await hashPassword(password);
  await staff.save();

  let emailSent = false;
  if (isMailConfigured()) {
    const mail = buildStaffWelcomeEmail({
      name: staff.name,
      email: staff.email,
      password,
      generated: true,
      reset: true,
    });
    emailSent = await sendEmail({
      to: staff.email,
      subject: mail.subject,
      html: mail.html,
    })
      .then(() => true)
      .catch((error) => {
        console.error("[staff] Password reset email failed:", error);
        return false;
      });
  }

  return { emailSent, temporaryPassword: emailSent ? undefined : password };
};

/* ══════════════════════════════════════════════════════════════════════
   Notification recipients
   ══════════════════════════════════════════════════════════════════════ */

export interface NotificationRecipient {
  name: string;
  email: string;
  role: string;
}

/**
 * Who should be copied on a quote notification.
 *
 * Admins are always included — they own the pipeline. Staff are included when
 * they have the matching preference switched on. Blocked and soft-deleted
 * accounts are skipped, and the list is de-duplicated by address so someone
 * holding two roles is not mailed twice.
 */
const getNotificationRecipients = async (
  event: "newQuote" | "quoteAccepted",
): Promise<NotificationRecipient[]> => {
  const preference =
    event === "newQuote" ? "notifyOnNewQuote" : "notifyOnQuoteAccepted";

  const accounts = await UserModel.find({
    isDeleted: { $ne: true },
    isBlocked: { $ne: true },
    $or: [{ role: "admin" }, { role: "staff", [preference]: true }],
  })
    .select("name email role")
    .lean();

  const seen = new Set<string>();
  const recipients: NotificationRecipient[] = [];

  for (const account of accounts) {
    const email = String(account.email ?? "").trim().toLowerCase();
    if (!email || seen.has(email)) continue;
    seen.add(email);
    recipients.push({
      name: String(account.name ?? ""),
      email,
      role: String(account.role ?? ""),
    });
  }

  return recipients;
};

export const StaffService = {
  createStaff,
  getStaffList,
  getStaffById,
  updateStaff,
  removeStaff,
  resetStaffPassword,
  getNotificationRecipients,
};
