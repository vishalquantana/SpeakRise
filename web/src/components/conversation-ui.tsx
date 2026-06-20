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
  openingLine?: string;
  systemPromptAddition?: string;
  duration?: number;
}

export default function ConversationUI({ sessionId, voice = "af_sarah", onSessionEnd, isOnboarding, initialPrompt, openingLine, systemPromptAddition, duration = 300 }: ConversationUIProps) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [state, setState] = useState<"idle" | "listening" | "recording" | "processing" | "speaking">("idle");
  const [timerRunning, setTimerRunning] = useState(false);
  const [micError, setMicError] = useState("");
  const [pendingUser, setPendingUser] = useState(false);
  const [pendingAssistant, setPendingAssistant] = useState(false);
  const [pendingAudio, setPendingAudio] = useState(false);
  const [showTextInput, setShowTextInput] = useState(false);
  const [textInput, setTextInput] = useState("");
  const [textNotice, setTextNotice] = useState("");
  const chatRef = useRef<HTMLDivElement>(null);

  const streamRef = useRef<MediaStream | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const playCtxRef = useRef<AudioContext | null>(null);
  const activeRef = useRef(false);
  const processingRef = useRef(false);
  const textOnlyRef = useRef(false);
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

  async function playTTS(text: string, onFirstAudio?: () => void): Promise<void> {
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
    let streamDone = false;
    let firstAudioFired = false;

    const playNext = async (): Promise<void> => {
      if (audioQueue.length === 0) {
        isPlaying = false;
        return;
      }
      isPlaying = true;
      if (!firstAudioFired) {
        firstAudioFired = true;
        setState("speaking");
        onFirstAudio?.();
      }
      const buf = audioQueue.shift()!;
      const src = playCtxRef.current!.createBufferSource();
      src.buffer = buf;
      src.connect(playCtxRef.current!.destination);
      await new Promise<void>((resolve) => {
        src.onended = () => { playedChunks++; resolve(); };
        src.start(0);
      });
      // Continue playing next queued buffer
      if (audioQueue.length > 0) {
        await playNext();
      } else {
        isPlaying = false;
      }
    };

    const decodeAndQueue = async (data: string) => {
      if (data === "[DONE]") { streamDone = true; return; }
      try {
        const parsed = JSON.parse(data);
        totalChunks = parsed.total;
        const binary = atob(parsed.audio);
        const bytes = new Uint8Array(binary.length);
        for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
        const audioBuf = await playCtxRef.current!.decodeAudioData(bytes.buffer.slice(0));
        audioQueue.push(audioBuf);
        // Kick off playback if not already playing
        if (!isPlaying) playNext();
      } catch (e) { console.error("Chunk error:", e); }
    };

    // Read stream without blocking on playback
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop()!;
      for (const line of lines) {
        if (line.startsWith("data: ")) decodeAndQueue(line.slice(6));
      }
    }
    if (buffer.startsWith("data: ")) decodeAndQueue(buffer.slice(6));

    // Wait for all audio to finish playing
    while (!streamDone || isPlaying || playedChunks < totalChunks) {
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
    setPendingUser(true);

    const blob = await new Promise<Blob>((resolve) => {
      recorderRef.current!.onstop = () => resolve(new Blob(chunksRef.current, { type: "audio/webm" }));
      recorderRef.current!.stop();
    });

    try {
      const form = new FormData();
      form.append("audio", blob, "recording.webm");
      const trRes = await fetch("/api/ai/transcribe", { method: "POST", body: form });
      const { text } = await trRes.json();

      setPendingUser(false);

      if (!text?.trim()) {
        processingRef.current = false;
        if (activeRef.current) {
          setState("listening");
          startVAD();
        }
        return;
      }

      addMessage("user", text);

      setState("processing");
      setPendingAssistant(true);
      const chatRes = await fetch("/api/ai/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          text,
          session_id: sessionId,
          system_prompt_addition: systemPromptAddition,
          opening: openingLine,
        }),
      });
      const { text: reply } = await chatRes.json();

      // Reply text appears immediately; audio is generated in the background
      setPendingAssistant(false);
      addMessage("assistant", reply);
      setPendingAudio(true);

      await playTTS(reply, () => setPendingAudio(false));
    } catch (err) {
      console.error("Pipeline error:", err);
      // Auto-engage the text fallback so a transcribe/chat failure never
      // leaves the UI stuck without a way to continue the conversation.
      setShowTextInput(true);
      setTextNotice("Trouble hearing you. You can type your reply instead.");
    } finally {
      setPendingUser(false);
      setPendingAssistant(false);
      setPendingAudio(false);
      processingRef.current = false;
      if (activeRef.current) {
        setState("listening");
        startVAD();
      }
    }
  }, [sessionId, voice, systemPromptAddition, openingLine]);

  // Text fallback: route typed input through the SAME chat -> playTTS pipeline
  // used by transcribed speech, so a mic/transcribe failure never kills the demo.
  const sendTypedText = useCallback(async () => {
    const text = textInput.trim();
    if (!text || processingRef.current) return;

    setTextInput("");
    setTextNotice("");

    // Pause VAD/mic-driven flow while we handle the typed turn.
    processingRef.current = true;
    if (vadRef.current) clearInterval(vadRef.current);
    isSpeakingRef.current = false;
    silenceStartRef.current = 0;

    addMessage("user", text);

    setState("processing");
    setPendingAssistant(true);

    try {
      const chatRes = await fetch("/api/ai/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          text,
          session_id: sessionId,
          system_prompt_addition: systemPromptAddition,
          opening: openingLine,
        }),
      });
      const { text: reply } = await chatRes.json();

      setPendingAssistant(false);
      addMessage("assistant", reply);
      setPendingAudio(true);

      await playTTS(reply, () => setPendingAudio(false));
    } catch (err) {
      console.error("Typed pipeline error:", err);
      setTextNotice("Something went wrong sending that. Try typing it again.");
    } finally {
      setPendingAssistant(false);
      setPendingAudio(false);
      processingRef.current = false;
      if (activeRef.current) {
        setState("listening");
        // Only resume mic VAD when we actually have a live mic stream.
        if (!textOnlyRef.current) startVAD();
      } else {
        setState("idle");
      }
    }
  }, [textInput, sessionId, voice, systemPromptAddition, openingLine]);

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
      let reply: string;
      if (openingLine) {
        // Pre-written opening line: speak it verbatim (do not route through the LLM).
        reply = openingLine;
      } else {
        const prompt = initialPrompt || "Start the conversation by introducing yourself briefly and asking the user a friendly question to get them talking.";
        setPendingAssistant(true);
        const chatRes = await fetch("/api/ai/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ text: prompt, session_id: sessionId, system_prompt_addition: systemPromptAddition }),
        });
        reply = (await chatRes.json()).text;
        setPendingAssistant(false);
      }

      addMessage("assistant", reply);
      setPendingAudio(true);
      await playTTS(reply, () => setPendingAudio(false));
    } catch (err) {
      console.error("Initial greeting error:", err);
    }

    setPendingAssistant(false);
    setPendingAudio(false);
    processingRef.current = false;
    if (activeRef.current) {
      setState("listening");
      // In text-only fallback mode there is no mic stream to run VAD against.
      if (!textOnlyRef.current) startVAD();
    }
  }

  async function startConversation() {
    setMicError("");

    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch (err: any) {
      console.error("Mic access error:", err);
      if (err.name === "NotAllowedError" || err.name === "PermissionDeniedError") {
        setMicError("Microphone access denied. No problem — you can type your replies instead.");
      } else if (err.name === "NotFoundError") {
        setMicError("No microphone found. No problem — you can type your replies instead.");
      } else {
        setMicError(`Microphone unavailable (${err.message || "unknown error"}). No problem — you can type your replies instead.`);
      }
      // Auto-engage the text fallback so the conversation can still run without a mic.
      textOnlyRef.current = true;
      activeRef.current = true;
      setShowTextInput(true);
      setTextNotice("Type your message below and the coach will reply.");
      setTimerRunning(true);
      await sendInitialGreeting();
      return;
    }

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
    textOnlyRef.current = false;
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

  const stateConfig: Record<string, { text: string; color: string; pulse: boolean }> = {
    idle: { text: "Tap to start", color: "var(--muted)", pulse: false },
    listening: { text: "Your turn to speak", color: "var(--success)", pulse: true },
    recording: { text: "Hearing you...", color: "var(--accent)", pulse: true },
    processing: { text: "Thinking...", color: "var(--indigo)", pulse: true },
    speaking: { text: "Speaking...", color: "var(--gold)", pulse: true },
  };

  const currentState = stateConfig[state];
  const yourTurn = state === "listening" || state === "recording";

  return (
    <div className="flex flex-col h-screen bg-[var(--background)]">
      {/* Header with state + timer - sticky */}
      <div className="sticky top-0 z-10 flex items-center justify-between px-4 py-3 border-b border-[var(--card-border)] bg-white">
        <div className="flex items-center gap-2">
          <span
            className="w-3 h-3 rounded-full"
            style={{
              backgroundColor: currentState.color,
              animation: currentState.pulse ? "pulse 1.5s ease-in-out infinite" : "none",
            }}
          />
          <span className="text-sm font-medium" style={{ color: currentState.color }}>
            {currentState.text}
          </span>
        </div>
        {timerRunning && (
          <Timer duration={duration} running={timerRunning} onEnd={endConversation} />
        )}
      </div>

      {/* "Your turn to speak" prominent banner */}
      {yourTurn && (
        <div className="sticky top-[49px] z-10 flex items-center justify-center gap-2 py-2.5 bg-[var(--success)]/10 border-b border-[var(--success)]/30">
          <span className="text-base">🎤</span>
          <span className="text-sm font-semibold" style={{ color: "var(--success)" }}>
            {state === "recording" ? "Listening to you..." : "Your turn to speak"}
          </span>
        </div>
      )}

      {/* Chat messages */}
      <div ref={chatRef} className="flex-1 overflow-y-auto p-4 space-y-3">
        {messages.map((m, i) => (
          <div key={i} className={`max-w-[80%] px-4 py-3 rounded-2xl text-sm leading-relaxed ${
            m.role === "user"
              ? "ml-auto bg-[var(--accent)] text-white rounded-br-sm"
              : "bg-white border border-[var(--card-border)] text-[var(--foreground)] rounded-bl-sm"
          }`}>
            {m.content}
          </div>
        ))}

        {/* Pending user bubble: transcribing your speech (~5s) */}
        {pendingUser && (
          <div className="ml-auto max-w-[80%] px-4 py-3 rounded-2xl rounded-br-sm bg-[var(--accent)] text-white">
            <div className="flex items-center gap-2 text-xs font-medium opacity-90 mb-2">
              <span>Transcribing your speech...</span>
            </div>
            <div className="h-1.5 w-full rounded-full bg-white/30 overflow-hidden">
              <div className="h-full rounded-full bg-white/90" style={{ animation: "fill5 5s linear forwards" }} />
            </div>
          </div>
        )}

        {/* Pending assistant bubble: coach is thinking */}
        {pendingAssistant && (
          <div className="max-w-[80%] px-4 py-3 rounded-2xl rounded-bl-sm bg-white border border-[var(--card-border)]">
            <div className="flex items-center gap-2 text-xs font-medium text-[var(--muted)] mb-2">
              <span>Coach is thinking...</span>
            </div>
            <div className="h-1.5 w-full rounded-full bg-[var(--card-border)] overflow-hidden">
              <div className="h-full rounded-full bg-[var(--indigo)]" style={{ animation: "fill5 5s linear forwards" }} />
            </div>
          </div>
        )}

        {/* Preparing voice progress: text is shown, audio still generating (~10s) */}
        {pendingAudio && (
          <div className="max-w-[80%] px-4 py-2.5 rounded-2xl rounded-bl-sm bg-[var(--gold)]/10 border border-[var(--gold)]/30">
            <div className="flex items-center gap-2 text-xs font-medium mb-2" style={{ color: "var(--gold)" }}>
              <span>Preparing voice...</span>
            </div>
            <div className="h-1.5 w-full rounded-full bg-[var(--gold)]/20 overflow-hidden">
              <div className="h-full rounded-full bg-[var(--gold)]" style={{ animation: "fill10 10s linear forwards" }} />
            </div>
          </div>
        )}
      </div>

      {/* Visual audio indicator */}
      {state !== "idle" && (
        <div className="flex justify-center py-4">
          <div className="flex items-center gap-1">
            {[...Array(5)].map((_, i) => (
              <div
                key={i}
                className="w-1 rounded-full"
                style={{
                  backgroundColor: currentState.color,
                  height: state === "recording" ? `${12 + Math.random() * 20}px` : state === "speaking" ? `${8 + Math.random() * 16}px` : "6px",
                  transition: "height 0.15s ease",
                  animation: (state === "recording" || state === "speaking") ? `bar ${0.3 + i * 0.1}s ease-in-out infinite alternate` : "none",
                }}
              />
            ))}
          </div>
        </div>
      )}

      {/* Mic error / text-fallback notice */}
      {micError && (
        <div className="mx-4 mb-2 p-3 bg-[var(--accent-light)] border border-[var(--accent)] rounded-xl text-[var(--accent)] text-sm text-center">
          {micError}
        </div>
      )}

      {/* Inline notice when the text fallback is engaged */}
      {textNotice && (
        <div className="mx-4 mb-2 px-3 py-2 bg-[var(--indigo)]/10 border border-[var(--indigo)]/30 rounded-xl text-[var(--indigo)] text-sm text-center">
          {textNotice}
        </div>
      )}

      {/* Action area - sticky */}
      <div className="sticky bottom-0 z-10 p-4 border-t border-[var(--card-border)] bg-white">
        {/* Text fallback input: same chat -> playTTS pipeline as transcribed speech */}
        {state !== "idle" && showTextInput && (
          <form
            onSubmit={(e) => { e.preventDefault(); sendTypedText(); }}
            className="flex items-center gap-2 mb-3"
          >
            <input
              type="text"
              value={textInput}
              onChange={(e) => setTextInput(e.target.value)}
              placeholder="Type your reply..."
              autoFocus
              className="flex-1 px-4 py-2.5 rounded-full border border-[var(--card-border)] focus:border-[var(--accent)] outline-none text-sm text-[var(--foreground)]"
            />
            <button
              type="submit"
              disabled={!textInput.trim() || processingRef.current}
              className="px-5 py-2.5 rounded-full bg-[var(--accent)] hover:bg-[#B5502F] font-semibold text-white text-sm transition disabled:opacity-40 disabled:cursor-not-allowed"
            >
              Send
            </button>
          </form>
        )}

        <div className="flex items-center justify-center gap-4">
          {state === "idle" ? (
            <button
              onClick={startConversation}
              className="px-8 py-3 rounded-full bg-[var(--accent)] hover:bg-[#B5502F] font-semibold text-white transition shadow-sm"
            >
              Start Talking
            </button>
          ) : (
            <>
              {!textOnlyRef.current && (
                <button
                  type="button"
                  onClick={() => { setShowTextInput((v) => !v); setTextNotice(""); }}
                  className="text-sm font-medium text-[var(--muted)] hover:text-[var(--accent)] underline underline-offset-2 transition"
                >
                  {showTextInput ? "Hide typing" : "Type instead"}
                </button>
              )}
              <button
                onClick={endConversation}
                className="px-8 py-3 rounded-full border border-[var(--card-border)] hover:border-[var(--accent)] text-[var(--muted)] hover:text-[var(--accent)] font-semibold transition"
              >
                End Session
              </button>
            </>
          )}
        </div>
      </div>

      <style jsx>{`
        @keyframes pulse {
          0%, 100% { opacity: 1; transform: scale(1); }
          50% { opacity: 0.5; transform: scale(1.3); }
        }
        @keyframes bar {
          0% { height: 6px; }
          100% { height: 24px; }
        }
        @keyframes fill5 {
          0% { width: 0%; }
          80% { width: 90%; }
          100% { width: 95%; }
        }
        @keyframes fill10 {
          0% { width: 0%; }
          80% { width: 90%; }
          100% { width: 95%; }
        }
      `}</style>
    </div>
  );
}
