import { Request, Response } from "express";
import httpStatus from "http-status";

import catchAsync from "../../utils/catchAsync";
import sendResponse from "../../utils/sendResponse";
import paginationBuilder from "../../utils/paginationBuilder";
import { QuoteService } from "./quote.service";
import { clientIpFrom } from "./quote.acceptance";
import type { IQuoteSubmissionPayload } from "./quote.interface";

/**
 * POST /api/v1/quote
 *
 * Public — the quote designer is the front door for new enquiries, so this
 * cannot sit behind auth. The estimate goes to the address the client typed,
 * and a copy goes to the venue.
 */
const submitQuote = catchAsync(async (req: Request, res: Response) => {
  const payload = req.body as IQuoteSubmissionPayload;

  const { breakdown, clientEmailSent, ownerEmailSent, quoteId } =
    await QuoteService.submitQuoteRequest(payload);

  sendResponse(res, {
    statusCode: httpStatus.CREATED,
    success: true,
    message: clientEmailSent
      ? "Quote received — a copy has been emailed to you."
      : "Quote received. We could not email a copy, but your request has reached us.",
    data: {
      quoteId,
      clientEmailSent,
      ownerEmailSent,
      // Returned so the client can display the authoritative figures rather
      // than its own, if the two ever drift.
      grandTotal: breakdown.grandTotal,
      breakdown,
    },
  });
});

/**
 * GET /api/v1/quote — admin only.
 * Paginated list for the dashboard. Supports ?search, ?status, ?barType,
 * ?sortBy, ?sortOrder, ?page, ?limit.
 */
const listQuotes = catchAsync(async (req: Request, res: Response) => {
  const { quotes, totalData, page, limit } = await QuoteService.getQuoteList({
    page: Number(req.query.page) || 1,
    limit: Number(req.query.limit) || 10,
    search: req.query.search as string | undefined,
    status: req.query.status as string | undefined,
    acceptanceStatus: req.query.acceptanceStatus as string | undefined,
    barType: req.query.barType as string | undefined,
    sortBy: req.query.sortBy as string | undefined,
    sortOrder: req.query.sortOrder === "asc" ? "asc" : "desc",
  });

  const p = paginationBuilder({ totalData, currentPage: page, limit });

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: "Quotes retrieved.",
    pagination: {
      totalPage: p.totalPage,
      currentPage: p.currentPage,
      prevPage: p.prevPage as number,
      nextPage: p.nextPage as number,
      limit,
      totalItem: totalData,
    },
    data: quotes,
  });
});

/** GET /api/v1/quote/:id — admin only. Everything the client submitted. */
const getQuote = catchAsync(async (req: Request, res: Response) => {
  const quote = await QuoteService.getQuoteById(req.params.id);

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: "Quote retrieved.",
    data: quote,
  });
});

/**
 * GET /api/v1/quote/:id/contract — admin only.
 *
 * Streams the Bartending Service Contract as a PDF. `?disposition=inline`
 * (the default) lets the dashboard preview it in a viewer; `attachment`
 * triggers a download with a client-specific filename.
 *
 * This one does not use `sendResponse` — the body is a PDF, not the usual
 * JSON envelope.
 */
const getQuoteContract = catchAsync(async (req: Request, res: Response) => {
  const { buffer, fileName } = await QuoteService.getQuoteContractPdf(req.params.id);

  const disposition = req.query.disposition === "attachment" ? "attachment" : "inline";

  res.setHeader("Content-Type", "application/pdf");
  res.setHeader("Content-Length", buffer.length);
  res.setHeader(
    "Content-Disposition",
    `${disposition}; filename="${fileName}"; filename*=UTF-8''${encodeURIComponent(fileName)}`,
  );
  // The contract reflects live quote data — never let a proxy hand back a
  // copy rendered before the owner edited the booking.
  res.setHeader("Cache-Control", "no-store");
  // So the dashboard can read the filename off a cross-origin fetch.
  res.setHeader("Access-Control-Expose-Headers", "Content-Disposition");

  res.status(httpStatus.OK).end(buffer);
});

/* ══════════════════════════════════════════════════════════════════════
   Client-facing acceptance — no auth, the token is the credential
   ══════════════════════════════════════════════════════════════════════ */

/**
 * GET /api/v1/quote/accept/:token — public.
 *
 * Backs the review page the client lands on from their estimate email. The
 * response is a hand-built public view: no admin notes, no pipeline status,
 * no token hash.
 */
const getQuoteForAcceptance = catchAsync(async (req: Request, res: Response) => {
  const quote = await QuoteService.getQuoteByAcceptanceToken(req.params.token);

  // A quote link should never be cached by a shared proxy, and should not
  // linger in a browser's back-forward cache after acceptance.
  res.setHeader("Cache-Control", "no-store");

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: "Quote retrieved.",
    data: quote,
  });
});

/**
 * POST /api/v1/quote/accept/:token — public.
 *
 * The client confirming. Notifies the team with the contract attached, and
 * emails the client a receipt. Safe to call twice — the second call reports
 * the existing acceptance instead of notifying anyone again.
 */
const acceptQuote = catchAsync(async (req: Request, res: Response) => {
  const result = await QuoteService.acceptQuoteByToken(req.params.token, {
    ip: clientIpFrom(req.headers as Record<string, unknown>, req.ip),
    userAgent: String(req.headers["user-agent"] ?? ""),
  });

  res.setHeader("Cache-Control", "no-store");

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: result.firstAcceptance
      ? "Thank you — your acceptance has been recorded and our team has been notified."
      : "This quote was already accepted. Our team has your acceptance on file.",
    data: result,
  });
});

/**
 * POST /api/v1/quote/:id/resend-acceptance — admin only.
 *
 * Issues a fresh link and re-sends the estimate. For when a client never got
 * the email, or clicked after the original link aged out.
 */
const resendAcceptanceLink = catchAsync(async (req: Request, res: Response) => {
  const result = await QuoteService.reissueAcceptanceLink(req.params.id);

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: result.emailSent
      ? "A fresh estimate with a new acceptance link has been emailed to the client."
      : "A new link was issued, but the email could not be sent.",
    data: result,
  });
});

/** PATCH /api/v1/quote/:id — admin only. Pipeline status and private notes. */
const updateQuote = catchAsync(async (req: Request, res: Response) => {
  const quote = await QuoteService.updateQuoteAdminFields(req.params.id, {
    status: req.body?.status,
    adminNotes: req.body?.adminNotes,
  });

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: "Quote updated.",
    data: quote,
  });
});

/** GET /api/v1/quote/stats — admin only. Headline figures for the overview. */
const getStats = catchAsync(async (_req: Request, res: Response) => {
  const stats = await QuoteService.getQuoteStats();

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: "Quote stats retrieved.",
    data: stats,
  });
});

export const QuoteController = {
  submitQuote,
  listQuotes,
  getQuote,
  getQuoteContract,
  updateQuote,
  getStats,

  getQuoteForAcceptance,
  acceptQuote,
  resendAcceptanceLink,
};
