import { Request, Response } from "express";
import httpStatus from "http-status";

import catchAsync from "../../utils/catchAsync";
import sendResponse from "../../utils/sendResponse";
import ApiError from "../../errors/ApiError";
import { IUserPayload } from "../../middlewares/roleGuard";

import { OTPModel, UserModel } from "./user.model";
import { UserService } from "./user.service";
import {
  consumeOTP,
  findUserByEmail,
  generateOTP,
  hashPassword,
  publicUser,
  saveOTP,
  sendLoginOTPEmail,
  sendRegisterOTPEmail,
  sendResetPasswordOTPEmail,
  sendVerificationOTPEmail,
  verifyPassword,
} from "./user.utils";
import {
  generateRegisterToken,
  generateToken,
  verifyToken,
} from "../../utils/JwtToken";

const authToken = (user: { _id: unknown; email: string; role: string }) =>
  generateToken({ id: user._id, email: user.email, role: user.role });

/** Pragmatic shape check — the OTP round trip is what actually proves an address. */
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MIN_PASSWORD_LENGTH = 8;

/**
 * POST /register
 * Creates the account and emails a verification OTP. Social accounts
 * (type: apple | google) are trusted and skip the OTP step.
 */
const register = catchAsync(async (req: Request, res: Response) => {
  const { name, email, password, phone, role, type, fcmToken } = req.body;

  if (!name || !email) {
    throw new ApiError(httpStatus.BAD_REQUEST, "Name and email are required.");
  }

  if (!EMAIL_PATTERN.test(String(email))) {
    throw new ApiError(httpStatus.BAD_REQUEST, "email: invalid email address.");
  }

  const accountRole = role === "admin" ? "user" : role || "user"; // never self-register as admin
  const accountType = ["apple", "google"].includes(type) ? type : "default";

  const existing = await UserModel.findOne({ email, role: accountRole });
  if (existing) {
    throw new ApiError(
      httpStatus.BAD_REQUEST,
      "An account with this email already exists. Please log in.",
    );
  }

  if (accountType === "default") {
    if (!password) {
      throw new ApiError(httpStatus.BAD_REQUEST, "Password is required.");
    }
    if (String(password).length < MIN_PASSWORD_LENGTH) {
      throw new ApiError(
        httpStatus.BAD_REQUEST,
        `Password must be at least ${MIN_PASSWORD_LENGTH} characters long.`,
      );
    }
  }

  const user = await UserModel.create({
    name,
    email,
    phone,
    role: accountRole,
    type: accountType,
    isVerified: accountType !== "default",
    password: accountType === "default" ? await hashPassword(password) : null,
    ...(req.file && { profilePicture: `/images/${req.file.filename}` }),
    ...(fcmToken && { fcmToken }),
  });

  let emailSent: boolean | null = null;
  if (accountType === "default") {
    const otp = generateOTP();
    await saveOTP(email, otp);
    emailSent = await sendRegisterOTPEmail(name, email, otp)
      .then(() => true)
      .catch((err) => {
        console.error("Registration OTP email failed:", err);
        return false;
      });
  }

  sendResponse(res, {
    statusCode: httpStatus.CREATED,
    success: true,
    message: emailSent === false
      ? "Account created, but the verification email could not be sent. Please use resend OTP."
      : "Account created successfully. Please verify your email.",
    data: { user: publicUser(user), token: authToken(user), emailSent },
  });
});

/**
 * POST /login — email + password.
 * Unverified accounts get a fresh OTP instead of a session.
 */
const login = catchAsync(async (req: Request, res: Response) => {
  const { email, password, role, fcmToken } = req.body;

  const user = await UserModel.findOne({
    email,
    isDeleted: false,
    ...(role && { role }),
  }).select("+password");

  if (!user) throw new ApiError(httpStatus.UNAUTHORIZED, "Invalid email or password.");
  if (user.isBlocked) {
    throw new ApiError(httpStatus.FORBIDDEN, "This account has been blocked.");
  }

  // Social accounts have no password — they sign in by provider token.
  if (user.type !== "default") {
    if (fcmToken) await UserModel.findByIdAndUpdate(user._id, { fcmToken });
    return sendResponse(res, {
      statusCode: httpStatus.OK,
      success: true,
      message: "Login successful.",
      data: { user: publicUser(user), token: authToken(user) },
    });
  }

  const isValid =
    !!user.password && (await verifyPassword(password, user.password));
  if (!isValid) {
    throw new ApiError(httpStatus.UNAUTHORIZED, "Invalid email or password.");
  }

  if (!user.isVerified) {
    const otp = generateOTP();
    await saveOTP(email, otp);
    sendVerificationOTPEmail(user.name, email, otp).catch((err) =>
      console.error("Verification OTP email failed:", err),
    );

    return sendResponse(res, {
      statusCode: httpStatus.UNAUTHORIZED,
      success: false,
      message: "Please verify your email. An OTP has been sent.",
      data: { token: authToken(user) },
    });
  }

  if (fcmToken) {
    user.fcmToken = fcmToken;
    await user.save();
  }

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: "Login successful.",
    data: { user: publicUser(user), token: authToken(user) },
  });
});

