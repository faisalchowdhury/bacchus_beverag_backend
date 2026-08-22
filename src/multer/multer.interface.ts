export type MulterFile = {
  fieldname: string;
  originalname: string;
  encoding: string;
  mimetype: string;
  size: number;
  destination: string;
  filename: string;
  path: string;
};

// Define an interface for the expected shape of req.files.
export type MulterFiles = {
  coverPhoto?: MulterFile[];
  photos?: MulterFile[];
};
