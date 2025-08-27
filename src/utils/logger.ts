import pino from "pino";
import { env } from "../configs/env.ts";

const isProd = env.NODE_ENV === "production";

const logger = pino({
  level: env.LOG_LEVEL,
  transport: isProd
    ? undefined
    : {
        // Pretty logs in dev
        target: "pino-pretty",
        options: {
          colorize: true,
          translateTime: "SYS:standard",
          ignore: "pid,hostname",
        },
      },
});

export default logger;
