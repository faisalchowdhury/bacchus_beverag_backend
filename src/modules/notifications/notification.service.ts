import { Types } from "mongoose";

import { NotificationModel } from "./notification.model";
import { UserModel } from "../user/user.model";
import { sendPushNotificationToMultiple } from "./pushNotification/pushNotification.controller";
import { emitNotification } from "../../utils/socket";

type NotifyOptions = {
  title: string;
  message: string;
  /** Free-form tag, e.g. "order_created". Also forwarded in the push payload. */
  type?: string;
  referenceId?: string;
  /** Extra key/value pairs for the FCM data payload. */
  data?: Record<string, string>;
};

/**
 * Notify one user: stores a notification row, emits it over the socket and
 * sends an FCM push. Push/socket failures are swallowed — the DB row is the
 * source of truth.
 *
 *   await notifyUser(order.userId, { title: "Order confirmed", message: "..." })
 */
export const notifyUser = async (
  userId: Types.ObjectId | string,
  { title, message, type, referenceId, data }: NotifyOptions,
) => {
  const notification = await NotificationModel.create({
    userId,
    userMsgTittle: title,
    userMsg: message,
    type,
    referenceId,
  });

  await emitNotification(userId, { title, message, type, referenceId });

  const user = await UserModel.findById(userId).select("fcmToken");
  if (user?.fcmToken) {
    await sendPushNotificationToMultiple([user.fcmToken], {
      title,
      body: message,
      data: { ...(type && { type }), ...(referenceId && { referenceId }), ...data },
    });
  }

  return notification;
};

/** Notify every admin account. */
export const notifyAdmins = async ({
  title,
  message,
  type,
  referenceId,
}: NotifyOptions) => {
  const admins = await UserModel.find({ role: "admin", isDeleted: false }).select(
    "_id fcmToken",
  );
  if (admins.length === 0) return null;

  const notification = await NotificationModel.create({
    userId: admins[0]._id,
    adminId: admins.map((a) => a._id),
    adminMsgTittle: title,
    adminMsg: message,
    type,
    referenceId,
  });

  const tokens = admins.map((a) => a.fcmToken).filter(Boolean) as string[];
  if (tokens.length) {
    await sendPushNotificationToMultiple(tokens, { title, body: message });
  }

  return notification;
};

export const NotificationService = { notifyUser, notifyAdmins };
