import { Router, type IRouter, type Request, type Response } from "express";

import { ai } from "../lib/gemini";
import { logger } from "../lib/logger";

const router: IRouter = Router();

type AnalyzeBody = {
  imageBase64?: string;
  mimeType?: string;
};

const SYSTEM_PROMPT = `You are Skireva's Dermal Engine, a cosmetic chemistry analyzer.
You will receive a photo of a skincare or cosmetic product label.
1. Read every visible ingredient from the label using OCR.
2. Score the formulation for a typical user with a sensitive, mildly compromised skin barrier.
3. Identify each notable ingredient, classify it as Excellent, Strong, Caution, or Avoid, and explain why in one sentence.
4. Produce a verdict (one of: COMPATIBLE, USE WITH CARE, NOT RECOMMENDED) and an integer rating from 0 to 100.
5. Suggest a one-sentence routine integration tip.

Respond with ONLY raw JSON (no markdown fences, no commentary) matching exactly:
{
  "productName": string,
  "rating": integer 0-100,
  "verdict": "COMPATIBLE" | "USE WITH CARE" | "NOT RECOMMENDED",
  "highlights": [
    {
      "label": string,
      "score": "Excellent" | "Strong" | "Caution" | "Avoid",
      "tone": "green" | "cyan" | "amber" | "red",
      "detail": string
    }
  ],
  "routine": string
}

Tone mapping: Excellent->green, Strong->cyan, Caution->amber, Avoid->red.
If the image clearly does not show a product label, return rating 0, verdict "NOT RECOMMENDED",
productName "Unreadable Label", an empty highlights array, and a routine field that politely
instructs the user to retake the photo.`;

function stripFence(text: string): string {
  const trimmed = text.trim();
  if (trimmed.startsWith("```")) {
    return trimmed
      .replace(/^```(?:json)?\s*/i, "")
      .replace(/```\s*$/i, "")
      .trim();
  }
  return trimmed;
}

router.post("/analyze-formulation", async (req: Request, res: Response) => {
  const body = req.body as AnalyzeBody;
  const imageBase64 = body?.imageBase64;
  const mimeType = body?.mimeType ?? "image/jpeg";

  if (!imageBase64 || typeof imageBase64 !== "string") {
    res.status(400).json({ error: "imageBase64 (base64 string) is required" });
    return;
  }

  // Strip a "data:image/...;base64," prefix if the client included it
  const cleanBase64 = imageBase64.replace(/^data:[^;]+;base64,/, "");

  try {
    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents: [
        {
          role: "user",
          parts: [
            { text: SYSTEM_PROMPT },
            {
              inlineData: {
                mimeType,
                data: cleanBase64,
              },
            },
          ],
        },
      ],
      config: {
        responseMimeType: "application/json",
        maxOutputTokens: 8192,
      },
    });

    const text = response.text ?? "";
    if (!text) {
      res.status(502).json({ error: "Empty response from analyzer" });
      return;
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(stripFence(text));
    } catch (parseErr) {
      logger.warn({ parseErr, text }, "Failed to parse analyzer JSON");
      res.status(502).json({
        error: "Analyzer returned non-JSON response",
        raw: text,
      });
      return;
    }

    res.json(parsed);
  } catch (err) {
    logger.error({ err }, "OCR analysis failed");
    const message = err instanceof Error ? err.message : "Unknown error";
    res.status(500).json({ error: message });
  }
});

export default router;
