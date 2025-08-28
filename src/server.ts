// src/server.ts
import "dotenv/config";
import express from "express";
import http from "node:http";
import logger from "./utils/logger";
import { env } from "./configs/env";

import app  from "./core/app.ts";
// WhatsApp webhook route

const server = http.createServer(app);

server.listen(env.PORT, () => {
  logger.info({ port: env.PORT, env: env.NODE_ENV }, "🚀 Server started");
});

// Graceful shutdown
const shutdown = (signal: string) => {
  logger.info({ signal }, "Shutting down…");
  server.close(() => process.exit(0));
};
["SIGINT", "SIGTERM"].forEach(sig => process.on(sig, () => shutdown(sig)));
