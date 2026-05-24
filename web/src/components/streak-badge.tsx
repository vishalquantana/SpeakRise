const BADGE_LABELS: Record<string, { label: string; color: string }> = {
  first_session: { label: "First Steps", color: "var(--gold)" },
  streak_7: { label: "7-Day Streak", color: "var(--accent)" },
  streak_30: { label: "30-Day Streak", color: "var(--accent)" },
  streak_90: { label: "90-Day Streak", color: "var(--accent)" },
  centurion: { label: "Centurion", color: "var(--indigo)" },
  level_up: { label: "Level Up", color: "var(--success)" },
  perfect_score: { label: "Perfect Score", color: "var(--gold)" },
  top_scorer: { label: "Top Scorer", color: "var(--gold)" },
};

export default function StreakBadge({ type }: { type: string }) {
  const badge = BADGE_LABELS[type] || { label: type, color: "var(--muted)" };
  return (
    <span
      className="inline-block px-3 py-1 rounded-full text-xs font-medium text-white"
      style={{ backgroundColor: badge.color }}
    >
      {badge.label}
    </span>
  );
}
