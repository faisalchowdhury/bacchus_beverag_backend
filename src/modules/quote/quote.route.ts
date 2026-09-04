import express from "express";

import { guardRole } from "../../middlewares/roleGuard";
import { DASHBOARD_ROLES } from "../../config/role";
import { QuoteController } from "./quote.controller";

const router = express.Router();

// Public — this is how new enquiries arrive.
router.post("/", QuoteController.submitQuote);

/*
 * Public acceptance. The token in the URL is the only credential, so these
 * are declared before "/:id" and carry their own 64-hex format check in the
 * service rather than relying on route ordering alone.
 */
router.get("/accept/:token", QuoteController.getQuoteForAcceptance);
router.post("/accept/:token", QuoteController.acceptQuote);

/*
 * --- dashboard --------------------------------------------------------------
 * Staff read and work the pipeline alongside admins — seeing quotes come in is
 * the reason they have accounts. Anything that reaches back out to the client,
 * or touches accounts, stays admin-only.
 *
 * `stats` is declared before `/:id` so it is not swallowed as an id.
 */
router.get("/stats", guardRole(DASHBOARD_ROLES), QuoteController.getStats);
router.get("/", guardRole(DASHBOARD_ROLES), QuoteController.listQuotes);
router.get("/:id", guardRole(DASHBOARD_ROLES), QuoteController.getQuote);
// The signable contract, rendered from the quote on demand.
router.get("/:id/contract", guardRole(DASHBOARD_ROLES), QuoteController.getQuoteContract);
router.patch("/:id", guardRole(DASHBOARD_ROLES), QuoteController.updateQuote);
router.post(
  "/:id/resend-acceptance",
  guardRole(["admin"]),
  QuoteController.resendAcceptanceLink,
);

export const QuoteRoutes = router;
