"use client";

import { useState, type ReactNode } from "react";

export interface WarmupResult {
  goal: string;
  level: number;
  topicTitle: string;
  openingLine: string;
  systemPromptAddition: string;
}

interface OnboardingWarmupProps {
  onComplete: (result: WarmupResult) => void;
  onSkip: () => void;
}

interface Option<T> {
  value: T;
  label: string;
  sub?: string;
  emoji?: string;
}

// Step 1 — what the learner wants to get out of practice.
const GOALS: Option<string>[] = [
  { value: "confidence", label: "Speak with more confidence", emoji: "💪" },
  { value: "fluency", label: "Become more fluent", emoji: "🌊" },
  { value: "work", label: "English for work", emoji: "💼" },
  { value: "travel", label: "Travel & everyday life", emoji: "✈️" },
];

// Step 2 — self-reported comfort, mapped to a starting level 1-5.
const COMFORT: Option<number>[] = [
  { value: 1, label: "Just starting out", sub: "I know a few words", emoji: "🌱" },
  { value: 2, label: "I can get by", sub: "Simple conversations", emoji: "🙂" },
  { value: 3, label: "Pretty comfortable", sub: "I chat day to day", emoji: "👍" },
  { value: 4, label: "Quite fluent", sub: "I want to polish it", emoji: "✨" },
  { value: 5, label: "Very fluent", sub: "Looking for a challenge", emoji: "🚀" },
];

// Step 3 — conversation topic tiles. `prompt` is the spoken question fragment
// (kept emoji-free because it is fed to TTS via the opening line).
interface TopicTile extends Option<string> {
  title: string;
  prompt: string;
  interest: string;
}
const TOPICS: TopicTile[] = [
  {
    value: "travel",
    title: "Travel",
    label: "Travel",
    emoji: "✈️",
    interest: "travel",
    prompt: "tell me about the best trip you have ever taken.",
  },
  {
    value: "work",
    title: "Work",
    label: "Work",
    emoji: "💼",
    interest: "work and careers",
    prompt: "tell me a little about what you do, or what you would love to do.",
  },
  {
    value: "daily-life",
    title: "Daily Life",
    label: "Daily Life",
    emoji: "☕",
    interest: "everyday life",
    prompt: "walk me through what a normal day looks like for you.",
  },
  {
    value: "storytelling",
    title: "Storytelling",
    label: "Storytelling",
    emoji: "📖",
    interest: "telling stories",
    prompt: "tell me a story about something memorable that happened to you.",
  },
];

const TOTAL_STEPS = 3;

export default function OnboardingWarmup({ onComplete, onSkip }: OnboardingWarmupProps) {
  const [step, setStep] = useState(0);
  const [goal, setGoal] = useState<string | null>(null);
  const [level, setLevel] = useState<number | null>(null);

  function pickGoal(value: string) {
    setGoal(value);
    setStep(1);
  }

  function pickLevel(value: number) {
    setLevel(value);
    setStep(2);
  }

  function pickTopic(topic: TopicTile) {
    // Deterministic, emoji-free opening line + system prompt. The page may
    // prepend the user's name; this fragment already reads as a full greeting
    // on its own so it never sends an empty/odd line to TTS.
    const openingLine = `Great to meet you. I hear you love ${topic.interest} — ${topic.prompt}`;

    const goalText = GOALS.find((g) => g.value === goal)?.label ?? "build their speaking confidence";
    const chosenLevel = level ?? 2;
    const systemPromptAddition =
      `This is a brand-new learner's very first warm-up conversation. ` +
      `Their goal is to ${goalText.toLowerCase()}, their self-reported comfort level is ${chosenLevel} out of 5, ` +
      `and they want to talk about ${topic.interest}. ` +
      `Keep the conversation warm, encouraging, and easy to follow. Ask short, friendly follow-up questions, ` +
      `match their level, and gently keep them talking about ${topic.interest}. ` +
      `Never use emojis, emoticons, or special symbols in your response.`;

    onComplete({
      goal: goal ?? "confidence",
      level: chosenLevel,
      topicTitle: topic.title,
      openingLine,
      systemPromptAddition,
    });
  }

  function back() {
    setStep((s) => Math.max(0, s - 1));
  }

  return (
    <div className="min-h-screen bg-[var(--background)] flex flex-col px-6 py-8">
      {/* Progress dots */}
      <div className="flex items-center justify-center gap-2 mb-8">
        {Array.from({ length: TOTAL_STEPS }).map((_, i) => (
          <span
            key={i}
            className="h-2 rounded-full transition-all"
            style={{
              width: i === step ? "28px" : "8px",
              backgroundColor: i <= step ? "var(--accent)" : "var(--card-border)",
            }}
          />
        ))}
      </div>

      <div className="flex-1 flex flex-col max-w-md w-full mx-auto">
        {step > 0 && (
          <button
            onClick={back}
            className="self-start mb-4 text-sm font-medium text-[var(--muted)] hover:text-[var(--accent)] transition"
          >
            ← Back
          </button>
        )}

        {step === 0 && (
          <Step
            title="What brings you here?"
            subtitle="Pick the one that fits best."
          >
            {GOALS.map((g) => (
              <Card key={g.value} emoji={g.emoji} label={g.label} onClick={() => pickGoal(g.value)} />
            ))}
          </Step>
        )}

        {step === 1 && (
          <Step
            title="How comfortable are you speaking English?"
            subtitle="No wrong answer — this just sets your starting point."
          >
            {COMFORT.map((c) => (
              <Card key={c.value} emoji={c.emoji} label={c.label} sub={c.sub} onClick={() => pickLevel(c.value)} />
            ))}
          </Step>
        )}

        {step === 2 && (
          <Step
            title="What would you like to talk about?"
            subtitle="We'll start a short, friendly chat about it."
          >
            <div className="grid grid-cols-2 gap-3">
              {TOPICS.map((t) => (
                <button
                  key={t.value}
                  onClick={() => pickTopic(t)}
                  className="flex flex-col items-center justify-center gap-2 py-6 rounded-2xl bg-white border border-[var(--card-border)] hover:border-[var(--accent)] hover:shadow-sm transition"
                >
                  <span className="text-3xl">{t.emoji}</span>
                  <span className="text-sm font-semibold text-[var(--foreground)]">{t.title}</span>
                </button>
              ))}
            </div>
          </Step>
        )}
      </div>

      {/* Skip link */}
      <div className="mt-8 text-center">
        <button
          onClick={onSkip}
          className="text-sm font-medium text-[var(--muted)] hover:text-[var(--accent)] underline underline-offset-4 transition"
        >
          Skip, just start talking
        </button>
      </div>
    </div>
  );
}

function Step({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle: string;
  children: ReactNode;
}) {
  return (
    <div>
      <h1 className="text-2xl font-bold text-[var(--foreground)] mb-1">{title}</h1>
      <p className="text-[var(--muted)] mb-6">{subtitle}</p>
      <div className="space-y-3">{children}</div>
    </div>
  );
}

function Card({
  emoji,
  label,
  sub,
  onClick,
}: {
  emoji?: string;
  label: string;
  sub?: string;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className="w-full flex items-center gap-3 px-4 py-4 rounded-2xl bg-white border border-[var(--card-border)] hover:border-[var(--accent)] hover:shadow-sm transition text-left"
    >
      {emoji && <span className="text-2xl">{emoji}</span>}
      <span className="flex flex-col">
        <span className="font-semibold text-[var(--foreground)]">{label}</span>
        {sub && <span className="text-xs text-[var(--muted)]">{sub}</span>}
      </span>
    </button>
  );
}
