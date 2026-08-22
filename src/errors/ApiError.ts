/**
 * Error type the app throws deliberately. `globalErrorHandler` turns it into
 * the JSON response using `statusCode` and `message`.
 *
 *   throw new ApiError(httpStatus.NOT_FOUND, "User not found.");
 */
class ApiError extends Error {
  public statusCode: number;
  public isOperational: boolean;
  public errorDetails?: { path?: string | null; value?: any };

  constructor(
    statusCode: number,
    message: string,
    errorDetails?: { path?: string | null; value?: any },
    isOperational = true,
  ) {
    super(message);
    this.statusCode = statusCode;
    this.isOperational = isOperational;
    this.errorDetails = errorDetails || { path: null, value: null };

    // Stack traces are intentionally dropped — these are expected, handled
    // errors, and the handler never leaks them to the client anyway.
    Object.defineProperty(this, "stack", { value: undefined });
  }
}

export default ApiError;
