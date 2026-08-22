import { Request, Response, Router } from "express";
import { Model } from "mongoose";
import httpStatus from "http-status";
import sanitizeHtml from "sanitize-html";

import catchAsync from "../../utils/catchAsync";
import sendResponse from "../../utils/sendResponse";
import ApiError from "../../errors/ApiError";
import { guardRole } from "../../middlewares/roleGuard";
import { sanitizeOptions } from "../../utils/SanitizeOptions";

/**
 * "Settings pages" (about / terms / privacy) are all the same thing: a single
 * document holding one block of admin-editable rich text. This factory builds
 * the controller + router for one of them.
 *
 *   export const AboutRoutes = createSettingsPageRoutes(AboutModel, "About");
 */
export const createSettingsPageController = (
  PageModel: Model<any>,
  label: string,
) => {
  /** GET / — public. */
  const get = catchAsync(async (_req: Request, res: Response) => {
    const page = await PageModel.findOne().sort({ createdAt: -1 });

    sendResponse(res, {
      statusCode: httpStatus.OK,
      success: true,
      message: `${label} retrieved successfully.`,
      data: page,
    });
  });

  /** PATCH /update — admin. Creates the document if it does not exist yet. */
  const update = catchAsync(async (req: Request, res: Response) => {
    const { description } = req.body;
    if (!description) {
      throw new ApiError(httpStatus.BAD_REQUEST, "Description is required.");
    }

    const page = await PageModel.findOneAndUpdate(
      {},
      { description: sanitizeHtml(description, sanitizeOptions) },
      { new: true, upsert: true },
    );

    sendResponse(res, {
      statusCode: httpStatus.OK,
      success: true,
      message: `${label} updated successfully.`,
      data: page,
    });
  });

  return { get, update };
};

export const createSettingsPageRoutes = (
  PageModel: Model<any>,
  label: string,
): Router => {
  const controller = createSettingsPageController(PageModel, label);
  const router = Router();

  router.get("/", controller.get);
  router.patch("/update", guardRole(["admin"]), controller.update);

  return router;
};

/** Renders a settings page as standalone HTML (app stores need a public URL). */
export const renderSettingsPageHtml = (PageModel: Model<any>, title: string) =>
  catchAsync(async (_req: Request, res: Response) => {
    const page = await PageModel.findOne().sort({ createdAt: -1 });
    if (!page) throw new ApiError(httpStatus.NOT_FOUND, `${title} not found.`);

    res.header("Content-Type", "text/html").send(`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${title}</title>
  <style>
    body { font-family: Arial, sans-serif; line-height: 1.6; margin: 0; padding: 0; background: #f4f4f4; color: #333; }
    .container { max-width: 800px; margin: 30px auto; padding: 24px; background: #fff; border-radius: 8px; box-shadow: 0 2px 4px rgba(0,0,0,0.1); }
  </style>
</head>
<body>
  <div class="container">${page.description}</div>
</body>
</html>`);
  });
