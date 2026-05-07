"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import Timer from "./timer";

interface Message {
  role: "user" | "assistant";
  content: string;
}

interface ConversationUIProps {
  sessionId: string;
  voice?: string;
  onSessionEnd: () => void;
  isOnboarding?: boolean;
  initialPrompt?: string;
}

export default function ConversationUI({ sessionId, voice = "af_sarah", onSessionEnd, isOnboarding, initialPrompt }: ConversationUIProps) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [state, setState] = useState<"idle" | "listening" | "recording" | "processing" | "speaking">("idle");
  const [timerRunning, setTimerRunning] = useState(false);
  const chatRef = useRef<HTMLDivElement>(null);

  const streamRef = useRef<MediaStream | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const playCtxRef = useRef<AudioContext | null>(null);
  const activeRef = useRef(false);
  const processingRef = useRef(false);
  const vadRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const noiseFloorRef = useRef(0);
  const isSpeakingRef = useRef(false);
  const silenceStartRef = useRef(0);
  const speechStartRef = useRef(0);

  const SILENCE_DURATION = 1500;
  const MIN_SPEECH_DURATION = 400;
  const SPEECH_MARGIN = 3.0;
  const NOISE_SAMPLES = 30;

  function addMessage(role: "user" | "assistant", content: string) {
    setMessages((prev) => [...prev, { role, content }]);
    fetch("/api/session/message", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sessionId, role, content }),
    });
  }

  function getRMS(): number {
    if (!analyserRef.current) return 0;
    const data = new Uint8Array(analyserRef.current.fftSize);
    analyserRef.current.getByteTimeDomainData(data);
    let sum = 0;
    for (let i = 0; i < data.length; i++) {
      const v = (data[i] - 128) / 128;
      sum += v * v;
    }
    return Math.sqrt(sum / data.length) * 100;
  }

  async function playTTS(text: string): Promise<void> {
    setState("speaking");
    if (!playCtxRef.current) playCtxRef.current = new AudioContext();
    if (playCtxRef.current.state === "suspended") await playCtxRef.current.resume();

    const ttsRes = await fetch("/api/ai/speak", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text, voice }),
    });

    const reader = ttsRes.body!.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    const audioQueue: AudioBuffer[] = [];
    let isPlaying = false;
    let totalChunks = 0;
    let playedChunks = 0;

    const playNext = async (): Promise<void> => {
      if (audioQueue.length === 0) { isPlaying = false; return; }
      isPlaying = true;
      const buf = audioQueue.shift()!;
      const src = playCtxRef.current!.createBufferSource();
      src.buffer = buf;
      src.connect(playCtxRef.current!.destination);
      await new Promise<void>((resolve) => {
        src.onended = () => { playedChunks++; resolve(); };
        src.start(0);
      });
      await playNext();
    };

    const processChunk = async (data: string) => {
      if (data === "[DONE]") return;
      try {
        const parsed = JSON.parse(data);
        totalChunks = parsed.total;
        const binary = atob(parsed.audio);
        const bytes = new Uint8Array(binary.length);
        for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
        const audioBuf = await playCtxRef.current!.decodeAudioData(bytes.buffer.slice(0));
        audioQueue.push(audioBuf);
        if (!isPlaying) await playNext();
      } catch (e) { console.error("Chunk error:", e); }
    };

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop()!;
      for (const line of lines) {
        if (line.startsWith("data: ")) await processChunk(line.slice(6));
      }
    }
    if (buffer.startsWith("data: ")) await processChunk(buffer.slice(6));
    while (isPlaying || playedChunks < totalChunks) {
      await new Promise((r) => setTimeout(r, 100));
    }
  }

  const startRecording = useCallback(() => {
    if (recorderRef.current?.state === "recording") return;
    chunksRef.current = [];
    const recorder = new MediaRecorder(streamRef.current!, { mimeType: "audio/webm;codecs=opus" });
    recorder.ondataavailable = (e) => { if (e.data.size > 0) chunksRef.current.push(e.data); };
    recorder.start(100);
    recorderRef.current = recorder;
  }, []);

  const processAudio = useCallback(async () => {
    if (!recorderRef.current || recorderRef.current.state !== "recording") return;
    processingRef.current = true;
    setState("processing");

    const blob = await new Promise<Blob>((resolve) => {
      recorderRef.current!.onstop = () => resolve(new Blob(chunksRef.current, { type: "audio/webm" }));
      recorderRef.current!.stop();
    });

    try {
      const form = new FormData();
      form.append("audio", blob, "recording.webm");
      const trRes = await fetch("/api/ai/transcribe", { method: "POST", body: form });
      const { text } = await trRes.json();

      if (!text?.trim()) {
        processingRef.current = false;
        setState("listening");
        return;
      }

      addMessage("user", text);

      const chatRes = await fetch("/api/ai/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text, session_id: sessionId }),
      });
      const { text: reply } = await chatRes.json();
      addMessage("assistant", reply);

      await playTTS(reply);
    } catch (err) {
      console.error("Pipeline error:", err);
    }

    processingRef.current = false;
    if (activeRef.current) {
      setState("listening");
      startVAD();
    }
  }, [sessionId, voice]);

  function startVAD() {
    if (vadRef.current) clearInterval(vadRef.current);
    vadRef.current = setInterval(() => {
      if (processingRef.current || !activeRef.current) return;
      const rms = getRMS();
      const now = Date.now();
      const speechThreshold = Math.max(noiseFloorRef.current * SPEECH_MARGIN, noiseFloorRef.current + 2);
      const silenceThreshold = Math.max(noiseFloorRef.current * 1.5, noiseFloorRef.current + 1);

      if (!isSpeakingRef.current && rms > speechThreshold) {
        isSpeakingRef.current = true;
        speechStartRef.current = now;
        silenceStartRef.current = 0;
        startRecording();
        setState("recording");
      } else if (isSpeakingRef.current && rms < silenceThreshold) {
        if (!silenceStartRef.current) silenceStartRef.current = now;
        if (now - silenceStartRef.current >= SILENCE_DURATION && now - speechStartRef.current >= MIN_SPEECH_DURATION) {
          isSpeakingRef.current = false;
          silenceStartRef.current = 0;
          if (vadRef.current) clearInterval(vadRef.current);
          processAudio();
        }
      } else if (isSpeakingRef.current && rms >= silenceThreshold) {
        silenceStartRef.current = 0;
      }
    }, 50);
  }

  async function sendInitialGreeting() {
    setState("processing");
    processingRef.current = true;

    try {
      const prompt = initialPrompt || "Start the conversation by introducing yourself briefly and asking the user a friendly question to get them talking.";
      const chatRes = await fetch("/api/ai/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: prompt, session_id: sessionId }),
      });
      const { text: reply } = await chatRes.json();
      addMessage("assistant", reply);

      await playTTS(reply);
    } catch (err) {
      console.error("Initial greeting error:", err);
    }

    processingRef.current = false;
    if (activeRef.current) {
      setState("listening");
      startVAD();
    }
  }

  async function startConversation() {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    streamRef.current = stream;

    const ctx = new AudioContext();
    const analyser = ctx.createAnalyser();
    analyser.fftSize = 2048;
    ctx.createMediaStreamSource(stream).connect(analyser);
    audioCtxRef.current = ctx;
    analyserRef.current = analyser;

    setState("processing");
    const samples: number[] = [];
    await new Promise<void>((resolve) => {
      const cal = setInterval(() => {
        samples.push(getRMS());
        if (samples.length >= NOISE_SAMPLES) {
          clearInterval(cal);
          const sorted = [...samples].sort((a, b) => a - b);
          noiseFloorRef.current = sorted[Math.floor(sorted.length * 0.8)];
          resolve();
        }
      }, 50);
    });

    activeRef.current = true;
    setTimerRunning(true);

    // AI speaks first with a greeting/question
    await sendInitialGreeting();
  }

  function endConversation() {
    activeRef.current = false;
    processingRef.current = false;
    setTimerRunning(false);
    if (vadRef.current) clearInterval(vadRef.current);
    if (streamRef.current) streamRef.current.getTracks().forEach((t) => t.stop());
    if (audioCtxRef.current) audioCtxRef.current.close();
    setState("idle");
    onSessionEnd();
  }

  useEffect(() => {
    if (chatRef.current) chatRef.current.scrollTop = chatRef.current.scrollHeight;
  }, [messages]);

  useEffect(() => {
    return () => {
      activeRef.current = false;
      if (vadRef.current) clearInterval(vadRef.current);
      if (streamRef.current) streamRef.current.getTracks().forEach((t) => t.stop());
    };
  }, []);

  const stateLabels: Record<string, { text: string; color: string }> = {
    idle: { text: "Ready", color: "text-gray-500" },
    listening: { text: "Listening...", color: "text-green-400" },
    recording: { text: "Hearing you...", color: "text-orange-400" },
    processing: { text: "Thinking...", color: "text-indigo-400" },
    speaking: { text: "Speaking...", color: "text-blue-400" },
  };

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-800">
        <span className={`text-sm font-medium ${stateLabels[state].color}`}>
          {stateLabels[state].text}
        </span>
        {timerRunning && (
          <Timer durationSeconds={300} onTimeUp={endConversation} running={timerRunning} />
        )}
      </div>

      <div ref={chatRef} className="flex-1 overflow-y-auto p-4 space-y-3">
        {messages.map((m, i) => (
          <div key={i} className={`max-w-[80%] px-4 py-3 rounded-2xl text-sm leading-relaxed ${
            m.role === "user"
              ? "ml-auto bg-indigo-600 text-white rounded-br-sm"
              : "bg-gray-800 text-gray-100 rounded-bl-sm"
          }`}>
            {m.content}
          </div>
        ))}
      </div>

      <div className="p-4 border-t border-gray-800 flex justify-center">
        {state === "idle" ? (
          <button
            onClick={startConversation}
            className="px-8 py-3 rounded-full bg-indigo-600 hover:bg-indigo-700 font-semibold transition"
          >
            Start Talking
          </button>
        ) : (
          <button
            onClick={endConversation}
            className="px-8 py-3 rounded-full border border-gray-600 hover:border-gray-400 text-gray-300 font-semibold transition"
          >
            End Session
          </button>
        )}
      </div>
    </div>
  );
}
