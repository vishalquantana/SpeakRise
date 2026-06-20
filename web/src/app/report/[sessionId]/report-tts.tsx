"use client";

import { useEffect, useRef, useState } from "react";

// ---------------------------------------------------------------------------
// Shared TTS playback helper. Streams SSE base64 audio chunks from /api/ai/speak
// and plays them in order through a single AudioContext.
// ---------------------------------------------------------------------------
async function streamSpeak(text: string, ctxRef: { current: AudioContext | null }) {
  if (!ctxRef.current) ctxRef.current = new AudioContext();
  if (ctxRef.current.state === "suspended") await ctxRef.current.resume();

  const res = await fetch("/api/ai/speak", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text, voice: "af_sarah" }),
  });

  const reader = res.body!.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });

    const lines = buffer.split("\n\n");
    buffer = lines.pop() || "";

    for (const line of lines) {
      if (!line.startsWith("data: ") || line === "data: [DONE]") continue;
      const data = JSON.parse(line.slice(6));
      const audioBytes = Uint8Array.from(atob(data.audio), (c) => c.charCodeAt(0));
      const audioBuffer = await ctxRef.current!.decodeAudioData(audioBytes.buffer.slice(0));
      const source = ctxRef.current!.createBufferSource();
      source.buffer = audioBuffer;
      source.connect(ctxRef.current!.destination);
      source.start();
      await new Promise((r) => setTimeout(r, audioBuffer.duration * 1000));
    }
  }
}

