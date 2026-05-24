"use client";

import { useState, useEffect, useRef } from "react";

interface TimerProps {
  duration?: number; // seconds, default 300
  running: boolean;
  onEnd: () => void;
}

export default function Timer({ duration = 300, running, onEnd }: TimerProps) {
  const [remaining, setRemaining] = useState(duration);
  const intervalRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    setRemaining(duration);
  }, [duration]);

  useEffect(() => {
    if (!running) return;

    intervalRef.current = setInterval(() => {
      setRemaining((prev) => {
        if (prev <= 1) {
          clearInterval(intervalRef.current!);
          onEnd();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [running, onEnd]);

  const mins = Math.floor(remaining / 60);
  const secs = remaining % 60;
  const pct = (remaining / duration) * 100;
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
