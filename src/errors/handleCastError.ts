import mongoose from "mongoose";
import { IErrorResponse } from "../interface/error";

const handlerCastError = (err: mongoose.Error.CastError): IErrorResponse => {
  return {
    success: false,
    statusCode: 400,
    errorType: "Invalid Id",
    errorMessage: `${err.value} is not a valid ID!`,
    errorDetails: { ...err },
  };
};

export default handlerCastError;
