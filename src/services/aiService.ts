// AI card scan via Google Gemini 1.5 Flash.
// Accepts base64-encoded front (+ optional back) image.
// Returns structured card fields ready to pre-fill the add-card form.

import { GoogleGenerativeAI, Part } from "@google/generative-ai";
import { z } from "zod";
import { logger } from "../logger/index.js";

const SCAN_PROMPT = `You are a trading card expert. Analyse the card image(s) and extract the following fields as a JSON object. Use null for any field you cannot determine with confidence.

Return ONLY valid JSON — no markdown, no explanation.

{
  "name": "Player or character name on the card",
  "category": "one of: pokemon | soccer | basketball | football | other",
  "player": "athlete name (null for Pokemon)",
  "team": "team name (null for Pokemon)",
  "year": integer year or null,
  "setName": "card set / expansion name",
  "cardNumber": "card number as printed (e.g. 025/102)",
  "parallel": "parallel or variant name if visible, else null",
  "serialNumber": "serial number if the card is numbered (e.g. 047/100), else null",
  "isRookie": boolean,
  "isAutographed": boolean,
  "isPatch": boolean,
  "isGraded": boolean,
  "gradeCompany": "PSA | BGS | CGC | SGC | null",
  "gradeValue": number or null (e.g. 10, 9.5),
  "certNumber": "cert number from grading label, else null",
  "condition": "one of: poor | fair | good | very_good | excellent | near_mint | mint | gem_mint | null"
}

If two images are provided, the first is the front and the second is the back.
The cert number is usually printed on the grading slab label (often on the back).`;

export const scanCardSchema = z.object({
  frontImage: z.object({
    data:     z.string().min(1),   // base64
    mimeType: z.string().default("image/jpeg"),
  }),
  backImage: z.object({
    data:     z.string().min(1),
    mimeType: z.string().default("image/jpeg"),
  }).optional(),
});

export type ScanCardInput = z.infer<typeof scanCardSchema>;

export interface ScanResult {
  name:          string | null;
  category:      string | null;
  player:        string | null;
  team:          string | null;
  year:          number | null;
  setName:       string | null;
  cardNumber:    string | null;
  parallel:      string | null;
  serialNumber:  string | null;
  isRookie:      boolean;
  isAutographed: boolean;
  isPatch:       boolean;
  isGraded:      boolean;
  gradeCompany:  string | null;
  gradeValue:    number | null;
  certNumber:    string | null;
  condition:     string | null;
}

export async function scanCard(input: ScanCardInput): Promise<ScanResult> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error("GEMINI_API_KEY not set");

  const genAI = new GoogleGenerativeAI(apiKey);
  const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });

  const parts: Part[] = [
    { text: SCAN_PROMPT },
    { inlineData: { data: input.frontImage.data, mimeType: input.frontImage.mimeType } },
  ];

  if (input.backImage) {
    parts.push({ inlineData: { data: input.backImage.data, mimeType: input.backImage.mimeType } });
  }

  const result = await model.generateContent({ contents: [{ role: "user", parts }] });
  const text   = result.response.text().trim();

  // Strip markdown code fences if model wraps output
  const json = text.replace(/^```(?:json)?\n?/, "").replace(/\n?```$/, "").trim();

  let parsed: ScanResult;
  try {
    parsed = JSON.parse(json);
  } catch {
    logger.warn({ raw: text }, "Gemini returned non-JSON — attempting extraction");
    throw new Error("AI scan returned unparseable response");
  }

  // Normalise booleans defensively
  parsed.isRookie      = Boolean(parsed.isRookie);
  parsed.isAutographed = Boolean(parsed.isAutographed);
  parsed.isPatch       = Boolean(parsed.isPatch);
  parsed.isGraded      = Boolean(parsed.isGraded);

  return parsed;
}
