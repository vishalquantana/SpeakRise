"use client";

import { useEffect, useRef, useState } from "react";

export default function ReportTTS({ text }: { text: string }) {
  const [playing, setPlaying] = useState(false);
  const [autoPlayed, setAutoPlayed] = useState(false);
  const playCtxRef = useRef<AudioContext | null>(null);

  async function playTTS() {
    setPlaying(true);
    if (!playCtxRef.current) playCtxRef.current = new AudioContext();
    if (playCtxRef.current.state === "suspended") await playCtxRef.current.resume();

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
        const audioBytes = Uint8Array.from(atob(data.audio), c => c.charCodeAt(0));
        const audioBuffer = await playCtxRef.current!.decodeAudioData(audioBytes.buffer.slice(0));
        const source = playCtxRef.current!.createBufferSource();
        source.buffer = audioBuffer;
        source.connect(playCtxRef.current!.destination);
        source.start();
        await new Promise(r => setTimeout(r, audioBuffer.duration * 1000));
      }
    }
    setPlaying(false);
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
