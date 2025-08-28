import { createEnv } from "@t3-oss/env-core";
import { z } from "zod";

export const env = createEnv({
  server: {
    NODE_ENV: z.enum(["development", "test", "production"]),
    PORT: z.coerce.number().int().min(1).max(65535).default(8080),
    LOG_LEVEL: z
      .enum(["fatal", "error", "warn", "info", "debug", "trace", "silent"])
      .default("info"),
    // Comma-separated origins, e.g. "https://myapp.com,https://admin.myapp.com"
    CORS_ORIGINS: z.string().optional(),
    SUPABASE_URL: z.url(),
    SUPABASE_KEY: z.string(),
    TWILIO_ACCOUNT_ID: z.string(),
    TWILIO_AUTH_TOKEN: z.string(),
    TWILIO_WHATSAPP_NUMBER: z.string(),
    TWILIO_CONTENT_SID: z.string().optional(),
  },
  runtimeEnv: process.env,
  emptyStringAsUndefined: true,
});
