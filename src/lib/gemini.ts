import { GoogleGenAI } from "@google/genai";

const baseUrl = process.env["AI_INTEGRATIONS_GEMINI_BASE_URL"];
const apiKey = process.env["AI_INTEGRATIONS_GEMINI_API_KEY"];

if (!baseUrl || !apiKey) {
  throw new Error(
    "Missing AI_INTEGRATIONS_GEMINI_BASE_URL or AI_INTEGRATIONS_GEMINI_API_KEY",
  );
}

export const ai = new GoogleGenAI({
  apiKey,
  httpOptions: { apiVersion: "", baseUrl },
});
