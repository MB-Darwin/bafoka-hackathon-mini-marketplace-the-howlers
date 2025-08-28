import express from "express";
import cors from "cors";
import helmet from "helmet";
import compression from "compression";
import pinoHttp from "pino-http";
import { env } from "../configs/env.ts";
import logger from "../utils/logger.ts";
import twilio from "twilio";
import { whatsappRouter } from "../routes/webhook.ts";

const app = express();

app.use(express.urlencoded({ extended: false }));

app.set("trust proxy", true); // behind ngrok/proxies helps with protocol

// Now mount parsers for the rest of your app
app.use(express.json({ limit: "1mb" }));

// logging, security, cors
app.use(pinoHttp({ logger }));
app.use(helmet());
app.use(compression());
app.use(express.urlencoded({ extended: true }));
app.use(
  "/webhook/whatsapp",
  twilio.webhook({
    validate: env.NODE_ENV === "production",
    protocol: "https", // or rely on trust proxy
  }),
  whatsappRouter
);
app.use(
  cors({
    origin: (origin, cb) => {
      if (!origin) return cb(null, true);
      // Only domain/origin, not a path
      const allowed = (env.CORS_ORIGINS ?? "")
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);
      if (allowed.includes(origin)) return cb(null, true);
      return cb(new Error("Not allowed by CORS"));
    },
    credentials: true,
  })
);

// IMPORTANT: Do not mount parsers before Twilio webhook if you want Twilio to validate and parse
// app.use(express.json({ limit: "1mb" })); // move these below
// app.use(express.urlencoded({ extended: true })); // move these below

app.get("/health", (_req, res) => {
  res.json({ status: "ok", env: env.NODE_ENV });
});

app.get("/", (_req, res) => {
  res.json({ message: "Hello from Express!" });
});

/*
app.post(
  "/webhooks/whatsapp",
  // express.urlencoded({ extended: false }),
  twilio.webhook({
    validate: env.NODE_ENV === "production",
    protocol: "https", // or rely on trust proxy
  }),
  async (req: express.Request, res: express.Response) => {
    const whatsAppService = new WhatsAppService();

    const template = await whatsAppService.sendListMessage(
      req.body.From,
      "Test",
      [
        {
          rows: [{ title: "Accept", description: "Accept our terms", id: "1" }],
          title: "test@123",
        },
      ]
    );

    res.json({ message: "Template sent", sid: template.sid });
  }
);*/

// 404 + error handler as you had
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
