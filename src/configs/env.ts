import { createEnv } from "@t3-oss/env-core";
import { z } from "zod";

export const env = createEnv({
  server: {
    NODE_ENV: z
      .enum(["development", "test", "production"])
      .default("development"),
    PORT: z.coerce.number().int().min(1).max(65535).default(8080),
    LOG_LEVEL: z
      .enum(["fatal", "error", "warn", "info", "debug", "trace", "silent"])
      .default("info"),
    // Comma-separated origins, e.g. "https://myapp.com,https://admin.myapp.com"
    CORS_ORIGINS: z.string().optional(),
  },
  runtimeEnv: process.env,
  emptyStringAsUndefined: true,
  onValidationError: (error) => {
    console.error(
      "Invalid environment variables:",
      error.flatten().fieldErrors
    );
    process.exit(1);
  },
});
