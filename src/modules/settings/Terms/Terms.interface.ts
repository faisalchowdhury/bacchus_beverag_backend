import { Document } from "mongoose";

export type ITerms = {
  description: string;
} & Document;
