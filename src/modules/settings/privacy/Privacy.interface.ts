import { Document } from "mongoose";

export type IPrivacy = {
  description: string;
} & Document;
