import { NextFunction, Request, Response } from "express";
import httpStatus from "http-status";

import catchAsync from "../../utils/catchAsync";
import sendResponse from "../../utils/sendResponse";
import ApiError from "../../errors/ApiError";
import paginationBuilder from "../../utils/paginationBuilder";
import { IUserPayload } from "../../middlewares/roleGuard";
import { UserModel } from "../user/user.model";
import { NotificationModel } from "./notification.model";
import { sendPushNotificationToMultiple } from "./pushNotification/pushNotification.controller";

/**
 * A notification row carries both a user-facing and an admin-facing message.
 * Which fields a request sees depends on the caller's role.
 */
const viewForRole = (role: string) =>
  role === "admin"
    ? {
        queryKey: "adminId",
        titleField: "adminMsgTittle",
        msgField: "adminMsg",
        readField: "isAdminRead",
      }
    : {
        queryKey: "userId",
        titleField: "userMsgTittle",
        msgField: "userMsg",
        readField: "isUserRead",
      };

/** GET / — the caller's notifications (paginated), marked read afterwards. */
export const getMyNotifications = catchAsync(
  async (req: Request, res: Response) => {
    const auth = req.user as IUserPayload;
    const view = viewForRole(auth.role);

    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 20;
    const query = { [view.queryKey]: auth.id };

    const [rows, totalData] = await Promise.all([
      NotificationModel.find(query)
        .sort({ createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit),
      NotificationModel.countDocuments(query),
    ]);

    sendResponse(res, {
      statusCode: httpStatus.OK,
      success: true,
      message: rows.length
        ? "Notifications retrieved successfully."
        : "You have no notifications.",
      data: rows.map((row: any) => ({
        _id: row._id,
        title: row[view.titleField] || "",
        msg: row[view.msgField] || "",
        type: row.type,
        referenceId: row.referenceId,
        isRead: row[view.readField],
        createdAt: row.createdAt,
      })),
      pagination: (() => {
        const p = paginationBuilder({ totalData, currentPage: page, limit });
        return { ...p, prevPage: p.prevPage ?? 0, nextPage: p.nextPage ?? 0 };
      })(),
    });

    await NotificationModel.updateMany(
      { ...query, [view.readField]: false },
      { $set: { [view.readField]: true } },
    );
  },
);

/** GET /badge-count — unread count plus the three most recent messages. */
export const getUnreadBadgeCount = catchAsync(
  async (req: Request, res: Response) => {
    const auth = req.user as IUserPayload;
    const view = viewForRole(auth.role);

    const [unreadCount, latest] = await Promise.all([
      NotificationModel.countDocuments({
        [view.queryKey]: auth.id,
        [view.readField]: false,
      }),
      NotificationModel.find({ [view.queryKey]: auth.id })
        .sort({ createdAt: -1 })
        .limit(3),
    ]);

    sendResponse(res, {
      statusCode: httpStatus.OK,
      success: true,
      message: "Unread badge count retrieved successfully.",
      data: {
        unreadCount,
        latestNotifications: latest.map((row: any) => ({
          title: row[view.titleField] || "",
          msg: row[view.msgField] || "",
          createdAt: row.createdAt,
        })),
      },
    });
  },
);

/** POST /send-push — admin broadcast to explicit tokens or to every user. */
export const adminSendPushNotification = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const { fcmTokens, title, body, toAllUsers } = req.body;

    if (!title || !body) {
      throw new ApiError(httpStatus.BAD_REQUEST, "title and body are required.");
    }

    let tokens: string[] = [];
    if (toAllUsers) {
      const users = await UserModel.find({
        isDeleted: false,
        fcmToken: { $exists: true, $ne: null },
      }).select("fcmToken");
      tokens = users.map((u) => u.fcmToken as string);
    } else if (typeof fcmTokens === "string") {
      tokens = [fcmTokens];
    } else if (Array.isArray(fcmTokens)) {
      tokens = fcmTokens;
    } else {
      throw new ApiError(
        httpStatus.BAD_REQUEST,
        "Provide fcmTokens (string or array) or set toAllUsers.",
      );
    }

    const response = await sendPushNotificationToMultiple(tokens, { title, body });

    sendResponse(res, {
      statusCode: httpStatus.OK,
      success: true,
      message: "Push notifications sent.",
      data: response,
    });
  } catch (error) {
    next(error);
  }
};

export const NotificationController = {
  getMyNotifications,
  getUnreadBadgeCount,
  adminSendPushNotification,
};
