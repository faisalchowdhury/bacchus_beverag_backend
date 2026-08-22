import { Document } from "mongoose";

export type IAbout = {
  description: string;
} & Document;
