// src/services/whatsapp.service.ts
import twilio from "twilio";
import { env } from "../configs/env.ts";
import logger from "../utils/logger.ts";
import { WhatsAppServiceError } from "../middleware/error-handler.ts";

type TwilioClient = ReturnType<typeof twilio>;
type MessageInstance = Awaited<ReturnType<TwilioClient["messages"]["create"]>>;

export interface WhatsAppButton {
  title: string;
  id?: string; // Useful for mapping replies
}

export interface ListRow {
  title: string;
  description?: string;
  id?: string;
}

export interface ListSection {
  title: string;
  rows: ReadonlyArray<ListRow>;
}

export interface SendOptions {
  statusCallbackUrl?: string;
}

export interface IWhatsAppService {
  sendMessage(
    to: string,
    body: string,
    opts?: SendOptions
  ): Promise<MessageInstance>;
  sendButtonMessage(
    to: string,
    text: string,
    buttons: ReadonlyArray<WhatsAppButton>,
    opts?: SendOptions
  ): Promise<MessageInstance>;
  sendListMessage(
    to: string,
    text: string,
    sections: ReadonlyArray<ListSection>,
    opts?: SendOptions
  ): Promise<MessageInstance>;
  sendMediaMessage(
    to: string,
    mediaUrl: string,
    caption?: string,
    opts?: SendOptions
  ): Promise<MessageInstance>;
  sendTemplateMessage<T extends Record<string, unknown>>(
    to: string,
    contentSid: string,
    variables?: T,
    opts?: SendOptions
  ): Promise<MessageInstance>;
}

/**
 * A type-safe WhatsApp service using Twilio.
 */
export class WhatsAppService implements IWhatsAppService {
  private readonly client: TwilioClient;
  private readonly from: string; // whatsapp:+E164

  constructor(opts?: { client?: TwilioClient; fromNumber?: string }) {
    assertString(env.TWILIO_ACCOUNT_ID, "TWILIO_ACCOUNT_SID");
    assertString(env.TWILIO_AUTH_TOKEN, "TWILIO_AUTH_TOKEN");

    const fromNumber = opts?.fromNumber ?? env.TWILIO_WHATSAPP_NUMBER;
    assertString(fromNumber, "TWILIO_WHATSAPP_NUMBER");

    this.client =
      opts?.client ?? twilio(env.TWILIO_ACCOUNT_ID, env.TWILIO_AUTH_TOKEN);
    this.from = ensureWhatsAppAddress(fromNumber);
  }

  // Send plain text message
  async sendMessage(
    to: string,
    body: string,
    opts?: SendOptions
  ): Promise<MessageInstance> {
    const toAddr = ensureWhatsAppAddress(to);
    const msg = ensureNonEmpty(body, "body");

    try {
      const response = await this.client.messages.create({
        from: this.from,
        to: toAddr,
        body: msg,
        statusCallback: opts?.statusCallbackUrl,
      });
      logger.info(`[WhatsApp] Message sent to ${toAddr} sid=${response.sid}`);
      return response;
    } catch (err) {
      const error = toWhatsAppServiceError(err, "sendMessage");
      logger.error(
        `[WhatsApp] Failed to send message to ${toAddr} - ${error.message}`
      );
      throw error;
    }
  }

  // Simulate buttons with enumerated text options
  async sendButtonMessage(
    to: string,
    text: string,
    buttons: ReadonlyArray<WhatsAppButton>,
    opts?: SendOptions
  ): Promise<MessageInstance> {
    if (!Array.isArray(buttons) || buttons.length === 0) {
      throw new WhatsAppServiceError("buttons must be a non-empty array");
    }

    const options = buttons
      .map(
        (b, i) => `${i + 1}. ${ensureNonEmpty(b.title, `buttons[${i}].title`)}`
      )
      .join("\n");
    const message = `${ensureNonEmpty(text, "text")}\n\n${options}\n\nReply with the number of your choice.`;

    return this.sendMessage(to, message, opts);
  }

