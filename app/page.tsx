"use client";

import { useEffect, useState } from "react";
import type { Deal } from "@/lib/schema";

type HistoryItem = { id: string; savedAt: string; source: string; deal: Deal };

const HISTORY_KEY = "ma-deal-history";

function loadHistory(): HistoryItem[] {
  try {
    return JSON.parse(localStorage.getItem(HISTORY_KEY) ?? "[]");
  } catch {
    return [];
  }
}

function saveHistory(items: HistoryItem[]) {
  try {
    localStorage.setItem(HISTORY_KEY, JSON.stringify(items));
  } catch {
    // storage unavailable (private mode etc.) — history just won't persist
  }
}

function formatValue(value: number | null, currency: string | null) {
  if (value == null) return null;
  const abs = Math.abs(value);
  const [n, unit] =
    abs >= 1e9 ? [value / 1e9, "bn"] : abs >= 1e6 ? [value / 1e6, "m"] : [value, ""];
  return `${currency ?? ""} ${n.toLocaleString(undefined, { maximumFractionDigits: 2 })}${unit}`.trim();
}

const looksLikeUrl = (s: string) => /^https?:\/\/\S+$/i.test(s.trim());

export default function Home() {
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [deal, setDeal] = useState<Deal | null>(null);
  const [history, setHistory] = useState<HistoryItem[]>([]);

  useEffect(() => setHistory(loadHistory()), []);

  async function analyze() {
    const value = input.trim();
    if (!value) return;
    setLoading(true);
    setError(null);
    setDeal(null);
    try {
      const isUrl = looksLikeUrl(value);
      const res = await fetch("/api/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(isUrl ? { url: value } : { text: value }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Something went wrong");
      setDeal(data.deal);
      const item: HistoryItem = {
        id: crypto.randomUUID(),
        savedAt: new Date().toISOString(),
        source: isUrl ? value : value.slice(0, 80) + (value.length > 80 ? "…" : ""),
        deal: data.deal,
      };
      const next = [item, ...history].slice(0, 50);
      setHistory(next);
      saveHistory(next);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }

  function removeItem(id: string) {
    const next = history.filter((h) => h.id !== id);
    setHistory(next);
    saveHistory(next);
  }

  return (
    <main className="container">
      <header>
        <h1>M&amp;A Deal Browser</h1>
        <p className="muted">Paste a news article (or its URL) about an M&amp;A deal and get the key details.</p>
      </header>

      <section className="card">
        <textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="https://… or paste the article text here"
          rows={8}
        />
        <div className="row">
          <span className="muted small">{looksLikeUrl(input) ? "URL detected — the article will be fetched" : ""}</span>
          <button onClick={analyze} disabled={loading || !input.trim()}>
            {loading ? "Analysing…" : "Analyse deal"}
          </button>
        </div>
        {error && <p className="error">{error}</p>}
      </section>

      {deal && <DealCard deal={deal} />}

      {history.length > 0 && (
        <section>
          <h2>History</h2>
          <ul className="history">
            {history.map((h) => (
              <li key={h.id}>
                <button className="link" onClick={() => setDeal(h.deal)}>
                  <strong>{h.deal.acquirer ?? "?"} → {h.deal.target ?? "?"}</strong>
                  <span className="muted small">
                    {formatValue(h.deal.deal_value, h.deal.currency) ?? "value n/a"} ·{" "}
                    {new Date(h.savedAt).toLocaleDateString()}
                  </span>
                </button>
                <button className="ghost" aria-label="Delete" onClick={() => removeItem(h.id)}>×</button>
              </li>
            ))}
          </ul>
        </section>
      )}
    </main>
  );
}

function Field({ label, value }: { label: string; value: React.ReactNode }) {
  const empty = value == null || value === "" || (Array.isArray(value) && value.length === 0);
  return (
    <div className="field">
      <dt>{label}</dt>
      <dd className={empty ? "muted" : ""}>
        {empty ? "Not mentioned" : Array.isArray(value) ? value.join(", ") : value}
      </dd>
    </div>
  );
}

function DealCard({ deal }: { deal: Deal }) {
  return (
    <section className="card">
      <div className="row">
        <h2>{deal.acquirer ?? "Unknown acquirer"} → {deal.target ?? "Unknown target"}</h2>
        <span className={`badge ${deal.status}`}>{deal.status}</span>
      </div>
      <p>{deal.summary}</p>

      <h3>Core deal terms</h3>
      <dl className="grid">
        <Field label="Acquirer" value={deal.acquirer} />
        <Field label="Target" value={deal.target} />
        <Field label="Seller" value={deal.seller} />
        <Field label="Deal value" value={formatValue(deal.deal_value, deal.currency)} />
        <Field label="Announced" value={deal.announcement_date} />
        <Field label="Expected closing" value={deal.expected_closing} />
      </dl>

      <h3>Advisors &amp; approvals</h3>
      <dl className="grid">
        <Field label="Financial advisors (acquirer)" value={deal.financial_advisors.acquirer} />
        <Field label="Financial advisors (target)" value={deal.financial_advisors.target} />
        <Field label="Legal advisors (acquirer)" value={deal.legal_advisors.acquirer} />
        <Field label="Legal advisors (target)" value={deal.legal_advisors.target} />
        <Field label="Regulatory approvals" value={deal.regulatory_approvals} />
        <Field label="Shareholder approval" value={deal.shareholder_approval} />
      </dl>

      <h3>Key risks</h3>
      {deal.key_risks.length ? (
        <ul>{deal.key_risks.map((r) => <li key={r}>{r}</li>)}</ul>
      ) : (
        <p className="muted">Not mentioned</p>
      )}
    </section>
  );
}
