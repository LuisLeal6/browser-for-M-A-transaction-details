import { fetchArticleText } from "@/lib/fetchArticle";
import {
  createClient,
  Deadline,
  describeApiError,
  extractDeal,
  researchDeal,
  TimeoutError,
  type Source,
} from "@/lib/ai";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(req: Request) {
  if (!process.env.GEMINI_API_KEY) {
    return Response.json(
      { error: "Server is missing GEMINI_API_KEY. Add it in Vercel → Settings → Environment Variables." },
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

  const ai = createClient();
  const deadline = new Deadline(50_000); // leaves headroom under maxDuration
  try {
    if (query) {
      const { brief, sources } = await researchDeal(ai, deadline, query);
      const deal = await extractDeal(ai, deadline, brief, "web research");
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
    const deal = await extractDeal(ai, deadline, article, url || undefined);
    return Response.json({ deal, sources });
  } catch (e) {
    if (e instanceof TimeoutError) return Response.json({ error: e.message }, { status: 504 });
    const apiError = describeApiError(e);
    if (apiError) return Response.json({ error: apiError.message }, { status: apiError.status });
    if (e instanceof Error) return Response.json({ error: e.message }, { status: 502 });
    throw e;
  }
}
