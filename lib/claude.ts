import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import { DealSchema, type Deal } from "@/lib/schema";

const MODEL = "claude-opus-5-5";
const FALLBACK = {
  betas: ["server-side-fallback-2026-07-01"],
  fallbacks: "default" as const,
};

export class RefusalError extends Error {}

const EXTRACT_SYSTEM = `You are an M&A analyst. Extract deal information from the news article the user provides.
Only use facts stated in the article. If a field is not mentioned, return null (or an empty list) rather than guessing.
If the article covers several deals, extract the main one.`;

const RESEARCH_SYSTEM = `You are an M&A research analyst. The user names an M&A deal. Search the web for it and write a factual research brief covering:
acquirer, target, seller, deal value and currency, announcement date, expected closing date, current status,
financial and legal advisors on each side, regulatory and shareholder approvals required, and key risks.
Prefer press releases and reputable financial news. Say explicitly when something could not be found.
If the name matches several deals, cover the most recent one and mention the ambiguity.`;

export async function extractDeal(client: Anthropic, article: string, source?: string): Promise<Deal> {
  const response = await client.beta.messages.parse({
    model: MODEL,
    max_tokens: 8000,
    ...FALLBACK,
    output_config: { effort: "low", format: betaZodOutputFormat(DealSchema) },
    system: EXTRACT_SYSTEM,
    messages: [
      {
        role: "user",
        content: `<article${source ? ` source="${source}"` : ""}>\n${article}\n</article>`,
      },
    ],
  });
  if (response.stop_reason === "refusal") throw new RefusalError();
  if (!response.parsed_output) throw new Error("Could not extract deal data. Try again.");
  return response.parsed_output;
}

export type Source = { title: string; url: string };

// Searches the web for a deal by name and returns a written brief plus the pages it read.
export async function researchDeal(
  client: Anthropic,
  query: string
): Promise<{ brief: string; sources: Source[] }> {
  const messages: Anthropic.Beta.BetaMessageParam[] = [
    { role: "user", content: `Deal to research: ${query}` },
  ];
  const sources = new Map<string, Source>();
  let brief = "";

  // The server-side search loop can pause on long research; resume up to a few times.
  for (let i = 0; i < 4; i++) {
    const response = await client.beta.messages.create({
      model: MODEL,
      max_tokens: 16000,
      ...FALLBACK,
      output_config: { effort: "low" },
      system: RESEARCH_SYSTEM,
      tools: [{ type: "web_search_20260209", name: "web_search", max_uses: 6 }],
      messages,
    });
    if (response.stop_reason === "refusal") throw new RefusalError();

    for (const block of response.content) {
      if (block.type === "text") brief += block.text;
      if (block.type === "web_search_tool_result" && Array.isArray(block.content)) {
        for (const r of block.content) sources.set(r.url, { title: r.title, url: r.url });
      }
    }
    if (response.stop_reason !== "pause_turn") break;
    messages.push({ role: "assistant", content: response.content });
  }

  if (!brief.trim()) throw new Error("Couldn't find information about that deal. Try a more specific name.");
  return { brief, sources: [...sources.values()] };
}
