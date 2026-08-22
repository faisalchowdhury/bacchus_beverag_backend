import jwt, { sign, verify } from "jsonwebtoken";
import httpStatus from "http-status";

import { JWT_EXPIRES_IN, JWT_SECRET_KEY } from "../config";
import ApiError from "../errors/ApiError";

const secret = JWT_SECRET_KEY as string;
if (!secret) throw new Error("JWT_SECRET_KEY is not defined");

export type TokenPayload = {
  id: string;
  email: string;
  role: string;
  iat?: number;
  exp?: number;
};

/** Standard session token. */
export function generateToken({
  id,
  role,
  email,
}: {
  id: any;
  role: string;
  email: string;
}): string {
  return sign({ id, role, email }, secret, {
    expiresIn: JWT_EXPIRES_IN,
  } as jwt.SignOptions);
}

/** Short-lived token for flows like password reset. */
export const generateRegisterToken = (payload: object): string =>
  sign(payload, secret, { expiresIn: "15m" });

export const generateRefreshToken = (payload: object): string =>
  sign(payload, secret, { expiresIn: "30d" });

/** Verifies a raw token (no "Bearer " prefix). Returns null when invalid. */
export function verifySocketToken(token: string): TokenPayload | null {
  try {
    return verify(token, secret) as TokenPayload;
  } catch (error) {
    console.error("Socket token verification failed:", error);
    return null;
  }
}

/** Verifies an `Authorization: Bearer <token>` header. */
export const verifyToken = (
  authHeader: string | undefined,
): Partial<TokenPayload> => {
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    throw new ApiError(
      httpStatus.UNAUTHORIZED,
      "No token provided or invalid format.",
    );
  }

  try {
    return verify(authHeader.split(" ")[1], secret) as TokenPayload;
  } catch {
    // 498 is used app-wide to mean "token expired / re-authenticate".
    throw new ApiError(498, "Invalid or expired token.");
  }
};
