import { Request, Response } from "express";

const notFound = (req: Request, res: Response) => {
  res.status(404).json({
    status: "fail",
    statusCode: 404,
    message: `Route Not Found for ${req.originalUrl}`,
  });
};

export default notFound;
