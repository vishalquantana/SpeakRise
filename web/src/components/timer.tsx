"use client";

import { useState, useEffect, useRef } from "react";

interface TimerProps {
  durationSeconds: number;
  onTimeUp: () => void;
  running: boolean;
}

export default function Timer({ durationSeconds, onTimeUp, running }: TimerProps) {
  const [remaining, setRemaining] = useState(durationSeconds);
  const intervalRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    if (!running) return;

    intervalRef.current = setInterval(() => {
      setRemaining((prev) => {
        if (prev <= 1) {
          clearInterval(intervalRef.current!);
          onTimeUp();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [running, onTimeUp]);

  const mins = Math.floor(remaining / 60);
  const secs = remaining % 60;
  const pct = (remaining / durationSeconds) * 100;
  const isLow = remaining < 60;

  return (
    <div className="flex items-center gap-3">
      <div className="w-24 h-1.5 bg-gray-800 rounded-full overflow-hidden">
        <div
          className={`h-full rounded-full transition-all duration-1000 ${isLow ? "bg-red-500" : "bg-indigo-500"}`}
          style={{ width: `${pct}%` }}
        />
      </div>
      <span className={`text-sm font-mono ${isLow ? "text-red-400" : "text-gray-400"}`}>
        {mins}:{secs.toString().padStart(2, "0")}
      </span>
    </div>
  );
}
