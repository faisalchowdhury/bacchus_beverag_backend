import { Document } from "mongoose";
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
  createdAt: Date;
  updatedAt: Date;
}

export type IOTP = {
  email: string;
  otp: string;
  expiresAt: Date;
} & Document;
