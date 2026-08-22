import cookieParser from "cookie-parser";
import cors from "cors";
import express, { Application, Request, Response } from "express";

import router from "./routes";
import notFound from "./middlewares/notFound";
import globalErrorHandler from "./middlewares/globalErrorHandler";
import { logHttpRequests } from "./logger/logger";
import { template } from "./rootTemplate";
import { PaymentController } from "./modules/payment/payment.controller";
import { PaymentRoutes } from "./modules/payment/payment.route";
import { CLIENT_URL, EXTRA_CORS_ORIGINS } from "./config";

const app: Application = express();

app.use(logHttpRequests);

// Stripe verifies the webhook signature against the RAW body, so this route is
// registered BEFORE express.json() below.
app.post(
  "/api/payments/webhook",
  express.raw({ type: "application/json" }),
  PaymentController.stripeWebhook,
);

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());

const allowedOrigins = [
  CLIENT_URL,
  "http://localhost:5173",
  "http://localhost:3000",
  "http://localhost:4010",
  "http://localhost:4004",
  ...EXTRA_CORS_ORIGINS,
];

app.use(
  cors({
    origin: (origin, callback) => {
      // No Origin header = non-browser client (Postman, mobile app) — allow.
      callback(null, !origin || allowedOrigins.includes(origin));
    },
    credentials: true,
  }),
);

// Uploaded files and static assets.
app.use(express.static("public"));

// Stripe JSON endpoints the frontend calls directly.
app.use("/api/payments", PaymentRoutes);

// Feature modules (mounted under /api/v1).
app.use(router);

app.get("/", (_req: Request, res: Response) => {
  res.status(200).send(template);
});

app.get("/health", (_req: Request, res: Response) => {
  res.status(200).json({ status: "ok", uptime: process.uptime() });
});

app.all("*", notFound);
app.use(globalErrorHandler);

export default app;
