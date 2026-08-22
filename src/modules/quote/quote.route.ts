import express from "express";

import { guardRole } from "../../middlewares/roleGuard";
import { QuoteController } from "./quote.controller";

const router = express.Router();

// Public — this is how new enquiries arrive.
router.post("/", QuoteController.submitQuote);

// --- dashboard (admin) ------------------------------------------------------
// `stats` is declared before `/:id` so it is not swallowed as an id.
router.get("/stats", guardRole(["admin"]), QuoteController.getStats);
router.get("/", guardRole(["admin"]), QuoteController.listQuotes);
router.get("/:id", guardRole(["admin"]), QuoteController.getQuote);
router.patch("/:id", guardRole(["admin"]), QuoteController.updateQuote);

export const QuoteRoutes = router;
