"use client";

import { useEffect, useState } from "react";

function Sparkline({ series }: { series: { score: number }[] }) {
  const w = 120;
  const h = 32;
  const pad = 3;
  const scores = series.map((p) => p.score);
  const n = scores.length;

  // A single point can't draw a line; render a dot so it's still visible.
  if (n === 1) {
    return (
      <svg width={w} height={h} className="overflow-visible">
        <circle cx={w / 2} cy={h / 2} r={3} fill="var(--accent)" />
      </svg>
    );
  }

  const min = Math.min(...scores);
  const max = Math.max(...scores);
  const range = max - min || 1;
  const stepX = (w - pad * 2) / (n - 1);

  const points = scores
    .map((s, i) => {
      const x = pad + i * stepX;
      const y = pad + (h - pad * 2) * (1 - (s - min) / range);
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");

  const trendingUp = scores[n - 1] >= scores[0];
  const stroke = trendingUp ? "var(--success)" : "var(--gold)";
  const lastX = pad + (n - 1) * stepX;
  const lastY = pad + (h - pad * 2) * (1 - (scores[n - 1] - min) / range);

  return (
    <svg width={w} height={h} className="overflow-visible">
      <polyline
        points={points}
        fill="none"
        stroke={stroke}
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx={lastX} cy={lastY} r={2.5} fill={stroke} />
    </svg>
  );
}

export default function InsightsTab() {
  const [data, setData] = useState<any>(null);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [entries, setEntries] = useState<Record<string, any[]>>({});
  const [progress, setProgress] = useState<Record<string, any>>({});
  const [digest, setDigest] = useState<string | null>(null);
  const [genLoading, setGenLoading] = useState(false);

  useEffect(() => {
    fetch("/api/admin/insights")
      .then((r) => r.json())
      .then((d) => {
        setData(d);
        if (d.latestDigest) {
          try {
            setDigest(JSON.parse(d.latestDigest.digest_json).summary);
          } catch {
            setDigest(null);
          }
        }
      });
  }, []);

  async function toggle(id: string) {
    if (expanded === id) {
      setExpanded(null);
      return;
    }
    setExpanded(id);
    if (!entries[id]) {
      const r = await fetch(`/api/admin/insights?employeeId=${id}`).then((x) => x.json());
      setEntries((prev) => ({ ...prev, [id]: r.entries }));
      setProgress((prev) => ({ ...prev, [id]: r.progress || null }));
    }
  }

  async function generateDigest() {
    setGenLoading(true);
    const r = await fetch("/api/admin/insights", { method: "POST" }).then((x) => x.json());
    setDigest(r.summary);
    setGenLoading(false);
  }

  if (!data) return <p className="text-[var(--muted)] px-6">Loading...</p>;

  const sentimentCounts: Record<string, number> = {};
  (data.orgSentiment || []).forEach((s: any) => {
    sentimentCounts[s.sentiment] = s.c;
  });

  return (
    <div className="px-6 space-y-5">
      <div className="bg-white rounded-xl border border-[var(--card-border)] p-4">
        <div className="flex justify-between items-center mb-2">
          <h3 className="text-sm font-semibold text-[var(--foreground)]">Weekly Digest</h3>
          <button
            onClick={generateDigest}
            disabled={genLoading}
            className="text-xs px-3 py-1.5 rounded-lg bg-[var(--accent)] text-white disabled:opacity-50"
          >
            {genLoading ? "Generating..." : "Generate"}
          </button>
        </div>
        <p className="text-sm text-[var(--foreground)] whitespace-pre-line">
          {digest || "No digest yet. Click Generate to summarize the last 7 days."}
        </p>
      </div>

      <div className="grid grid-cols-3 gap-3">
        <div className="bg-white rounded-xl border border-[var(--card-border)] p-4 text-center">
          <p className="text-2xl font-bold text-[var(--success)]">{sentimentCounts.positive || 0}</p>
          <p className="text-xs text-[var(--muted)] mt-1">Positive</p>
        </div>
        <div className="bg-white rounded-xl border border-[var(--card-border)] p-4 text-center">
          <p className="text-2xl font-bold text-[var(--foreground)]">{sentimentCounts.neutral || 0}</p>
          <p className="text-xs text-[var(--muted)] mt-1">Neutral</p>
        </div>
        <div className="bg-white rounded-xl border border-[var(--card-border)] p-4 text-center">
          <p className="text-2xl font-bold text-[var(--gold)]">{sentimentCounts.negative || 0}</p>
          <p className="text-xs text-[var(--muted)] mt-1">Negative</p>
        </div>
      </div>

      {data.blocked && data.blocked.length > 0 && (
        <div>
          <h3 className="text-sm font-semibold text-[var(--foreground)] mb-2">Blockers</h3>
          <div className="bg-white rounded-xl border border-[var(--card-border)] divide-y divide-[var(--card-border)]">
            {data.blocked.map((b: any, i: number) => (
              <div key={i} className="px-4 py-3">
                <p className="text-xs font-medium text-[var(--accent)]">{b.name || b.email}</p>
                <p className="text-sm text-[var(--foreground)]">{b.blockers_text}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      <div>
        <h3 className="text-sm font-semibold text-[var(--foreground)] mb-2">By Employee</h3>
        <div className="bg-white rounded-xl border border-[var(--card-border)] divide-y divide-[var(--card-border)]">
          {data.employees.map((e: any) => (
            <div key={e.id}>
              <button
                onClick={() => toggle(e.id)}
                className="w-full px-4 py-3 flex justify-between items-center text-left"
              >
                <span className="text-sm font-medium text-[var(--foreground)]">{e.name || e.email}</span>
                <span className="text-xs text-[var(--muted)]">{e.entry_count} notes</span>
              </button>
              {expanded === e.id && (
                <div className="px-4 pb-3 space-y-3">
                  {(() => {
                    const p = progress[e.id];
                    const series = (p && p.series) || [];
                    const topics = (p && p.topics) || [];
                    const skillLabel = p?.skill
                      ? p.skill.charAt(0).toUpperCase() + p.skill.slice(1)
                      : "Fluency";
                    return (
                      <div className="rounded-lg bg-[var(--background)] border border-[var(--card-border)] p-3">
                        <div className="flex items-center justify-between gap-3">
                          <div>
                            <p className="text-xs font-medium text-[var(--foreground)]">
                              {skillLabel} over time
                            </p>
                            {series.length > 0 && (
                              <p className="text-[11px] text-[var(--muted)] mt-0.5">
                                {series.length} session{series.length === 1 ? "" : "s"} · latest{" "}
                                {series[series.length - 1].score}/100
                              </p>
                            )}
                          </div>
                          {series.length > 0 ? (
                            <Sparkline series={series} />
                          ) : (
                            <span className="text-[11px] text-[var(--muted)] italic">
                              No sessions yet
                            </span>
                          )}
                        </div>
                        {topics.length > 0 && (
                          <div className="mt-2.5">
                            <p className="text-[11px] text-[var(--muted)] mb-1">Most discussed</p>
                            <div className="flex flex-wrap gap-1.5">
                              {topics.map((t: any, i: number) => (
                                <span
                                  key={i}
                                  className="text-[11px] px-2 py-0.5 rounded-full bg-[var(--accent)]/10 text-[var(--accent)]"
                                >
                                  {t.topic}
                                  {t.count > 1 ? ` ·${t.count}` : ""}
                                </span>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })()}
                  {(entries[e.id] || []).length === 0 ? (
                    <p className="text-xs text-[var(--muted)]">No work notes yet.</p>
                  ) : (
                    (entries[e.id] || []).map((w: any, i: number) => (
                      <div key={i} className="border-l-2 border-[var(--card-border)] pl-3">
                        <p className="text-xs text-[var(--muted)]">
                          {new Date(w.created_at).toLocaleDateString()} — {w.sentiment}
                        </p>
                        <p className="text-sm text-[var(--foreground)]">{w.summary_text}</p>
                        {w.blockers_text && (
                          <p className="text-xs text-[var(--gold)] mt-0.5">Blocker: {w.blockers_text}</p>
                        )}
                      </div>
                    ))
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
