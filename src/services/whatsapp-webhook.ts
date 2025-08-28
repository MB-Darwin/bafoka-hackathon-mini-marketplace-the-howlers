import { Request, Response } from "express";
import { WhatsAppService } from "./whatsapp.service.ts";
import { botService } from "./bot.service.ts"; // your bot logic instance

const whatsappService = new WhatsAppService();

export const twilioWebhookHandler = async (req: Request, res: Response) => {
  try {
    const body = req.body;
    const from = body.From?.replace("whatsapp:", "");
    const text = body.Body;

    if (!from || !text) {
      return res.status(400).send("Missing from or body");
    }

    // Pass message to bot logic
    await botService.processIncomingMessage({
      from,
      text,
      raw: body,
    });

    // Respond to Twilio
    res.setHeader("Content-Type", "text/xml");
    res.send("<Response></Response>");
  } catch (err) {
    console.error("Webhook error:", err);
    res.status(500).send("<Response></Response>");
  }
};
