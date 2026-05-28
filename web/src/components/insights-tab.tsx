"use client";

import { useEffect, useState } from "react";

export default function InsightsTab() {
  const [data, setData] = useState<any>(null);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [entries, setEntries] = useState<Record<string, any[]>>({});
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
                <div className="px-4 pb-3 space-y-2">
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