/**
 * POST /otp-login — passwordless sign-in. Always answers the same way so the
 * endpoint can't be used to discover which emails are registered.
 */
const requestLoginOTP = catchAsync(async (req: Request, res: Response) => {
  const { email } = req.body;
  if (!email) throw new ApiError(httpStatus.BAD_REQUEST, "Email is required.");

  const user = await findUserByEmail(email);
  if (user && !user.isBlocked) {
    const otp = generateOTP();
    await saveOTP(email, otp);
    await sendLoginOTPEmail(user.name, email, otp).catch((err) =>
      console.error("Login OTP email failed:", err),
    );
  }

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: "If this email is registered, an OTP has been sent.",
    data: null,
  });
});

/** POST /verify-otp — consumes an OTP, verifies the account and signs in. */
const verifyOTP = catchAsync(async (req: Request, res: Response) => {
  const { email, otp } = req.body;
  if (!email || !otp) {
    throw new ApiError(httpStatus.BAD_REQUEST, "Email and OTP are required.");
  }

  await consumeOTP(email, otp);

  const user = await findUserByEmail(email);
  if (!user) throw new ApiError(httpStatus.NOT_FOUND, "User not found.");

  if (!user.isVerified) {
    user.isVerified = true;
    await user.save();
  }

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: "OTP verified successfully.",
    data: { user: publicUser(user), token: authToken(user) },
  });
});

/** POST /resend-otp */
const resendOTP = catchAsync(async (req: Request, res: Response) => {
  const { email } = req.body;
  const user = await findUserByEmail(email);

  if (user) {
    const otp = generateOTP();
    await saveOTP(email, otp);
    await sendVerificationOTPEmail(user.name, email, otp).catch((err) =>
      console.error("Resend OTP email failed:", err),
    );
  }

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: "If this email is registered, an OTP has been sent.",
    data: null,
  });
});

/**
 * POST /forgot-password — emails an OTP and returns a short-lived token that
 * must be presented (as a Bearer token) to /reset-password.
 */
const forgotPassword = catchAsync(async (req: Request, res: Response) => {
  const { email } = req.body;
  if (!email) throw new ApiError(httpStatus.BAD_REQUEST, "Email is required.");

  const user = await findUserByEmail(email);
  if (user) {
    const otp = generateOTP();
    await saveOTP(email, otp);
    await sendResetPasswordOTPEmail(user.name, email, otp).catch((err) =>
      console.error("Reset password OTP email failed:", err),
    );
  }

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: "If this email is registered, an OTP has been sent.",
    data: { token: generateRegisterToken({ email }) },
  });
});

/** POST /reset-password — Bearer token from /forgot-password + otp + password. */
const resetPassword = catchAsync(async (req: Request, res: Response) => {
  const decoded = verifyToken(req.headers.authorization);
  const email = decoded.email as string;
  const { otp, password } = req.body;

  if (!password) {
    throw new ApiError(httpStatus.BAD_REQUEST, "Password is required.");
  }
  if (!otp) throw new ApiError(httpStatus.BAD_REQUEST, "OTP is required.");

  await consumeOTP(email, otp);

  const user = await findUserByEmail(email);
  if (!user) throw new ApiError(httpStatus.NOT_FOUND, "User not found.");

  user.password = await hashPassword(password);
  user.isVerified = true;
  await user.save();

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: "Password reset successfully.",
    data: null,
  });
});

/** POST /change-password — for a signed-in user. */
const changePassword = catchAsync(async (req: Request, res: Response) => {
  const { oldPassword, newPassword } = req.body;
  if (!oldPassword || !newPassword) {
    throw new ApiError(
      httpStatus.BAD_REQUEST,
      "Please provide both the old and the new password.",
    );
  }

  const { id } = req.user as IUserPayload;
  const user = await UserModel.findById(id).select("+password");
  if (!user) throw new ApiError(httpStatus.NOT_FOUND, "User not found.");

  const isMatch =
    !!user.password && (await verifyPassword(oldPassword, user.password));
  if (!isMatch) {
    throw new ApiError(httpStatus.UNAUTHORIZED, "Old password is incorrect.");
  }

  user.password = await hashPassword(newPassword);
  await user.save();

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: "Password changed successfully.",
    data: null,
  });
});

