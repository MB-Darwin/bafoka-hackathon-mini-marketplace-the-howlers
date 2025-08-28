import e from "express";

export class WhatsAppServiceError extends Error {
  code?: number | string;
  status?: number;
  moreInfo?: string;
  constructor(
    message: string,
    details?: {
      code?: number | string;
      status?: number;
      moreInfo?: string;
      cause?: unknown;
    }
  ) {
    super(message);
    this.name = "WhatsAppServiceError";
    this.code = details?.code;
    this.status = details?.status;
    this.moreInfo = details?.moreInfo;
    if (details?.cause) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (this as any).cause = details.cause;
    }
  }
}

export class BotServiceError extends Error {
  public cause?: unknown;

  constructor(message: string, options?: { cause?: unknown }) {
    super(message);
    this.name = 'BotServiceError';
    if (options?.cause) {
      this.cause = options.cause;
    }
    Error.captureStackTrace?.(this, BotServiceError);
  }
}

class ShopServiceError extends Error {
  public cause?: unknown;

  constructor(message: string, options?: { cause?: unknown }) {
    super(message);
    this.name = 'BotServiceError';
    if (options?.cause) {
      this.cause = options.cause;
    }
    Error.captureStackTrace?.(this, BotServiceError);
  }
}

export { ShopServiceError };

// ...existing error classes...
