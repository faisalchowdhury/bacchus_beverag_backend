import crypto from "crypto";
import argon2 from "argon2";

import { OTPModel, UserModel } from "./user.model";
import { IUser } from "./user.interface";
import ApiError from "../../errors/ApiError";
import { APP_NAME, BRAND_URL } from "../../config";
import { buildEmailTemplate, emailHelpers } from "../../utils/emailTemplate";
import { sendEmail } from "../../utils/sendEmail";

/** Minutes an OTP stays valid. */
export const OTP_TTL_MINUTES = 5;

// Re-exported so existing auth call sites keep importing it from here.
export { sendEmail };

// ---------------------------------------------------------------------------
// Transactional emails
// ---------------------------------------------------------------------------

export const sendRegisterOTPEmail = async (
  name: string,
  email: string,
  otp: string,
): Promise<void> => {
  await sendEmail({
    to: email,
    subject: "Registration OTP",
    html: buildEmailTemplate({
      preheader: `Your ${APP_NAME} registration code is ${otp}`,
      greeting: `Hello ${name}!`,
      body: `
        ${emailHelpers.paragraph("Thanks for signing up. Use the code below to finish setting up your account.")}
        ${emailHelpers.otpBlock(otp, "Registration code")}
        ${emailHelpers.paragraph("If you did not create an account, no further action is required.")}
      `,
    }),
  });
};

export const sendLoginOTPEmail = async (
  name: string,
  email: string,
  otp: string,
): Promise<void> => {
  await sendEmail({
    to: email,
    subject: "Login OTP",
    html: buildEmailTemplate({
      preheader: `Your login code is ${otp}`,
      greeting: `Hello ${name}!`,
      body: `
        ${emailHelpers.paragraph("Use the code below to continue signing in to your account.")}
        ${emailHelpers.otpBlock(otp, "Login code")}
        ${emailHelpers.paragraph("If you did not try to sign in, you can safely ignore this email.")}
      `,
    }),
  });
};

export const sendVerificationOTPEmail = async (
  name: string,
  email: string,
  otp: string,
): Promise<void> => {
  await sendEmail({
    to: email,
    subject: "Verify Your Account",
    html: buildEmailTemplate({
      preheader: `Verify your ${APP_NAME} account with code ${otp}`,
      greeting: `Hello ${name}!`,
      body: `
        ${emailHelpers.paragraph("Your account is not verified yet. Use the code below to complete verification.")}
        ${emailHelpers.otpBlock(otp, "Verification code")}
        ${emailHelpers.paragraph("If you did not request this, please ignore this email.")}
      `,
    }),
  });
};

export const sendResetPasswordOTPEmail = async (
  name: string,
  email: string,
  otp: string,
): Promise<void> => {
  await sendEmail({
    to: email,
    subject: "Reset Password OTP",
    html: buildEmailTemplate({
      preheader: `Reset your password with code ${otp}`,
      greeting: `Hello ${name}!`,
      body: `
        ${emailHelpers.paragraph("We received a password reset request for your account. Use the code below to proceed.")}
        ${emailHelpers.otpBlock(otp, "Password reset code")}
        ${emailHelpers.paragraph("If you did not request a reset, you can safely ignore this email.")}
      `,
    }),
  });
};

/** Generic "something happened" email — a starting point for new flows. */
export const sendNoticeEmail = async (
  email: string,
  subject: string,
  {
    greeting = "Hello!",
    message,
    ctaLabel,
    ctaHref = BRAND_URL,
    details,
  }: {
    greeting?: string;
    message: string;
    ctaLabel?: string;
    ctaHref?: string;
    details?: { label: string; value: string }[];
  },
): Promise<void> => {
  await sendEmail({
    to: email,
    subject,
    html: buildEmailTemplate({
      preheader: subject,
      greeting,
      body: `
        ${emailHelpers.paragraph(message)}
        ${details?.length ? emailHelpers.infoCard(details) : ""}
        ${ctaLabel ? emailHelpers.ctaButton(ctaLabel, ctaHref) : ""}
      `,
    }),
  });
};

// ---------------------------------------------------------------------------
// Passwords, OTPs and lookups
// ---------------------------------------------------------------------------

export const hashPassword = async (password: string): Promise<string> => {
  return argon2.hash(password);
};

export const verifyPassword = async (
  inputPassword: string,
  storedPassword: string,
): Promise<boolean> => {
  try {
    return await argon2.verify(storedPassword, inputPassword);
  } catch {
    return false;
  }
};

export const generateOTP = (): string =>
  crypto.randomInt(100000, 1000000).toString();

export const saveOTP = async (email: string, otp: string): Promise<void> => {
  await OTPModel.findOneAndUpdate(
    { email },
    { otp, expiresAt: new Date(Date.now() + OTP_TTL_MINUTES * 60 * 1000) },
    { upsert: true, new: true },
  );
};

/** Validates an OTP and consumes it. Throws when invalid or expired. */
export const consumeOTP = async (email: string, otp: string): Promise<void> => {
  const record = await OTPModel.findOne({ email });
  if (!record || record.otp !== otp) {
    throw new ApiError(400, "Invalid or expired OTP.");
  }
  if (record.expiresAt.getTime() < Date.now()) {
    throw new ApiError(400, "OTP has expired.");
  }
  await OTPModel.deleteOne({ _id: record._id });
};

export const findUserByEmail = async (
  email: string,
  withPassword = false,
): Promise<IUser | null> => {
  const query = UserModel.findOne({ email, isDeleted: false });
  return withPassword ? query.select("+password") : query;
};

export const findUserById = async (id: string): Promise<IUser | null> =>
  UserModel.findById(id);

/** Shape returned to clients on login / profile reads. */
export const publicUser = (user: IUser) => ({
  _id: user._id,
  name: user.name,
  email: user.email,
  phone: user.phone,
  address: user.address,
  role: user.role,
  type: user.type,
  profilePicture: user.profilePicture || null,
  isVerified: user.isVerified,
  createdAt: user.createdAt,
});
