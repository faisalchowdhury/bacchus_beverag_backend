export type IErrorResponse = {
  success: false;
  errorType: string;
  errorMessage: string;
  statusCode: number;
  errorDetails: Record<string, unknown>;
};
