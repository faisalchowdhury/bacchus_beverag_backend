import mongoose, { Schema } from "mongoose";
import { IAbout } from "./About.interface";

const AboutSchema = new Schema<IAbout>(
  { description: { type: String, required: true } },
  { timestamps: true },
);

export const AboutModel =
  mongoose.models.About || mongoose.model<IAbout>("About", AboutSchema);
