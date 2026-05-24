export default function ProgressBar({ label, score }: { label: string; score: number }) {
  return (
    <div>
      <div className="flex justify-between text-sm mb-1">
        <span className="text-[var(--foreground)] capitalize">{label.replace(/_/g, " ")}</span>
        <span className="text-[var(--muted)]">{score}%</span>
      </div>
      <div className="h-2 bg-[var(--card-border)] rounded-full overflow-hidden">
        <div
          className="h-full rounded-full transition-all duration-500"
          style={{ width: `${score}%`, backgroundColor: "var(--accent)" }}
        />
      </div>
    </div>
  );
}
