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
