import mongoose from "mongoose";
import { IErrorResponse } from "../interface/error";

const handleValidationError = (
  err: mongoose.Error.ValidationError,
): IErrorResponse => {
  const errorMessageArray = Object.values(err.errors).map(
    (val: mongoose.Error.ValidatorError | mongoose.Error.CastError) =>
      val?.path + (val.name === "CastError" ? " will be " : " is ") + val.kind,
  );

  return {
    success: false,
    statusCode: 400,
    errorType: "Validation Error",
    errorMessage: errorMessageArray.join(". "),
    errorDetails: { ...err },
  };
};

export default handleValidationError;
