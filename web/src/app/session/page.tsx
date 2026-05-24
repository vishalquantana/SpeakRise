"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import ConversationUI from "@/components/conversation-ui";

export default function SessionPage() {
  const router = useRouter();
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [duration, setDuration] = useState(300);
  const [scenario, setScenario] = useState<{ openingMessage: string; systemPromptAddition: string } | null>(null);
  const [assessing, setAssessing] = useState(false);

  useEffect(() => {
    fetch("/api/session/start", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sessionType: "daily" }),
    })
      .then((r) => r.json())
      .then((data) => {
        setSessionId(data.sessionId);
        setDuration(data.duration || 300);
        setScenario(data.scenario || null);
      });
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

    router.push(`/report/${sessionId}`);
  }

  if (!sessionId) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p className="text-[var(--muted)]">Preparing session...</p>
      </div>
    );
  }

  if (assessing) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="w-8 h-8 border-2 border-[var(--accent)] border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
          <p className="text-[var(--muted)]">Analyzing your session...</p>
        </div>
      </div>
    );
  }

  return (
    <ConversationUI
      sessionId={sessionId}
      onSessionEnd={handleSessionEnd}
      duration={duration}
      initialPrompt={scenario?.openingMessage}
      systemPromptAddition={scenario?.systemPromptAddition}
    />
  );
}
