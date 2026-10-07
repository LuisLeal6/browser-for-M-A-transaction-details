import { ApiError, GoogleGenAI, type GenerateContentParameters, type GenerateContentResponse } from "@google/genai";
import { z } from "zod";
import { DealSchema, type Deal } from "@/lib/schema";

// "gemini-flash-latest" always points at Google's current Flash model (free tier).
// Override with the GEMINI_MODEL env var if Google renames it.
const MODEL = process.env.GEMINI_MODEL || "gemini-flash-latest";
// Lighter model to fall back to when the main one is overloaded or out of quota.
const FALLBACK_MODEL = process.env.GEMINI_FALLBACK_MODEL || "gemini-flash-lite-latest";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const isBusy = (e: unknown) => e instanceof ApiError && (e.status === 503 || e.status === 500);
const isOutOfQuota = (e: unknown) => e instanceof ApiError && e.status === 429;

export class TimeoutError extends Error {
  constructor() {
    super("Gemini took too long to answer (the free models may be busy). Please try again.");
  }
}

// Wall-clock budget for one request. Vercel kills functions at maxDuration (60s), so we
// stop retrying well before that and return a proper error instead.
export class Deadline {
  private readonly end: number;
  constructor(ms: number) {
    this.end = Date.now() + ms;
  }
  remaining() {
    return this.end - Date.now();
  }
}

const MIN_CALL_MS = 8_000; // don't start a call with less time than this left

// Free-tier models are often briefly overloaded (503). Retry the main model a couple of
// times, then try the fallback model, all within the request's deadline.
async function generate(
  ai: GoogleGenAI,
  deadline: Deadline,
  params: Omit<GenerateContentParameters, "model">
): Promise<GenerateContentResponse> {
  const models = [...new Set([MODEL, FALLBACK_MODEL])];
  let lastError: unknown = new TimeoutError();
  for (const model of models) {
    for (let attempt = 0; attempt < 3; attempt++) {
      if (deadline.remaining() < MIN_CALL_MS) throw lastError;
      try {
        return await ai.models.generateContent({
          ...params,
          model,
          config: { ...params.config, abortSignal: AbortSignal.timeout(deadline.remaining() - 1_000) },
        });
      } catch (e) {
        if (e instanceof Error && (e.name === "AbortError" || e.name === "TimeoutError")) {
          throw new TimeoutError();
        }
        lastError = e;
        if (isOutOfQuota(e)) break; // this model's quota is used up; try the next one
        if (!isBusy(e)) throw e;
        if (attempt < 2) await sleep(1000 * 2 ** attempt + Math.random() * 500);
      }
    }
  }
  throw lastError;
}

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

export async function extractDeal(
  ai: GoogleGenAI,
  deadline: Deadline,
  article: string,
  source?: string
): Promise<Deal> {
  const response = await generate(ai, deadline, {
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
  deadline: Deadline,
  query: string
): Promise<{ brief: string; sources: Source[] }> {
  const response = await generate(ai, deadline, {
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
  if (e.status === 503 || e.status === 500) {
    return { message: "Google's free Gemini models are busy right now. Please try again in a minute.", status: 503 };
  }
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
