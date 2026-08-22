import express from "express";
import { PaymentController } from "./payment.controller";
import { guardRole } from "../../middlewares/roleGuard";

const router = express.Router();

// Public checkout: the buyer is identified by a `userId` passed in the request
// body (sourced from the /checkout?userId=... query on the landing page), so
// no auth token / guardRole is required here.
router.post(
  "/create-checkout-session",
  PaymentController.createCheckoutSession,
);

router.get("/status/:sessionId", PaymentController.getStatus);

router.get("/admin/all", guardRole(["admin"]), PaymentController.adminGetAllPayments);

export const PaymentRoutes = router;
