import { Document, Types } from "mongoose";

export type TPaymentStatus = "pending" | "paid" | "failed" | "expired";

export interface IPayment extends Document {
  userId: Types.ObjectId;
  sessionId: string;
  paymentIntentId?: string | null;
  status: TPaymentStatus;
  amountTotal: number;
  currency: string;
  customerEmail?: string | null;
  productName: string;
  createdAt: Date;
  updatedAt: Date;
}
