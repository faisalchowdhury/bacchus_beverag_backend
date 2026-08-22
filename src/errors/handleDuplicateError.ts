import mongoose from "mongoose";
import { IErrorResponse } from "../interface/error";

const handlerDuplicateError = (
  err: mongoose.Error.ValidationError,
): IErrorResponse => {
  const regex = /"(.*?)"/;
  const matches = err.message.match(regex);
  return {
    success: false,
    statusCode: 409,
    errorType: "Duplicate Error",
    errorMessage: `${matches![1]} is already exists!`,
    errorDetails: { err },
  };
};

export default handlerDuplicateError;