// ---------------------------------------------------------------------------
// Auto-playing voiced session summary (existing behavior preserved).
// ---------------------------------------------------------------------------
export default function ReportTTS({ text }: { text: string }) {
  const [playing, setPlaying] = useState(false);
  const [autoPlayed, setAutoPlayed] = useState(false);
  const playCtxRef = useRef<AudioContext | null>(null);

  async function playTTS() {
    setPlaying(true);
    try {
      await streamSpeak(text, playCtxRef);
    } finally {
      setPlaying(false);
    }
  }

  useEffect(() => {
    if (!autoPlayed) {
      setAutoPlayed(true);
      playTTS().catch(() => setPlaying(false));
    }
  }, []);

  return (
    <div className="mx-6 mt-4">
      <button
        onClick={playTTS}
        disabled={playing}
        className="w-full py-3 bg-[var(--indigo-light)] border border-[var(--indigo)] text-[var(--indigo)] rounded-xl font-medium text-sm transition hover:bg-[var(--indigo)] hover:text-white disabled:opacity-50"
      >
        {playing ? "Reading feedback..." : "Listen to feedback"}
      </button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Speaker button used by "Practice these" lines. Voices the given (emoji-free)
// text via the same /api/ai/speak endpoint.
// ---------------------------------------------------------------------------
export function SpeakLine({ text }: { text: string }) {
  const [playing, setPlaying] = useState(false);
  const ctxRef = useRef<AudioContext | null>(null);

  async function play() {
    if (playing) return;
    setPlaying(true);
    try {
      await streamSpeak(text, ctxRef);
    } catch {
      /* swallow playback errors */
    } finally {
      setPlaying(false);
    }
  }

  return (
    <button
      onClick={play}
      aria-label={playing ? "Playing" : "Listen"}
      title="Listen"
      className="shrink-0 w-9 h-9 grid place-items-center rounded-full border border-[var(--indigo)] text-[var(--indigo)] transition hover:bg-[var(--indigo)] hover:text-white disabled:opacity-50"
      disabled={playing}
    >
      {playing ? (
        <span className="block w-2.5 h-2.5 rounded-[2px] bg-current animate-pulse" />
      ) : (
        <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
          <path d="M3 10v4a1 1 0 0 0 1 1h3l4 4V5L7 9H4a1 1 0 0 0-1 1Z" />
          <path d="M16.5 12a4.5 4.5 0 0 0-2.5-4.03v8.06A4.5 4.5 0 0 0 16.5 12Z" />
          <path d="M14 3.23v2.06a6.5 6.5 0 0 1 0 13.42v2.06a8.5 8.5 0 0 0 0-17.54Z" />
        </svg>
      )}
    </button>
  );
}

// ---------------------------------------------------------------------------
// Celebratory reward reveal: count-up points, streak flame, a newly-earned
// badge, and "you're #N this week". Uses a requestAnimationFrame count-up plus
// CSS keyframe pops (gsap is not a dependency of this project).
// ---------------------------------------------------------------------------
const BADGE_LABELS: Record<string, string> = {
  first_session: "First Steps",
  streak_7: "7-Day Streak",
  streak_30: "30-Day Streak",
  streak_90: "90-Day Streak",
  centurion: "Centurion",
  level_up: "Level Up",
  perfect_score: "Perfect Score",
  top_scorer: "Top Scorer",
};

export function RewardReveal({
  points,
  streak,
  rank,
  totalPlayers,
  newBadge,
}: {
  points: number;
  streak: number;
  rank: number | null;
  totalPlayers: number;
  newBadge: string | null;
}) {
  const [display, setDisplay] = useState(0);

  useEffect(() => {
    if (points <= 0) {
      setDisplay(0);
      return;
    }
    const prefersReduced =
      typeof window !== "undefined" &&
      window.matchMedia &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (prefersReduced) {
      setDisplay(points);
      return;
    }

    let raf = 0;
    const duration = 1100;
    const start = performance.now();
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / duration);
      // easeOutCubic
      const eased = 1 - Math.pow(1 - t, 3);
      setDisplay(Math.round(points * eased));
      if (t < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [points]);

  return (
    <div className="mx-6 reward-reveal">
      <style>{`
        @keyframes reward-pop {
          0% { transform: scale(0.85); opacity: 0; }
          60% { transform: scale(1.04); opacity: 1; }
          100% { transform: scale(1); opacity: 1; }
        }
        @keyframes flame-flicker {
          0%, 100% { transform: scale(1) rotate(-2deg); }
          50% { transform: scale(1.12) rotate(2deg); }
        }
        .reward-reveal .reward-card { animation: reward-pop 0.6s cubic-bezier(.2,.9,.3,1.2) both; }
        .reward-reveal .reward-chip { animation: reward-pop 0.6s cubic-bezier(.2,.9,.3,1.2) both; }
        .reward-reveal .reward-chip-1 { animation-delay: 0.15s; }
        .reward-reveal .reward-chip-2 { animation-delay: 0.3s; }
        .reward-reveal .reward-chip-3 { animation-delay: 0.45s; }
        .reward-reveal .flame { display: inline-block; animation: flame-flicker 0.9s ease-in-out infinite; }
        @media (prefers-reduced-motion: reduce) {
          .reward-reveal .reward-card,
          .reward-reveal .reward-chip { animation: none; opacity: 1; transform: none; }
          .reward-reveal .flame { animation: none; }
        }
      `}</style>

      <div className="reward-card p-6 rounded-2xl text-center text-white shadow-lg bg-gradient-to-br from-[var(--accent)] to-[var(--indigo)]">
        <p className="text-xs uppercase tracking-[0.2em] opacity-80">Session complete</p>
        <p className="mt-2 text-5xl font-extrabold tabular-nums">+{display}</p>
        <p className="text-sm opacity-90">points earned</p>

        <div className="mt-4 flex flex-wrap items-center justify-center gap-2">
          {streak > 1 && (
            <span className="reward-chip reward-chip-1 inline-flex items-center gap-1 px-3 py-1.5 rounded-full bg-white/20 text-sm font-semibold backdrop-blur">
              <span className="flame">🔥</span>
              {streak} day streak
            </span>
          )}
          {newBadge && (
            <span className="reward-chip reward-chip-2 inline-flex items-center gap-1 px-3 py-1.5 rounded-full bg-white/20 text-sm font-semibold backdrop-blur">
              New badge: {BADGE_LABELS[newBadge] || newBadge}
            </span>
          )}
          {rank !== null && (
            <span className="reward-chip reward-chip-3 inline-flex items-center gap-1 px-3 py-1.5 rounded-full bg-[var(--gold)] text-[var(--foreground)] text-sm font-bold">
              You&apos;re #{rank} this week{totalPlayers > 0 ? ` of ${totalPlayers}` : ""}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
