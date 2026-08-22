import mongoose, { Schema } from "mongoose";
import { IPayment } from "./payment.interface";

const PaymentSchema = new Schema<IPayment>(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    sessionId: { type: String, required: true, unique: true, index: true },
    paymentIntentId: { type: String, default: null },
    status: {
      type: String,
      enum: ["pending", "paid", "failed", "expired"],
      default: "pending",
    },
    amountTotal: { type: Number, required: true },
    currency: { type: String, required: true },
    customerEmail: { type: String, default: null },
    productName: { type: String, required: true },
  },
  { timestamps: true },
);

export const PaymentModel =
  mongoose.models.Payment ||
  mongoose.model<IPayment>("Payment", PaymentSchema);
