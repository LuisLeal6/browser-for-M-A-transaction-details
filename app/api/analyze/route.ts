import Anthropic from "@anthropic-ai/sdk";
import { fetchArticleText } from "@/lib/fetchArticle";
import { extractDeal, researchDeal, RefusalError, type Source } from "@/lib/claude";

export const runtime = "nodejs";
export const maxDuration = 120;

export async function POST(req: Request) {
  if (!process.env.ANTHROPIC_API_KEY) {
    return Response.json(
      { error: "Server is missing ANTHROPIC_API_KEY. Add it in Vercel → Settings → Environment Variables." },
      { status: 500 }
    );
  }

  let body: { text?: string; url?: string; query?: string };
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "Invalid request body" }, { status: 400 });
  }

  const text = (body.text ?? "").trim();
  const url = (body.url ?? "").trim();
  const query = (body.query ?? "").trim();
  if (!text && !url && !query) {
    return Response.json({ error: "Paste an article, a URL, or name a deal" }, { status: 400 });
  }

  const client = new Anthropic(); // reads ANTHROPIC_API_KEY
  try {
    if (query) {
      const { brief, sources } = await researchDeal(client, query);
      const deal = await extractDeal(client, brief, "web research");
      return Response.json({ deal, sources });
    }

    let article = text;
    let sources: Source[] = [];
    if (!article) {
      try {
        article = await fetchArticleText(url);
      } catch (e) {
        return Response.json(
          { error: (e as Error).message, linkFailed: true },
          { status: 422 }
        );
      }
      sources = [{ title: url, url }];
    }
    const deal = await extractDeal(client, article, url || undefined);
    return Response.json({ deal, sources });
  } catch (e) {
    if (e instanceof RefusalError) {
      return Response.json({ error: "The model declined to analyse this request." }, { status: 422 });
    }
    if (e instanceof Anthropic.RateLimitError) {
      return Response.json({ error: "Rate limited — try again in a moment." }, { status: 429 });
    }
    if (e instanceof Anthropic.AuthenticationError) {
      return Response.json({ error: "ANTHROPIC_API_KEY is missing or invalid." }, { status: 500 });
    }
    if (e instanceof Anthropic.APIError) {
      return Response.json({ error: `Claude API error: ${e.message}` }, { status: 502 });
    }
    if (e instanceof Error) {
      return Response.json({ error: e.message }, { status: 502 });
    }
    throw e;
  }
}
