interface LeaderboardEntry {
  email: string;
  name: string | null;
  total_points: number;
  streak: number | null;
  current_level: number;
}

export default function Leaderboard({ entries, currentUserId }: { entries: any[]; currentUserId: string }) {
  return (
    <div className="space-y-2">
      {entries.map((entry, i) => (
        <div
          key={entry.email}
          className={`flex items-center justify-between p-3 rounded-xl border ${
            i < 3 ? "bg-[var(--gold-light)] border-[var(--gold)]" : "bg-white border-[var(--card-border)]"
          }`}
        >
          <div className="flex items-center gap-3">
            <span className="w-6 text-center font-bold text-sm text-[var(--muted)]">{i + 1}</span>
            <div>
              <p className="text-sm font-medium text-[var(--foreground)]">{entry.name || (entry.email as string).split("@")[0]}</p>
              <p className="text-xs text-[var(--muted)]">L{entry.current_level} {entry.streak ? `· ${entry.streak}d streak` : ""}</p>
            </div>
          </div>
          <span className="font-bold text-[var(--accent)]">{entry.total_points}pts</span>
        </div>
      ))}
    </div>
  );
}
