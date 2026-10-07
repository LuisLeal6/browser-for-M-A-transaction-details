// Fetches a news page and reduces it to readable text for the model.
export async function fetchArticleText(url: string): Promise<string> {
  const parsed = new URL(url);
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new Error("Only http(s) URLs are supported");
  }

  const res = await fetch(parsed, {
    headers: {
      "User-Agent":
        "Mozilla/5.0 (compatible; MADealBrowser/1.0; +https://vercel.com)",
      Accept: "text/html,application/xhtml+xml",
    },
    signal: AbortSignal.timeout(15_000),
  });
  if (!res.ok) throw new Error(`Could not fetch the article (HTTP ${res.status})`);

  const html = await res.text();
  const text = html
    .replace(/<(script|style|noscript|svg|nav|footer|header|aside)[\s\S]*?<\/\1>/gi, " ")
    .replace(/<br\s*\/?>|<\/(p|div|h[1-6]|li)>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&rsquo;|&lsquo;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/[ \t]+/g, " ")
    .replace(/\n\s*\n+/g, "\n\n")
    .trim();

  if (text.length < 200) {
    throw new Error(
      "Couldn't read enough text from that page (it may be paywalled). Paste the article text instead."
    );
  }
  return text;
}
