# M&A Deal Browser

Paste a news article (or its URL) about an M&A deal and get the key details:
core deal terms, advisors & approvals, key risks and a short summary. Past
analyses are kept in your browser's history.

## Deploy to Vercel

1. Import this repo in Vercel (framework preset: Next.js).
2. Add an environment variable `ANTHROPIC_API_KEY` (from console.anthropic.com).
3. Deploy.

## Run locally

```bash
npm install
echo "ANTHROPIC_API_KEY=sk-ant-..." > .env.local
npm run dev
```
