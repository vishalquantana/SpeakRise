"use client";

import { useEffect, useState } from "react";

export default function InsightsTab() {
  const [data, setData] = useState<any>(null);

  useEffect(() => {
    fetch("/api/admin/insights").then(r => r.json()).then(setData);
  }, []);

  if (!data) return <p className="text-[var(--muted)] px-6">Loading...</p>;

  return (
    <div className="px-6 space-y-4">
      <p className="text-sm text-[var(--muted)]">What your team has been working on (extracted from daily conversations)</p>

      {data.recentWork.length === 0 ? (
        <div className="bg-white rounded-xl border border-[var(--card-border)] p-6 text-center">
          <p className="text-[var(--muted)]">No work entries yet. Insights appear after team members complete sessions.</p>
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-[var(--card-border)] divide-y divide-[var(--card-border)]">
          {data.recentWork.map((entry: any, i: number) => (
            <div key={i} className="px-4 py-3">
              <div className="flex justify-between items-start mb-1">
                <p className="text-xs font-medium text-[var(--accent)]">{entry.name || entry.email}</p>
                <p className="text-xs text-[var(--muted)]">{new Date(entry.created_at).toLocaleDateString()}</p>
              </div>
              <p className="text-sm text-[var(--foreground)]">{entry.summary_text}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
