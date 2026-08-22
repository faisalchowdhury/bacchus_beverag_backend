import { Router } from "express";

import { guardRole } from "../../middlewares/roleGuard";
import { DashboardController } from "./dashboard.controller";

const router = Router();

router.get(
  "/dashboard-stats",
  guardRole(["admin"]),
  DashboardController.getDashboardStats,
);

export const AdminRoutes = router;
