import { ErrorRequestHandler } from "express";
import mongoose from "mongoose";

import { IErrorResponse } from "../interface/error";
import ApiError from "../errors/ApiError";
import handleValidationError from "../errors/handleValidationError";
import handlerCastError from "../errors/handleCastError";
import handlerDuplicateError from "../errors/handleDuplicateError";

const errorTypeMap: Record<number, string> = {
  400: "Bad Request",
  401: "Unauthorized",
  402: "Payment Required",
  403: "Forbidden",
  404: "Not Found",
  405: "Method Not Allowed",
  409: "Conflict",
  413: "Payload Too Large",
  415: "Unsupported Media Type",
  422: "Unprocessable Entity",
  429: "Too Many Requests",
  498: "Session Expired",
  500: "Internal Server Error",
  502: "Bad Gateway",
  503: "Service Unavailable",
  504: "Gateway Timeout",
};

/**
 * Last middleware in the chain. Normalises ApiError and Mongoose errors into
 * one response shape so clients only ever parse one format.
 */
const globalErrorHandler: ErrorRequestHandler = (error, req, res, _next) => {
  let errorInfo: IErrorResponse = {
    success: false,
    statusCode: 500,
    errorType: "Internal Server Error",
    errorMessage: "Something went wrong",
    errorDetails: { path: null, value: null },
  };

  if (error instanceof ApiError) {
    errorInfo.statusCode = error.statusCode;
    errorInfo.errorMessage = error.message;
    errorInfo.errorDetails = error.errorDetails || { path: null, value: null };
  } else if (error instanceof mongoose.Error.ValidationError) {
    errorInfo = handleValidationError(error);
  } else if (error instanceof mongoose.Error.CastError) {
    errorInfo = handlerCastError(error);
  } else if (error?.code === 11000) {
    errorInfo = handlerDuplicateError(error);
  } else if (error instanceof Error) {
    errorInfo.errorMessage = error.message;
  }

  errorInfo.errorType = errorTypeMap[errorInfo.statusCode] || "Unknown Error";

  return res.status(errorInfo.statusCode).json({
    success: false,
    path: req.originalUrl,
    status: errorInfo.statusCode,
    errorType: errorInfo.errorType,
    message: errorInfo.errorMessage,
  });
};

export default globalErrorHandler;
