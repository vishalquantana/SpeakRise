"use client";

import { useEffect, useState } from "react";

export default function EngagementTab() {
  const [data, setData] = useState<any>(null);

  useEffect(() => {
    fetch("/api/admin/engagement").then(r => r.json()).then(setData);
  }, []);

  if (!data) return <p className="text-[var(--muted)] px-6">Loading...</p>;

  return (
    <div className="px-6 space-y-4">
      <div className="grid grid-cols-3 gap-3">
        <div className="bg-white rounded-xl border border-[var(--card-border)] p-4 text-center">
          <p className="text-2xl font-bold text-[var(--accent)]">{data.completionRate}%</p>
          <p className="text-xs text-[var(--muted)] mt-1">Today</p>
        </div>
        <div className="bg-white rounded-xl border border-[var(--card-border)] p-4 text-center">
          <p className="text-2xl font-bold text-[var(--foreground)]">{data.completedToday}/{data.totalMembers}</p>
          <p className="text-xs text-[var(--muted)] mt-1">Active</p>
        </div>
        <div className="bg-white rounded-xl border border-[var(--card-border)] p-4 text-center">
          <p className="text-2xl font-bold text-[var(--gold)]">{data.inactive.length}</p>
          <p className="text-xs text-[var(--muted)] mt-1">Inactive (3d+)</p>
        </div>
      </div>

      {data.inactive.length > 0 && (
        <div>
          <h3 className="text-sm font-semibold text-[var(--foreground)] mb-2">Needs a nudge</h3>
          <div className="bg-white rounded-xl border border-[var(--card-border)] divide-y divide-[var(--card-border)]">
            {data.inactive.slice(0, 10).map((u: any, i: number) => (
              <div key={i} className="px-4 py-3 text-sm text-[var(--foreground)]">
                {u.name || u.email}
              </div>
            ))}
          </div>
        </div>
      )}

      {data.streaks.length > 0 && (
        <div>
          <h3 className="text-sm font-semibold text-[var(--foreground)] mb-2">Top Streaks</h3>
          <div className="bg-white rounded-xl border border-[var(--card-border)] divide-y divide-[var(--card-border)]">
            {data.streaks.slice(0, 5).map((s: any, i: number) => (
              <div key={i} className="px-4 py-3 flex justify-between items-center">
                <span className="text-sm text-[var(--foreground)]">{s.name || s.email}</span>
                <span className="text-sm font-bold text-[var(--accent)]">{s.current_streak}d</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