/** GET /me */
const getMyProfile = catchAsync(async (req: Request, res: Response) => {
  const { id } = req.user as IUserPayload;
  const user = await UserModel.findById(id);
  if (!user) throw new ApiError(httpStatus.NOT_FOUND, "User not found.");

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: "Profile retrieved successfully.",
    data: publicUser(user),
  });
});

/** PATCH /me — name / phone / address / profilePicture. */
const updateMyProfile = catchAsync(async (req: Request, res: Response) => {
  const { id } = req.user as IUserPayload;
  const { name, phone, address, email } = req.body;

  const updateData: Record<string, unknown> = {};
  if (name) updateData.name = name;
  if (phone) updateData.phone = phone;
  if (address) updateData.address = address;
  if (req.file) updateData.profilePicture = `/images/${req.file.filename}`;

  /*
   * Email changes need care: the unique index is { email, role }, so the same
   * address may legitimately hold both a client and an admin account. Only
   * reject when the address is already taken *within the same role*.
   */
  if (email) {
    const nextEmail = String(email).trim().toLowerCase();

    if (!EMAIL_PATTERN.test(nextEmail)) {
      throw new ApiError(httpStatus.BAD_REQUEST, "email: invalid email address.");
    }

    const current = await UserModel.findById(id);
    if (!current) throw new ApiError(httpStatus.NOT_FOUND, "User not found.");

    if (nextEmail !== current.email) {
      const taken = await UserModel.findOne({
        email: nextEmail,
        role: current.role,
        _id: { $ne: id },
        isDeleted: false,
      });
      if (taken) {
        throw new ApiError(
          httpStatus.BAD_REQUEST,
          "Another account already uses that email address.",
        );
      }
      updateData.email = nextEmail;
    }
  }

  const user = await UserService.updateUserById(id, updateData);
  if (!user) throw new ApiError(httpStatus.NOT_FOUND, "User not found.");

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: "Profile updated successfully.",
    data: publicUser(user),
  });
});

/** DELETE /me — soft delete. Admins may delete another account via ?id=. */
const deleteAccount = catchAsync(async (req: Request, res: Response) => {
  const auth = req.user as IUserPayload;
  const targetId = (req.query.id as string) || auth.id;

  if (targetId !== auth.id && auth.role !== "admin") {
    throw new ApiError(
      httpStatus.FORBIDDEN,
      "You cannot delete this account. Please contact support.",
    );
  }

  const user = await UserModel.findById(targetId);
  if (!user || user.isDeleted) {
    throw new ApiError(httpStatus.NOT_FOUND, "User not found.");
  }

  await UserService.softDeleteUser(targetId, user.email);
  await OTPModel.deleteMany({ email: user.email });

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: "Account deleted successfully.",
    data: null,
  });
});

// ---------------------------------------------------------------------------
// Admin
// ---------------------------------------------------------------------------

/** GET /users — admin list with search, role filter and pagination. */
const getAllUsers = catchAsync(async (req: Request, res: Response) => {
  const { users, pagination } = await UserService.getUserList({
    page: parseInt(req.query.page as string) || 1,
    limit: parseInt(req.query.limit as string) || 10,
    search: req.query.search as string,
    role: req.query.role as string,
    date: req.query.date as string,
  });

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: "User list retrieved successfully.",
    data: users,
    pagination: {
      ...pagination,
      prevPage: pagination.prevPage ?? 0,
      nextPage: pagination.nextPage ?? 0,
    },
  });
});

/** PATCH /users/:userId/block — body: { isBlocked: boolean }. */
const setUserBlockStatus = catchAsync(async (req: Request, res: Response) => {
  const { userId } = req.params;
  const isBlocked = Boolean(req.body.isBlocked);

  const user = await UserService.setBlockStatus(userId, isBlocked);

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: `User ${isBlocked ? "blocked" : "unblocked"} successfully.`,
    data: publicUser(user),
  });
});

export const UserController = {
  register,
  login,
  requestLoginOTP,
  verifyOTP,
  resendOTP,
  forgotPassword,
  resetPassword,
  changePassword,
  getMyProfile,
  updateMyProfile,
  deleteAccount,
  getAllUsers,
  setUserBlockStatus,
};
