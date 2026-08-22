import mongoose, { Schema } from "mongoose";
import { IPrivacy } from "./Privacy.interface";

const PrivacySchema = new Schema<IPrivacy>(
  {
    description: { type: String, required: true },
  },
  { timestamps: true },
);

export const PrivacyModel =
  mongoose.models.Privacy || mongoose.model<IPrivacy>("Privacy", PrivacySchema);
