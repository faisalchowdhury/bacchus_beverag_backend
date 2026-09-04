import { Request, Response } from "express";
import httpStatus from "http-status";

import catchAsync from "../../utils/catchAsync";
import sendResponse from "../../utils/sendResponse";
import { StaffService } from "./staff.service";

/**
 * POST /api/v1/staff — admin only.
 * Creates a staff account and emails them their sign-in details.
 */
const createStaff = catchAsync(async (req: Request, res: Response) => {
  const createdBy = (req as unknown as { user?: { id?: string } }).user?.id;

  const { staff, welcomeEmailSent, temporaryPassword } = await StaffService.createStaff(
    req.body,
    createdBy,
  );

  sendResponse(res, {
    statusCode: httpStatus.CREATED,
    success: true,
    message: welcomeEmailSent
      ? "Staff member added — their sign-in details have been emailed to them."
      : "Staff member added, but we could not email their sign-in details. Pass the password on yourself.",
    data: { staff, welcomeEmailSent, temporaryPassword },
  });
});

/** GET /api/v1/staff — admin only. */
const listStaff = catchAsync(async (req: Request, res: Response) => {
  const staff = await StaffService.getStaffList({
    search: req.query.search as string | undefined,
    includeInactive: req.query.includeInactive === "true",
  });

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: "Staff retrieved.",
    data: staff,
  });
});

/** GET /api/v1/staff/:id — admin only. */
const getStaff = catchAsync(async (req: Request, res: Response) => {
  const staff = await StaffService.getStaffById(req.params.id);

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: "Staff member retrieved.",
    data: staff,
  });
});

/** PATCH /api/v1/staff/:id — admin only. Details and notification preferences. */
const updateStaff = catchAsync(async (req: Request, res: Response) => {
  const staff = await StaffService.updateStaff(req.params.id, req.body);

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: "Staff member updated.",
    data: staff,
  });
});

/** DELETE /api/v1/staff/:id — admin only. Soft delete. */
const removeStaff = catchAsync(async (req: Request, res: Response) => {
  const staff = await StaffService.removeStaff(req.params.id);

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: "Staff member removed. They can no longer sign in or be notified.",
    data: staff,
  });
});

/** POST /api/v1/staff/:id/reset-password — admin only. */
const resetPassword = catchAsync(async (req: Request, res: Response) => {
  const result = await StaffService.resetStaffPassword(req.params.id);

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: result.emailSent
      ? "A new password has been emailed to them."
      : "Password reset, but the email could not be sent. Pass the new password on yourself.",
    data: result,
  });
});

/**
 * GET /api/v1/staff/recipients — admin only.
 *
 * Who would actually be emailed for each event. Exposed so the dashboard can
 * show the real distribution list rather than implying one from the toggles.
 */
const getRecipients = catchAsync(async (_req: Request, res: Response) => {
  const [newQuote, quoteAccepted] = await Promise.all([
    StaffService.getNotificationRecipients("newQuote"),
    StaffService.getNotificationRecipients("quoteAccepted"),
  ]);

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: "Notification recipients retrieved.",
    data: { newQuote, quoteAccepted },
  });
});

export const StaffController = {
  createStaff,
  listStaff,
  getStaff,
  updateStaff,
  removeStaff,
  resetPassword,
  getRecipients,
};
