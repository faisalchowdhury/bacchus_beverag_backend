import { Document, Types } from "mongoose";

export type INotification = {
  /** Recipient. */
  userId: Types.ObjectId;
  /** Admins that should also see this notification. */
  adminId: Types.ObjectId[];
  userMsgTittle: string;
  userMsg: string;
  adminMsgTittle: string;
  adminMsg: string;
  /** Free-form tag for the event that produced this notification. */
  type?: string;
  /** Id of the related record, if any (order, booking, request…). */
  referenceId?: string;
  isUserRead: boolean;
  isAdminRead: boolean;
  createdAt: Date;
  updatedAt: Date;
} & Document;

/** Payload for an FCM push. */
export type INotificationPayload = {
  title: string;
  body: string;
  data?: Record<string, string>;
};
