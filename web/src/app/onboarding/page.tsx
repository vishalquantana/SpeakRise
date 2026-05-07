"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import ConversationUI from "@/components/conversation-ui";

export default function OnboardingPage() {
  const router = useRouter();
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [assessing, setAssessing] = useState(false);

  useEffect(() => {
    fetch("/api/session/start", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sessionType: "baseline" }),
    })
      .then((r) => r.json())
      .then((data) => setSessionId(data.sessionId));
  }, []);

  async function handleSessionEnd() {
    if (!sessionId) return;
    setAssessing(true);

    await fetch("/api/session/end", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sessionId }),
    });

    await fetch("/api/assess", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sessionId }),
    });

    await fetch("/api/auth/complete-onboarding", { method: "POST" });

    router.push("/dashboard");
  }

  if (!sessionId) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center px-6 text-center">
        <h1 className="text-2xl font-bold mb-2">
          Welcome to Speak<span className="text-indigo-500">Rise</span>
        </h1>
        <p className="text-gray-400">Preparing your baseline assessment...</p>
      </div>
    );
  }

  if (assessing) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-4">
        <div className="w-8 h-8 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
        <p className="text-gray-400">Analyzing your speaking level...</p>
      </div>
    );
  }

  return (
    <div className="h-screen flex flex-col">
      <div className="px-4 py-3 bg-gray-900 border-b border-gray-800">
        <h2 className="font-semibold">Baseline Assessment</h2>
        <p className="text-xs text-gray-400">Have a short conversation so we can understand your level</p>
      </div>
      <div className="flex-1">
        <ConversationUI
          sessionId={sessionId}
          onSessionEnd={handleSessionEnd}
          isOnboarding
          initialPrompt="You are starting a baseline English assessment. Greet the user warmly, introduce yourself as their SpeakRise conversation partner, and ask them to tell you a little about themselves. Keep it friendly and encouraging. NEVER use emojis, emoticons, or special symbols in your response."
        />
      </div>
    </div>
  );
}
