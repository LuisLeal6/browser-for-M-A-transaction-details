# M&A Deal Browser

Paste a news article (or its URL) about an M&A deal — or just type the deal's
name — and get the key details: core deal terms, advisors & approvals, key
risks and a short summary. Past analyses are kept in your browser's history.

If a link can't be opened (paywall, bot protection), the page offers to search
the web for the deal instead, pre-filling a guess from the link.

## Deploy to Vercel

1. Import this repo in Vercel (framework preset: Next.js).
2. Add an environment variable `ANTHROPIC_API_KEY` (from console.anthropic.com).
3. Make sure web search is enabled for your org in the Anthropic Console
   (needed for "Search by deal name").
4. Deploy.

## Run locally

```bash
npm install
echo "ANTHROPIC_API_KEY=sk-ant-..." > .env.local
npm run dev
```
