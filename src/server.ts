// src/server.ts
import express from "express";
import type { Request, Response, Application } from "express";
import dotenv from "dotenv";


// Load environment variables
dotenv.config();

const app: Application = express();
const PORT = process.env['PORT'] || 5000;

// Middleware

// Health check route
app.get("/", (_: Request, res: Response) => {
  res.status(200).json({ message: "WhatsApp Marketplace API is running 🚀" });
});

// Routes

// Error handling middleware


// Start server
app.listen(PORT, () => {
  console.log(`🚀 Server running on http://localhost:${PORT}`);
});
