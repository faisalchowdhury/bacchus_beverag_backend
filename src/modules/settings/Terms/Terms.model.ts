import mongoose, { Schema } from "mongoose";
import { ITerms } from "./Terms.interface";

const TermsSchema = new Schema<ITerms>(
  {
    description: { type: String, required: true },
  },
  { timestamps: true },
);

export const TermsModel =
  mongoose.models.Terms || mongoose.model<ITerms>("Terms", TermsSchema);
