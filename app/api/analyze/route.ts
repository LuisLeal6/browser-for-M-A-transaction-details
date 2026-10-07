import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import { DealSchema } from "@/lib/schema";
import { fetchArticleText } from "@/lib/fetchArticle";

export const runtime = "nodejs";
export const maxDuration = 60;

const SYSTEM = `You are an M&A analyst. Extract deal information from the news article the user provides.
Only use facts stated in the article. If a field is not mentioned, return null (or an empty list) rather than guessing.
If the article covers several deals, extract the main one.`;

export async function POST(req: Request) {
  if (!process.env.ANTHROPIC_API_KEY) {
    return Response.json(
      { error: "Server is missing ANTHROPIC_API_KEY. Add it in Vercel → Settings → Environment Variables." },
      { status: 500 }
    );
  }

  let body: { text?: string; url?: string };
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "Invalid request body" }, { status: 400 });
  }

  const input = (body.text ?? "").trim();
  const url = (body.url ?? "").trim();
  if (!input && !url) {
    return Response.json({ error: "Paste an article or a URL" }, { status: 400 });
  }

  let article = input;
  if (!article) {
    try {
      article = await fetchArticleText(url);
    } catch (e) {
      return Response.json({ error: (e as Error).message }, { status: 422 });
    }
  }

  try {
    const client = new Anthropic(); // reads ANTHROPIC_API_KEY
    const response = await client.beta.messages.parse({
      model: "claude-opus-5-5",
      max_tokens: 8000,
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      output_config: { effort: "low", format: betaZodOutputFormat(DealSchema) },
      system: SYSTEM,
      messages: [
        {
          role: "user",
          content: `<article${url ? ` source="${url}"` : ""}>\n${article}\n</article>`,
        },
      ],
    });

    if (response.stop_reason === "refusal") {
      return Response.json({ error: "The model declined to analyse this article." }, { status: 422 });
    }
    if (!response.parsed_output) {
      return Response.json({ error: "Could not extract deal data. Try again." }, { status: 502 });
    }
    return Response.json({ deal: response.parsed_output });
  } catch (e) {
    if (e instanceof Anthropic.RateLimitError) {
      return Response.json({ error: "Rate limited — try again in a moment." }, { status: 429 });
    }
    if (e instanceof Anthropic.AuthenticationError) {
      return Response.json({ error: "ANTHROPIC_API_KEY is missing or invalid." }, { status: 500 });
    }
    if (e instanceof Anthropic.APIError) {
      return Response.json({ error: `Claude API error: ${e.message}` }, { status: 502 });
    }
    throw e;
  }
}
