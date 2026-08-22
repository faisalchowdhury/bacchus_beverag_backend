import express from "express";

import upload from "../../multer/multer";
import { guardRole } from "../../middlewares/roleGuard";
import { UserController } from "./user.controller";
import { ALL_ROLES } from "../../config/role";

const router = express.Router();

// --- public -----------------------------------------------------------------
router.post("/register", upload.single("profilePicture"), UserController.register);
router.post("/login", UserController.login);
router.post("/otp-login", UserController.requestLoginOTP);
router.post("/verify-otp", UserController.verifyOTP);
router.post("/resend-otp", UserController.resendOTP);
router.post("/forgot-password", UserController.forgotPassword);
router.post("/reset-password", UserController.resetPassword);

// --- signed in --------------------------------------------------------------
router.get("/me", guardRole(ALL_ROLES), UserController.getMyProfile);
router.patch(
  "/me",
  guardRole(ALL_ROLES),
  upload.single("profilePicture"),
  UserController.updateMyProfile,
);
router.post("/change-password", guardRole(ALL_ROLES), UserController.changePassword);
router.delete("/me", guardRole(ALL_ROLES), UserController.deleteAccount);

// --- admin ------------------------------------------------------------------
router.get("/users", guardRole(["admin"]), UserController.getAllUsers);
router.patch(
  "/users/:userId/block",
  guardRole(["admin"]),
  UserController.setUserBlockStatus,
);

export const UserRoutes = router;
