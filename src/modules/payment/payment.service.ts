import { PaymentModel } from "./payment.model";
import { IPayment, TPaymentStatus } from "./payment.interface";
import ApiError from "../../errors/ApiError";
import httpStatus from "http-status";
import stripe from "../../utils/stripe";

const createPayment = async (payload: Partial<IPayment>) => {
  return await PaymentModel.create(payload);
};

const getBySessionId = async (sessionId: string) => {
  return await PaymentModel.findOne({ sessionId });
};

/**
 * Mark a payment as paid. Idempotent: if it is already "paid" we skip the
 * write so repeated webhook deliveries do not thrash the document.
 */
const markPaid = async (
  sessionId: string,
  data: {
    paymentIntentId?: string | null;
    amountTotal?: number | null;
    currency?: string | null;
    customerEmail?: string | null;
  },
) => {
  const payment = await PaymentModel.findOne({ sessionId });
  if (!payment) return null;
  if (payment.status === "paid") return payment;

  payment.status = "paid";
  if (data.paymentIntentId) payment.paymentIntentId = data.paymentIntentId;
  if (typeof data.amountTotal === "number")
    payment.amountTotal = data.amountTotal;
  if (data.currency) payment.currency = data.currency;
  if (data.customerEmail) payment.customerEmail = data.customerEmail;

  await payment.save();
  return payment;
};

/**
 * Move a payment to a terminal status (expired/failed) only if it is still
 * pending — a session that already completed must never be downgraded.
 */
const setStatusIfPending = async (
  filter: Record<string, unknown>,
  status: TPaymentStatus,
) => {
  return await PaymentModel.findOneAndUpdate(
    { ...filter, status: "pending" },
    { status },
    { new: true },
  );
};

const markExpired = async (sessionId: string) => {
  return await setStatusIfPending({ sessionId }, "expired");
};

const markFailedByPaymentIntent = async (paymentIntentId: string) => {
  return await setStatusIfPending({ paymentIntentId }, "failed");
};

const getStatus = async (sessionId: string) => {
  let payment = await PaymentModel.findOne({ sessionId });
  if (!payment) {
    throw new ApiError(httpStatus.NOT_FOUND, "Payment not found");
  }

  // The webhook is the primary way a payment becomes "paid", but it may be
  // delayed — or, in local dev, never reach us at all (Stripe can't call
  // localhost without the Stripe CLI). So when the record is still pending we
  // reconcile directly with Stripe, which is authoritative, and self-heal the
  // stored status. This lets the success page confirm a genuine payment.
  if (payment.status === "pending") {
    try {
      const session = await stripe.checkout.sessions.retrieve(sessionId);

      if (session.payment_status === "paid") {
        const updated = await markPaid(sessionId, {
          paymentIntentId:
            typeof session.payment_intent === "string"
              ? session.payment_intent
              : (session.payment_intent?.id ?? null),
          amountTotal: session.amount_total,
          currency: session.currency,
          customerEmail:
            session.customer_email ?? session.customer_details?.email ?? null,
        });
        if (updated) payment = updated;
      } else if (session.status === "expired") {
        const expired = await markExpired(sessionId);
        if (expired) payment = expired;
      }
    } catch {
      // Non-fatal: if Stripe can't be reached, fall back to the stored status.
    }
  }

  return {
    status: payment.status,
    amountTotal: payment.amountTotal,
    currency: payment.currency,
    customerEmail: payment.customerEmail,
    productName: payment.productName,
  };
};

const findMany = async (query: any, skip: number, limit: number) => {
  return await PaymentModel.find(query)
    .populate("userId", "name email")
    .sort({ createdAt: -1 })
    .skip(skip)
    .limit(limit);
};

const countDocuments = async (query: any) => {
  return await PaymentModel.countDocuments(query);
};

const getStats = async () => {
  const [totalAgg, completed, pending, failed] = await Promise.all([
    PaymentModel.aggregate([
      { $match: { status: "paid" } },
      { $group: { _id: null, total: { $sum: "$amountTotal" } } },
    ]),
    PaymentModel.countDocuments({ status: "paid" }),
    PaymentModel.countDocuments({ status: "pending" }),
    PaymentModel.countDocuments({ status: { $in: ["failed", "expired"] } }),
  ]);
  return {
    totalVolume: totalAgg[0]?.total || 0,
    completed,
    pending,
    failed,
  };
};

export const PaymentService = {
  createPayment,
  getBySessionId,
  markPaid,
  markExpired,
  markFailedByPaymentIntent,
  getStatus,
  findMany,
  countDocuments,
  getStats,
};
