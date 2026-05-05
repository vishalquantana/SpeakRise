interface ProgressBarProps {
  label: string;
  score: number;
  max?: number;
}

export default function ProgressBar({ label, score, max = 100 }: ProgressBarProps) {
  const pct = Math.min((score / max) * 100, 100);
  return (
    <div className="space-y-1">
      <div className="flex justify-between text-sm">
        <span className="text-gray-300 capitalize">{label.replace(/_/g, " ")}</span>
        <span className="text-gray-500">{score}%</span>
      </div>
      <div className="h-2 bg-gray-800 rounded-full overflow-hidden">
        <div className="h-full bg-indigo-500 rounded-full transition-all" style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}
