import mongoose, { Schema } from "mongoose";
import { INotification } from "./notification.interface";

const NotificationSchema = new Schema<INotification>(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    adminId: [{ type: Schema.Types.ObjectId, ref: "User" }],

    userMsgTittle: { type: String },
    userMsg: { type: String },
    adminMsgTittle: { type: String },
    adminMsg: { type: String },

    type: { type: String },
    referenceId: { type: String },

    isUserRead: { type: Boolean, default: false },
    isAdminRead: { type: Boolean, default: false },
  },
  { timestamps: true },
);

export const NotificationModel =
  mongoose.models.Notification ||
  mongoose.model<INotification>("Notification", NotificationSchema);
