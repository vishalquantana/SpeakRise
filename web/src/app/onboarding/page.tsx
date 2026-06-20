"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import ConversationUI from "@/components/conversation-ui";
import OnboardingWarmup, { WarmupResult } from "@/components/onboarding-warmup";

interface ActiveSession {
  sessionId: string;
  duration: number;
  openingLine?: string;
  systemPromptAddition?: string;
}

export default function OnboardingPage() {
  const router = useRouter();
  const [starting, setStarting] = useState(false);
  const [active, setActive] = useState<ActiveSession | null>(null);
  const [assessing, setAssessing] = useState(false);

  // Build a deterministic, emoji-free greeting that addresses the user by name
  // and references the topic fragment produced by the warm-up. Falling back to a
  // plain greeting keeps TTS clean when we have no name or no warm-up choice.
  function assembleOpeningLine(name: string | null, topicOpening?: string): string {
    const who = name?.trim() ? name.trim().split(/\s+/)[0] : "there";
    const greeting = `Hi ${who}, great to meet you.`;
    if (!topicOpening) {
      return `${greeting} Tell me a little about yourself to get us started.`;
    }
    // The warm-up's openingLine already opens with "Great to meet you." — strip
    // that so we don't greet twice, then stitch on our name-aware greeting.
    const tail = topicOpening.replace(/^great to meet you\.\s*/i, "");
    return `${greeting} ${tail}`;
  }

  async function startWarmupSession(warmup?: WarmupResult) {
    if (starting) return;
    setStarting(true);

    const res = await fetch("/api/session/start", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        sessionType: "baseline",
        ...(warmup ? { startLevel: warmup.level } : {}),
      }),
    });
    const data = await res.json();

    setActive({
      sessionId: data.sessionId,
      duration: data.duration || 300,
      openingLine: assembleOpeningLine(data.userName ?? null, warmup?.openingLine),
      systemPromptAddition: warmup?.systemPromptAddition,
    });
    setStarting(false);
  }

  async function handleSessionEnd() {
    if (!active) return;
    setAssessing(true);

    await fetch("/api/session/end", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sessionId: active.sessionId }),
    });

    await fetch("/api/assess", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sessionId: active.sessionId }),
    });

    await fetch("/api/auth/complete-onboarding", { method: "POST" });

    router.push("/dashboard");
  }

  if (assessing) {
    return (
      <div className="min-h-screen bg-[var(--background)] flex flex-col items-center justify-center gap-4">
        <div className="w-8 h-8 border-2 border-t-transparent rounded-full animate-spin" style={{ borderColor: "var(--accent)", borderTopColor: "transparent" }} />
        <p className="text-[var(--muted)]">Analyzing your speaking level...</p>
      </div>
    );
  }

  if (starting && !active) {
    return (
      <div className="min-h-screen bg-[var(--background)] flex flex-col items-center justify-center px-6 text-center">
        <h1 className="text-2xl font-bold mb-2 text-[var(--foreground)]">
          Welcome to Speak<span className="text-[var(--accent)]">Rise</span>
        </h1>
        <p className="text-[var(--muted)]">Setting up your first conversation...</p>
      </div>
    );
  }

  // Warm-up first: a brand-new user taps through 3 cards, then drops straight
  // into a voice conversation where the AI speaks first, by name + topic.
  if (!active) {
    return (
      <OnboardingWarmup
        onComplete={(warmup) => startWarmupSession(warmup)}
        onSkip={() => startWarmupSession()}
      />
    );
  }

  return (
    <div className="h-screen flex flex-col bg-[var(--background)]">
      <div className="px-4 py-3 bg-white border-b border-[var(--card-border)]">
        <h2 className="font-semibold text-[var(--foreground)]">Your first conversation</h2>
        <p className="text-xs text-[var(--muted)]">Have a short chat so we can understand your level</p>
      </div>
      <div className="flex-1">
        <ConversationUI
          sessionId={active.sessionId}
          onSessionEnd={handleSessionEnd}
          isOnboarding
          duration={active.duration}
          openingLine={active.openingLine}
          systemPromptAddition={active.systemPromptAddition}
        />
      </div>
    </div>
  );
}
