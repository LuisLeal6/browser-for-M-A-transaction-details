# M&A Deal Browser

Paste a news article (or its URL) about an M&A deal — or just type the deal's
name — and get the key details: core deal terms, advisors & approvals, key
risks and a short summary. Past analyses are kept in your browser's history.

If a link can't be opened (paywall, bot protection), the page offers to search
the web for the deal instead, pre-filling a guess from the link.

## Deploy to Vercel

1. Import this repo in Vercel (framework preset: Next.js).
2. Get a free Gemini API key at https://aistudio.google.com/apikey
   (no credit card needed).
3. Add an environment variable `GEMINI_API_KEY` with that key.
4. Deploy.

Optional: set `GEMINI_MODEL` to pick a specific model (default:
`gemini-flash-latest`, Google's current free-tier Flash model).

The free tier has daily request limits, which are plenty for a class project;
if you hit one, the page tells you to wait and retry.

## Run locally

```bash
npm install
echo "GEMINI_API_KEY=your-key" > .env.local
npm run dev
```
