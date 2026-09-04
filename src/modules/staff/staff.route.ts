import express from "express";

import { guardRole } from "../../middlewares/roleGuard";
import { StaffController } from "./staff.controller";

const router = express.Router();

/*
 * Staff management is admin-only throughout. A staff member can read the quote
 * pipeline, but cannot add, edit or remove colleagues.
 *
 * `recipients` is declared before `/:id` so it is not swallowed as an id.
 */
router.get("/recipients", guardRole(["admin"]), StaffController.getRecipients);

router.post("/", guardRole(["admin"]), StaffController.createStaff);
router.get("/", guardRole(["admin"]), StaffController.listStaff);
router.get("/:id", guardRole(["admin"]), StaffController.getStaff);
router.patch("/:id", guardRole(["admin"]), StaffController.updateStaff);
router.delete("/:id", guardRole(["admin"]), StaffController.removeStaff);
router.post("/:id/reset-password", guardRole(["admin"]), StaffController.resetPassword);

export const StaffRoutes = router;
