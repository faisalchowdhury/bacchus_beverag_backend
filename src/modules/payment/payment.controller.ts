import { Request, Response } from "express";
import Stripe from "stripe";
import httpStatus from "http-status";
import catchAsync from "../../utils/catchAsync";
import sendResponse from "../../utils/sendResponse";
import ApiError from "../../errors/ApiError";
import stripe from "../../utils/stripe";
import { PaymentService } from "./payment.service";
import {
  CLIENT_URL,
  PRODUCT_PRICE_ID,
  STRIPE_WEBHOOK_SECRET,
} from "../../config";
import { logger } from "../../logger/logger";

/**
 * POST /api/payments/create-checkout-session
 * Body: { userId: string, customerEmail?: string }
 * The product/price is decided entirely here (PRODUCT_PRICE_ID) — the browser
 * never sends a product id, price, or amount. The buyer is identified by
 * `userId`, which the landing page sources from /checkout?userId=...
 */
const createCheckoutSession = catchAsync(
  async (req: Request, res: Response) => {
    const { quantity, customerEmail, userId } = req.body ?? {};

    if (!userId) {
      throw new ApiError(httpStatus.BAD_REQUEST, "userId is required");
    }

    const priceId = PRODUCT_PRICE_ID;
    if (!priceId) {
      throw new ApiError(
        httpStatus.INTERNAL_SERVER_ERROR,
        "PRODUCT_PRICE_ID is not configured",
      );
    }

    const qty = Number.isFinite(Number(quantity)) ? Number(quantity) : 1;
    const lineQuantity = qty > 0 ? qty : 1;

    // Pull the price (with its product) so we can persist a human-readable
    // product name and amount even while the payment is still "pending".
    const price = await stripe.prices.retrieve(priceId, {
      expand: ["product"],
    });
    const product = price.product as Stripe.Product;
    const productName =
      typeof product === "object" && product?.name ? product.name : "Product";

    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      line_items: [{ price: priceId, quantity: lineQuantity }],
      ...(customerEmail ? { customer_email: customerEmail } : {}),
      // Keep userId on the Stripe session too, so it is recoverable from the
      // webhook / Stripe Dashboard even independent of our DB record.
      metadata: { userId: String(userId) },
      success_url: `${CLIENT_URL}/payment/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${CLIENT_URL}/payment/cancel`,
    });

    const amountTotal =
      session.amount_total ?? (price.unit_amount ?? 0) * lineQuantity;
    const currency = session.currency ?? price.currency ?? "usd";

    await PaymentService.createPayment({
      userId: userId as any,
      sessionId: session.id,
      status: "pending",
      amountTotal,
      currency,
      customerEmail: customerEmail ?? session.customer_email ?? null,
      productName,
    });

    sendResponse(res, {
      statusCode: httpStatus.OK,
      success: true,
      message: "Checkout session created successfully",
      data: { url: session.url, sessionId: session.id },
    });
  },
);

/**
 * GET /api/payments/status/:sessionId
 */
const getStatus = catchAsync(async (req: Request, res: Response) => {
  const { sessionId } = req.params;
  const result = await PaymentService.getStatus(sessionId);

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: "Payment status retrieved successfully",
    data: result,
  });
});

/**
 * POST /api/payments/webhook
 * Requires the RAW request body (registered with express.raw before json
 * parsing). Stripe is the source of truth for "paid".
 */
const stripeWebhook = async (req: Request, res: Response) => {
  const signature = req.headers["stripe-signature"];

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(
      req.body, // raw Buffer
      signature as string,
      STRIPE_WEBHOOK_SECRET,
    );
  } catch (err: any) {
    logger.error(
      `⚠️ Stripe webhook signature verification failed: ${err.message}`,
    );
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  try {
    switch (event.type) {
      case "checkout.session.completed": {
        const session = event.data.object as Stripe.Checkout.Session;
        await PaymentService.markPaid(session.id, {
          paymentIntentId:
            typeof session.payment_intent === "string"
              ? session.payment_intent
              : (session.payment_intent?.id ?? null),
          amountTotal: session.amount_total,
          currency: session.currency,
          customerEmail:
            session.customer_email ?? session.customer_details?.email ?? null,
        });
        break;
      }

      case "checkout.session.expired": {
        const session = event.data.object as Stripe.Checkout.Session;
        await PaymentService.markExpired(session.id);
        break;
      }

      case "payment_intent.payment_failed": {
        const intent = event.data.object as Stripe.PaymentIntent;
        await PaymentService.markFailedByPaymentIntent(intent.id);
        break;
      }

      default:
        // Unhandled event types are acknowledged so Stripe stops retrying.
        break;
    }
  } catch (err: any) {
    // The signature is already verified, so the event is genuine; log and
    // still return 200 so Stripe does not hammer us with retries on a
    // transient DB hiccup.
    logger.error(
      `Stripe webhook handler error (${event.type}): ${err.message}`,
    );
  }

  return res.status(200).json({ received: true });
};

const adminGetAllPayments = catchAsync(async (req: Request, res: Response) => {
  const page = parseInt(req.query.page as string) || 1;
  const limit = parseInt(req.query.limit as string) || 10;
  const status = req.query.status as string;
  const search = req.query.search as string;
  const skip = (page - 1) * limit;

  const query: any = {};
  if (status) query.status = status;
  if (search) {
    query.$or = [
      { productName: { $regex: search, $options: "i" } },
      { sessionId: { $regex: search, $options: "i" } },
      { customerEmail: { $regex: search, $options: "i" } },
    ];
  }

  const [payments, total, statsAgg] = await Promise.all([
    PaymentService.findMany(query, skip, limit),
    PaymentService.countDocuments(query),
    PaymentService.getStats(),
  ]);

  const totalPages = Math.ceil(total / limit);

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: "Payments retrieved successfully",
    data: {
      payments,
      stats: statsAgg,
      pagination: {
        totalData: total,
        totalPage: totalPages,
        currentPage: page,
        prevPage: page > 1 ? page - 1 : null,
        nextPage: page < totalPages ? page + 1 : null,
      },
    },
  });
});

export const PaymentController = {
  createCheckoutSession,
  getStatus,
  stripeWebhook,
  adminGetAllPayments,
};
