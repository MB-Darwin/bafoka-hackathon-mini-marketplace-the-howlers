import express from "express";
import cors from "cors";
import helmet from "helmet";
import compression from "compression";
import pinoHttp from "pino-http";
import { env } from "../configs/env.ts";
import logger from "../utils/logger.ts";

const app = express();

// CORS allowlist
const allowedOrigins =
  env.CORS_ORIGINS?.split(",")
    .map((s) => s.trim())
    .filter(Boolean) ??
  (env.NODE_ENV === "development"
    ? ["http://localhost:3000", "http://localhost:5173"]
    : []);

app.use(
  pinoHttp({
    logger,
    // You can customize log level per response if you want:
    // customLogLevel: (req, res, err) => (err || res.statusCode >= 500 ? "error" : res.statusCode >= 400 ? "warn" : "info"),
  })
);

// Security + perf middlewares
app.use(helmet());
app.use(compression());

// CORS
app.use(
  cors({
    origin: (origin, cb) => {
      if (!origin) return cb(null, true); // allow server-to-server or curl
      if (allowedOrigins.includes(origin)) return cb(null, true);
      return cb(new Error("Not allowed by CORS"));
    },
    credentials: true,
  })
);

// Body parsing
app.use(express.json({ limit: "1mb" }));

// Routes
app.get("/health", (_req, res) => {
  res.json({ status: "ok", env: env.NODE_ENV });
});

app.get("/", (_req, res) => {
  res.json({ message: "Hello from Express!" });
});

// 404
app.use((_req, res) => {
  res.status(404).json({ error: "Not Found" });
});

// Error handler
// eslint-disable-next-line @typescript-eslint/no-unused-vars
app.use(
  (
    err: unknown,
    _req: express.Request,
    res: express.Response,
    _next: express.NextFunction
  ) => {
    logger.error({ err }, "Unhandled error");
    res.status(500).json({ error: "Internal Server Error" });
  }
);

export default app;
