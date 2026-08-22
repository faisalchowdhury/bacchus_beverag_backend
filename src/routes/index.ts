import express from "express";
import { routesConfig } from "./routesConfig";

const router = express.Router();
const apiPath = "/api/v1";

routesConfig.forEach(({ path, handler }) =>
  router.use(`${apiPath}/${path}`, handler),
);

export default router;
