import { ApiError, GoogleGenAI } from "@google/genai";
import { z } from "zod";
import { DealSchema, type Deal } from "@/lib/schema";

// "gemini-flash-latest" always points at Google's current Flash model (free tier).
// Override with the GEMINI_MODEL env var if Google renames it.
const MODEL = process.env.GEMINI_MODEL || "gemini-flash-latest";

// Drop the "$schema" meta key; Gemini only needs the schema body.
const { $schema: _meta, ...DEAL_JSON_SCHEMA } = z.toJSONSchema(DealSchema);

const EXTRACT_SYSTEM = `You are an M&A analyst. Extract deal information from the news article the user provides.
Only use facts stated in the article. If a field is not mentioned, return null (or an empty list) rather than guessing.
If the article covers several deals, extract the main one.`;

const RESEARCH_SYSTEM = `You are an M&A research analyst. The user names an M&A deal. Search the web for it and write a factual research brief covering:
acquirer, target, seller, deal value and currency, announcement date, expected closing date, current status,
financial and legal advisors on each side, regulatory and shareholder approvals required, and key risks.
Prefer press releases and reputable financial news. Say explicitly when something could not be found.
If the name matches several deals, cover the most recent one and mention the ambiguity.`;

export type Source = { title: string; url: string };

export function createClient() {
  return new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
}

export async function extractDeal(ai: GoogleGenAI, article: string, source?: string): Promise<Deal> {
  const response = await ai.models.generateContent({
    model: MODEL,
    contents: `<article${source ? ` source="${source}"` : ""}>\n${article}\n</article>`,
    config: {
      systemInstruction: EXTRACT_SYSTEM,
      responseMimeType: "application/json",
      responseJsonSchema: DEAL_JSON_SCHEMA,
    },
  });

  let json: unknown;
  try {
    json = JSON.parse(response.text ?? "");
  } catch {
    throw new Error("Could not extract deal data. Try again.");
  }
  const parsed = DealSchema.safeParse(json);
  if (!parsed.success) throw new Error("Could not extract deal data. Try again.");
  return parsed.data;
}

// Searches Google for a deal by name and returns a written brief plus the pages it used.
export async function researchDeal(
  ai: GoogleGenAI,
  query: string
): Promise<{ brief: string; sources: Source[] }> {
  const response = await ai.models.generateContent({
    model: MODEL,
    contents: `Deal to research: ${query}`,
    config: {
      systemInstruction: RESEARCH_SYSTEM,
      tools: [{ googleSearch: {} }],
    },
  });

  const brief = response.text ?? "";
  if (!brief.trim()) throw new Error("Couldn't find information about that deal. Try a more specific name.");

  const sources = new Map<string, Source>();
  for (const chunk of response.candidates?.[0]?.groundingMetadata?.groundingChunks ?? []) {
    if (chunk.web?.uri) sources.set(chunk.web.uri, { title: chunk.web.title ?? chunk.web.uri, url: chunk.web.uri });
  }
  return { brief, sources: [...sources.values()] };
}

export function describeApiError(e: unknown): { message: string; status: number } | null {
  if (!(e instanceof ApiError)) return null;
  if (e.status === 429) {
    return { message: "Free-tier limit reached — wait a minute (or until tomorrow for the daily limit) and try again.", status: 429 };
  }
  if (e.status === 400 && /api key/i.test(e.message)) {
    return { message: "GEMINI_API_KEY is invalid.", status: 500 };
  }
  if (e.status === 403) {
    return { message: "GEMINI_API_KEY is invalid or not allowed to use this model.", status: 500 };
  }
  if (e.status === 404) {
    return { message: `Model "${MODEL}" not found. Set GEMINI_MODEL in Vercel to a current Gemini Flash model.`, status: 500 };
  }
  return { message: `Gemini API error: ${e.message}`, status: 502 };
}
