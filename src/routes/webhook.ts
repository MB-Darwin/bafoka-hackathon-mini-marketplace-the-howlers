// src/routes/whatsapp.routes.ts
import { Router } from "express";
import { botService } from "../services/bot.service";

export const whatsappRouter = Router();

// Twilio webhook POST endpoint
whatsappRouter.post("/", async (req, res) => {
  try {
    console.log("Incoming body:", req.body); // DEBUG
    const from = req.body.From;
    if (!from) throw new Error("Missing From in webhook body");

    await botService.processIncomingMessage(req.body);

    res.status(200).send("OK");
  } catch (err) {
    console.error("Error processing incoming message:", err);
    res.status(500).send("Error processing message");
  }
});
