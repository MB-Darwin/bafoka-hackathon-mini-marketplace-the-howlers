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
  sendNumberedMenu(
    to: string,
    title: string,
    options: ReadonlyArray<string>,
    footer?: string,
    opts?: SendOptions
  ): Promise<MessageInstance>;
}

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
        to,
        body,
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

  /**
   * Sends a button message formatted as a numbered menu for easy text input
   * This method now creates numbered options instead of interactive buttons
   */
  async sendButtonMessage(
    to: string,
    text: string,
    buttons: ReadonlyArray<WhatsAppButton>,
    opts?: SendOptions
  ): Promise<MessageInstance> {
    if (!Array.isArray(buttons) || buttons.length === 0) {
      throw new WhatsAppServiceError("buttons must be a non-empty array");
    }

    if (buttons.length > 9) {
      throw new WhatsAppServiceError(
        "Maximum 9 buttons supported for numbered menu"
      );
    }

    // Create numbered options from buttons
    const options = buttons
      .map((button, index) => {
        const title = ensureNonEmpty(button.title, `buttons[${index}].title`);
        const number = `${index + 1}️⃣`;
        return `${number} ${title}`;
      })
      .join("\n");

    // Add zero option for going back (common pattern)
    const backOption = "0️⃣ 🏠 Main Menu";

    // Format the complete message
    const message = [
      ensureNonEmpty(text, "text"),
      "",
      options,
      backOption,
      "",
      "Reply with the number of your choice.",
    ].join("\n");

    return this.sendMessage(to, message, opts);
  }

  /**
   * New method specifically for creating numbered menus with custom options
   */
  async sendNumberedMenu(
    to: string,
    title: string,
    options: ReadonlyArray<string>,
    footer?: string,
    opts?: SendOptions
  ): Promise<MessageInstance> {
    if (!Array.isArray(options) || options.length === 0) {
      throw new WhatsAppServiceError("options must be a non-empty array");
    }

    if (options.length > 9) {
      throw new WhatsAppServiceError(
        "Maximum 9 options supported for numbered menu"
      );
    }

    // Create numbered options
    const numberedOptions = options
      .map((option, index) => {
        const cleanOption = ensureNonEmpty(option, `options[${index}]`);
        return `${index + 1}️⃣ ${cleanOption}`;
      })
      .join("\n");

    // Build message parts
    const messageParts = [ensureNonEmpty(title, "title"), "", numberedOptions];

    // Add footer if provided
    if (footer) {
      messageParts.push("", footer);
    } else {
      messageParts.push("", "Reply with the number of your choice.");
    }

    const message = messageParts.join("\n");
    return this.sendMessage(to, message, opts);
  }

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

    sections.forEach((section: ListSection, sIdx: number) => {
      assertString(section.title, `sections[${sIdx}].title`);

      // Format section title with emoji
      msg += `📋 *${section.title}*\n`;

      if (!Array.isArray(section.rows) || section.rows.length === 0) {
        throw new WhatsAppServiceError(
          `sections[${sIdx}].rows must be a non-empty array`
        );
      }

      section.rows.forEach((row: ListRow, rIdx: number) => {
        assertString(row.title, `sections[${sIdx}].rows[${rIdx}].title`);
        // Use bullet points for list items
        msg += `• *${row.title}*${row.description ? `\n  ${row.description}` : ""}\n`;
      });

      msg += "\n"; // Add spacing between sections
    });

    // Add instruction for user interaction
    msg += "Reply with your selection or type the option name.";

    return this.sendMessage(to, msg, opts);
  }

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

  /**
   * Utility method for sending formatted error messages
   */
  async sendErrorMessage(
    to: string,
    errorText: string,
    includeHelp: boolean = true,
    opts?: SendOptions
  ): Promise<MessageInstance> {
    let message = `❌ ${errorText}`;

    if (includeHelp) {
      message += "\n\nType '0' for main menu or 'help' for assistance.";
    }

    return this.sendMessage(to, message, opts);
  }

  /**
   * Utility method for sending success messages
   */
  async sendSuccessMessage(
    to: string,
    successText: string,
    nextStep?: string,
    opts?: SendOptions
  ): Promise<MessageInstance> {
    let message = `✅ ${successText}`;

    if (nextStep) {
      message += `\n\n${nextStep}`;
    }

    return this.sendMessage(to, message, opts);
  }

  /**
   * Utility method for sending loading/processing messages
   */
  async sendProcessingMessage(
    to: string,
    action: string = "processing your request",
    opts?: SendOptions
  ): Promise<MessageInstance> {
    const message = `⏳ Please wait, ${action}...`;
    return this.sendMessage(to, message, opts);
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

  if (s.startsWith("whatsapp:")) s = s.slice("whatsapp:".length);

  s = s.replace(/[\s\-().]/g, "");

  if (!s.startsWith("+")) {
    if (/^\d{7,15}$/.test(s)) s = `+${s}`;
    else
      throw new WhatsAppServiceError(`Invalid phone number format: "${input}"`);
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

export default WhatsAppService;
