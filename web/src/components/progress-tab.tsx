"use client";

import { useEffect, useState } from "react";
import NudgeButton from "./nudge-button";

const LEVEL_NAMES = ["", "Learning", "Speaking", "Communicating", "Persuading", "Inspiring"];

export default function ProgressTab() {
  const [data, setData] = useState<any>(null);

  useEffect(() => {
    fetch("/api/admin/progress").then(r => r.json()).then(setData);
  }, []);

  if (!data) return <p className="text-[var(--muted)] px-6">Loading...</p>;

  return (
    <div className="px-6 space-y-4">
      <div>
        <h3 className="text-sm font-semibold text-[var(--foreground)] mb-2">Level Distribution</h3>
        <div className="bg-white rounded-xl border border-[var(--card-border)] p-4">
          <div className="flex gap-2 items-end h-24">
            {[1, 2, 3, 4, 5].map(level => {
              const count = data.levelDistribution.find((d: any) => d.current_level === level)?.count || 0;
              const maxCount = Math.max(...data.levelDistribution.map((d: any) => d.count as number), 1);
              const height = (count / maxCount) * 100;
              return (
                <div key={level} className="flex-1 flex flex-col items-center gap-1">
                  <div className="w-full rounded-t" style={{ height: `${Math.max(height, 4)}%`, backgroundColor: "var(--accent)", opacity: 0.5 + (level * 0.1) }}></div>
                  <span className="text-xs text-[var(--muted)]">L{level}</span>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      <div>
        <h3 className="text-sm font-semibold text-[var(--foreground)] mb-2">Team Progress</h3>
        <div className="bg-white rounded-xl border border-[var(--card-border)] divide-y divide-[var(--card-border)]">
          {data.members.map((m: any, i: number) => (
            <div key={i} className="px-4 py-3 flex justify-between items-center">
              <div>
                <p className="text-sm font-medium text-[var(--foreground)]">{m.name || m.email}</p>
                <p className="text-xs text-[var(--muted)]">L{m.current_level} — {LEVEL_NAMES[m.current_level]}</p>
              </div>
              <div className="flex items-center gap-3">
                <span className="text-sm text-[var(--accent)] font-medium">{m.total_points || 0}pts</span>
                <NudgeButton userId={m.id} name={m.name || m.email} />
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
