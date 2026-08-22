import mongoose, { Schema } from "mongoose";
import { IOTP, IUser } from "./user.interface";
import { ERole } from "../../config/role";

const userSchema = new Schema<IUser>(
  {
    name: { type: String, required: true },
    email: { type: String, required: true, index: true, lowercase: true, trim: true },
    phone: { type: String },
    address: { type: String },

    password: { type: String, default: null, select: false },
    role: { type: String, enum: ERole, default: "user" },
    type: {
      type: String,
      enum: ["default", "apple", "google"],
      default: "default",
    },

    fcmToken: { type: String },
    profilePicture: { type: String },

    isVerified: { type: Boolean, default: false },
    isDeleted: { type: Boolean, default: false },
    isBlocked: { type: Boolean, default: false },
  },
  { timestamps: true },
);

// One account per email per role — lets the same person hold two roles if the
// project needs it. Drop `role` from the index for a strictly unique email.
userSchema.index({ email: 1, role: 1 }, { unique: true });

export const UserModel = mongoose.model<IUser>("User", userSchema);

const otpSchema = new Schema<IOTP>({
  email: { type: String, required: true, trim: true, index: true },
  otp: { type: String, required: true, trim: true },
  // TTL index: mongo removes the document shortly after expiresAt.
  expiresAt: { type: Date, required: true, index: { expires: "1m" } },
});

export const OTPModel = mongoose.model<IOTP>("OTP", otpSchema);
