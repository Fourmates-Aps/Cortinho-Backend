import pino from "pino";
import { env } from "../config/env.js";

export const logger = pino({
  level: env.NODE_ENV === "production" ? "info" : "debug",
  ...(env.NODE_ENV !== "production" && {
    transport: { target: "pino-pretty", options: { colorize: true, ignore: "pid,hostname" } },
  }),
  base: { service: "cortinho-api" },
  serializers: {
    req: (req) => ({ method: req.method, url: req.url, requestId: req.id }),
    res: (res) => ({ statusCode: res.statusCode }),
    err: pino.stdSerializers.err,
  },
});