  // Simulate a list with text sections
  async sendListMessage(
    to: string,
    text: string,
    sections: ReadonlyArray<ListSection>,
    opts?: SendOptions
  ): Promise<MessageInstance> {
    if (!Array.isArray(sections) || sections.length === 0) {
      throw new WhatsAppServiceError("sections must be a non-empty array");
    }

    let msg = `${ensureNonEmpty(text, "text")}\n\n`;
    sections.forEach((section, idx) => {
      assertString(section.title, `sections[${idx}].title`);
      msg += `Section ${idx + 1}: ${section.title}\n`;

      if (!Array.isArray(section.rows) || section.rows.length === 0) {
        throw new WhatsAppServiceError(
          `sections[${idx}].rows must be a non-empty array`
        );
      }

      for (const [idx, section] of sections.entries()) {
        assertString(section.title, `sections[${idx}].title`);
        msg += `Section ${idx + 1}: ${section.title}\n`;

        if (!Array.isArray(section.rows) || section.rows.length === 0) {
          throw new WhatsAppServiceError(
            `sections[${idx}].rows must be a non-empty array`
          );
        }

        for (const [rIdx, row] of section.rows.entries()) {
          assertString(row.title, `sections[${idx}].rows[${rIdx}].title`);
          msg += `- ${row.title}${row.description ? `: ${row.description}` : ""}\n`;
        }
        msg += "\n";
      }
      msg += "\n";
    });

    return this.sendMessage(to, msg, opts);
  }

  // Send a media message (image, pdf, etc.)
  async sendMediaMessage(
    to: string,
    mediaUrl: string,
    caption?: string,
    opts?: SendOptions
  ): Promise<MessageInstance> {
    const toAddr = ensureWhatsAppAddress(to);
    assertString(mediaUrl, "mediaUrl");

    try {
      const response = await this.client.messages.create({
        from: this.from,
        to: toAddr,
        body: caption,
        mediaUrl: [mediaUrl],
        statusCallback: opts?.statusCallbackUrl,
      });
      logger.info(
        `[WhatsApp] Media message sent to ${toAddr} sid=${response.sid}`
      );
      return response;
    } catch (err) {
      const error = toWhatsAppServiceError(err, "sendMediaMessage");
      logger.error(
        `[WhatsApp] Failed to send media message to ${toAddr} - ${error.message}`
      );
      throw error;
    }
  }

  /**
   * Send a WhatsApp template/interactive message via Twilio Content API.
   * Requires a pre-created Content resource (contentSid) in Twilio.
   */
  async sendTemplateMessage<T extends Record<string, unknown>>(
    to: string,
    contentSid: string,
    variables?: T,
    opts?: SendOptions
  ): Promise<MessageInstance> {
    const toAddr = ensureWhatsAppAddress(to);
    assertString(contentSid, "contentSid");

    const contentVariables = variables ? JSON.stringify(variables) : undefined;

    try {
      const response = await this.client.messages.create({
        from: this.from,
        to: toAddr,
        contentSid,
        contentVariables,
        statusCallback: opts?.statusCallbackUrl,
      });
      logger.info(
        `[WhatsApp] Template message sent to ${toAddr} sid=${response.sid}`
      );
      return response;
    } catch (err) {
      const error = toWhatsAppServiceError(err, "sendTemplateMessage");
      logger.error(
        `[WhatsApp] Failed to send template message to ${toAddr} - ${error.message}`
      );
      throw error;
    }
  }
}

/* ------------------------------- helpers ------------------------------- */

function assertString(value: unknown, name: string): asserts value is string {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new WhatsAppServiceError(`Missing or invalid ${name}`);
  }
}

function ensureNonEmpty(value: string, name: string): string {
  assertString(value, name);
  const v = value.trim();
  if (!v) throw new WhatsAppServiceError(`${name} cannot be empty`);
  return v;
}

function normalizeE164(input: string): string {
  let s = String(input).trim();

  if (s.startsWith("whatsapp:")) {
    s = s.slice("whatsapp:".length);
  }

  // Remove common formatting characters
  s = s.replace(/[\s\-().]/g, "");

  // Add + if missing (when digits appear to be E.164 length)
  if (!s.startsWith("+")) {
    if (/^\d{7,15}$/.test(s)) {
      s = `+${s}`;
    } else {
      throw new WhatsAppServiceError(`Invalid phone number format: "${input}"`);
    }
  }

  if (!/^\+[1-9]\d{1,14}$/.test(s)) {
    throw new WhatsAppServiceError(
      `Phone number must be E.164 (e.g. +14155552671). Got "${input}"`
    );
  }

  return s;
}

function ensureWhatsAppAddress(input: string): string {
  const e164 = normalizeE164(input);
  return `whatsapp:${e164}`;
}

function toWhatsAppServiceError(
  err: unknown,
  ctx: string
): WhatsAppServiceError {
  const fallback = new WhatsAppServiceError(`Failed to ${ctx}`, { cause: err });
  if (!err || typeof err !== "object") return fallback;

  const anyErr = err as {
    message?: string;
    code?: number | string;
    status?: number;
    moreInfo?: string;
  };
  return new WhatsAppServiceError(`${anyErr.message ?? fallback.message}`, {
    code: anyErr.code,
    status: anyErr.status,
    moreInfo: anyErr.moreInfo,
    cause: err,
  });
}
