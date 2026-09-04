import mongoose, { Document } from "mongoose";
import { TRole } from "../../config/role";

export interface IUser extends Document {
  name: string;
  email: string;
  phone?: string;
  address?: string;
  password: string | null;
  role: TRole;
  /** "default" = email + password. Social/native sign-ins skip verification. */
  type: "default" | "apple" | "google";
  fcmToken?: string;
  profilePicture?: string;
  isVerified: boolean;
  isDeleted: boolean;
  isBlocked: boolean;

  /**
   * Staff notification preferences. Only meaningful for `role: "staff"` —
   * admins are always notified, and clients never are.
   */
  notifyOnNewQuote: boolean;
  notifyOnQuoteAccepted: boolean;
  /** Free-text job title shown in the dashboard, e.g. "Lead Bartender". */
  jobTitle?: string;
  /** Which admin created this staff account. */
  createdBy?: mongoose.Types.ObjectId;

  createdAt: Date;
  updatedAt: Date;
}

export type IOTP = {
  email: string;
  otp: string;
  expiresAt: Date;
} & Document;
