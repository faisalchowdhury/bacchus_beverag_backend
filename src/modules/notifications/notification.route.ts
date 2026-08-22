import express from "express";

import { guardRole } from "../../middlewares/roleGuard";
import { ALL_ROLES } from "../../config/role";
import { NotificationController } from "./notification.controller";

const router = express.Router();

router.get("/", guardRole(ALL_ROLES), NotificationController.getMyNotifications);
router.get(
  "/badge-count",
  guardRole(ALL_ROLES),
  NotificationController.getUnreadBadgeCount,
);

// Body: { title, body, fcmTokens?: string | string[], toAllUsers?: boolean }
router.post(
  "/send-push",
  guardRole(["admin"]),
  NotificationController.adminSendPushNotification,
);

export const NotificationRoutes = router;
