import { NextFunction, Request, Response } from "express";
import jwt from "jsonwebtoken";

import { TRole } from "../config/role";
import { UserModel } from "../modules/user/user.model";
import sendResponse from "../utils/sendResponse";

export interface IUserPayload extends jwt.JwtPayload {
  id: string;
  role: string;
  email: string;
}

/**
 * Auth + role check. Verifies the Bearer token, loads the account and attaches
 * the decoded payload to `req.user`.
 *
 *   router.get("/thing", guardRole(["admin"]), handler)
 */
export const guardRole = (roles: TRole | TRole[]) => {
  return async (req: Request, res: Response, next: NextFunction) => {
    const token = req.headers.authorization?.split(" ")[1];
    if (!token) {
      return sendResponse(res, {
        statusCode: 401,
        success: false,
        message: "No token provided",
        data: null,
      });
    }

    let decoded: IUserPayload;
    try {
      decoded = jwt.verify(
        token,
        process.env.JWT_SECRET_KEY as string,
      ) as IUserPayload;
    } catch {
      return sendResponse(res, {
        statusCode: 498,
        success: false,
        message: "Session expired",
        data: null,
      });
    }

    (req as any).user = decoded;

    const allowed = Array.isArray(roles) ? roles : [roles];
    if (!allowed.includes(decoded.role as TRole)) {
      return sendResponse(res, {
        statusCode: 403,
        success: false,
        message: "You are not authorized to access this resource.",
        data: null,
      });
    }

    const user = await UserModel.findById(decoded.id).select(
      "isVerified isBlocked isDeleted",
    );
    if (!user || user.isDeleted) {
      return sendResponse(res, {
        statusCode: 404,
        success: false,
        message: "User not found",
        data: null,
      });
    }
    if (user.isBlocked) {
      return sendResponse(res, {
        statusCode: 403,
        success: false,
        message: "This account has been blocked.",
        data: null,
      });
    }
    if (!user.isVerified) {
      return sendResponse(res, {
        statusCode: 400,
        success: false,
        message: "This account is not verified.",
        data: null,
      });
    }

    return next();
  };
};
