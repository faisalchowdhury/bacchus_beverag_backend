import { Request, Response } from "express";
import httpStatus from "http-status";

import catchAsync from "../../utils/catchAsync";
import sendResponse from "../../utils/sendResponse";
import paginationBuilder from "../../utils/paginationBuilder";
import { QuoteService } from "./quote.service";
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
  updateQuote,
  getStats,
};
