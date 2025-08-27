import "dotenv/config"; // load .env before reading env
import http from "node:http";
import { env } from "./configs/env.ts";
import logger from "./utils/logger.ts";
import app from "./core/app.ts";

const server = http.createServer(app);

server.listen(env.PORT, () => {
  logger.info({ port: env.PORT, env: env.NODE_ENV }, "🚀 Server started");
});

// Safety nets
process.on("unhandledRejection", (reason) => {
  logger.error({ reason }, "Unhandled Rejection");
});
process.on("uncaughtException", (err) => {
  logger.fatal({ err }, "Uncaught Exception");
  process.exit(1);
});

// Graceful shutdown
const shutdown = (signal: string) => {
  logger.info({ signal }, "Shutting down…");
  server.close(() => {
    logger.info("HTTP server closed");
    process.exit(0);
  });
  setTimeout(() => {
    logger.warn("Force exit after 10s");
    process.exit(1);
  }, 10_000).unref();
};

["SIGINT", "SIGTERM"].forEach((sig) => {
  process.on(sig, () => shutdown(sig));
});
