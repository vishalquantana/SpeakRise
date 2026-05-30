# Real-Time Voice Loop ("Calm Orb") — Design

- **Date:** 2026-05-30
- **Status:** Approved (brainstorming) → ready for implementation plan
- **Area:** `web/src/components/conversation-ui.tsx`, `ai-service/app.py`, session pages

## 1. Context & Problem

The live practice session (`conversation-ui.tsx`) runs a fully sequential pipeline per turn: Whisper transcribe → DeepSeek reply (full, non-streamed) → Kokoro TTS → playback. The frontend waits for the **entire** LLM reply as one JSON blob (`conversation-ui.tsx` `processAudio`, `await chatRes.json()`) before TTS starts, and the AI service calls DeepSeek with `stream: False` (`ai-service/app.py` `/chat`). The in-UI progress bars reflect ~5s transcribe + ~5s think + ~10s synth = **~20s of dead air per turn** — the opposite of natural conversation.

Separately, the live screen is a scrolling chat list plus an EQ bar plus banners competing for a small/phone-sized workspace, which feels cramped.

## 2. Goals

- Cut perceived per-turn latency from ~20s to ~3–4s by streaming the LLM and pipelining TTS sentence-by-sentence.
- Let the user interrupt the coach.
- Show the user's words quickly after they speak.
- Make session start feel instant.
- Replace the cramped chat UI with a single calm focal point.

## 3. Non-Goals (YAGNI)

- No WebSocket / full-duplex audio upload.
- No voice barge-in (talking over the coach); interrupt is **tap-only**.
- No word-by-word streaming STT; no on-device/browser speech recognition.
- No multi-user concurrency work beyond what exists today.
- `/chat` and `/speak` endpoints are **kept** (fallback / other callers); only the live loop moves to `/converse`.

## 4. Locked Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Session UI | **Calm Orb** — single breathing orb, one caption line, minimal chrome | Best fit for "wonderful in limited space"; showcases streaming + interrupt |
| Interrupt | **Tap to interrupt** | Rock-solid on any device; sidesteps speaker→mic echo / false triggers entirely |
| Live captions | **Optimistic reveal** — reveal Whisper transcript in one quick beat, no per-word | Private (local-only), zero extra load on the 1GB box |
| Pipeline wiring | **Combined SSE `/converse` endpoint** | Lowest latency, history stays server-side, interrupt = close the stream |
| Session start | **Speculative greeting** — pre-synthesize opening during mic/calibration | Coach talks the moment the orb appears |

## 5. Architecture

A single new SSE endpoint on the AI service, `POST /converse`, owns the live conversational turn and replaces the separate `/chat` + `/speak` round-trips for the live loop:

1. Append user text to server-side history (same `conversations` dict used today).
2. Call DeepSeek with `stream: True`.
3. Accumulate tokens; emit `text` delta events for the orb caption.
4. The instant a sentence boundary is detected, dispatch that sentence to Kokoro via the existing `tts_executor` thread pool.
5. Emit ordered `audio` events (base64 WAV) as each sentence's synthesis completes.
6. On completion, emit `done` with the final full text; append the assistant message to history.

The Next.js proxy route `/api/ai/converse` streams the SSE through unchanged (mirroring today's speak proxy). The frontend consumes `/converse`, renders the streaming coach caption under the orb, and plays audio chunks in order.

### SSE event schema (`data: <json>\n\n`)

```
{"type":"text","delta":"That's "}
{"type":"audio","index":0,"sentence":"That's great.","audio":"<base64 wav>"}
{"type":"done","text":"That's great. What made it hard?"}
{"type":"error","message":"..."}
```

Sentence count is **not** known up front (the LLM is still writing), so unlike today's `/speak-stream` there is no `total`. The client plays audio as it arrives; the turn ends when `done` is received **and** the audio queue has drained.

## 6. Components (small, isolated units)

1. **`sentence_streamer`** (server, Python) — async generator. Input: DeepSeek token stream. Output: `("text", delta)` and `("sentence", full_sentence)` tuples. Buffers tokens, flushes a sentence when `.!?`+boundary appears, flushes the remainder at stream end. Pure and unit-testable with a fake token iterator. Reuses the boundary logic from today's `split_sentences()`.
2. **`/converse` handler** (server) — wires DeepSeek stream → `sentence_streamer` → Kokoro thread pool → SSE generator. Owns history append and interrupt semantics (detects client disconnect).
3. **`/api/ai/converse` route** (Next proxy) — forwards the POST and pipes the SSE response body through.
4. **`useConverseStream`** (client hook) — POSTs the user text, parses the SSE event stream, exposes `{ coachText, done, error }` and an `abort()` (AbortController) for tap-to-interrupt.
5. **`useAudioQueue`** (client hook) — extracted from today's inline `playTTS` in `conversation-ui.tsx`. Wraps a single `AudioContext`; decodes and plays queued WAV chunks **in order**; exposes `enqueue(b64)` and `stop()`.
6. **`CalmOrb`** (client component) — the visual: orb + state-driven styling (idle / your-turn / hearing-you / speaking), the single caption line, and the full-surface tap target that triggers interrupt while speaking. Replaces the chat-list body of `conversation-ui.tsx`. VAD logic (`startVAD`, noise calibration, recorder) is retained and reused.
7. **`useSpeculativeGreeting`** (client) — given the opening text from session start, pre-synthesizes via `/api/ai/speak` and caches the audio buffers during the mic-permission + noise-calibration window.

## 7. Data Flow (one turn)

```
VAD detects end of speech
  → stop recorder, build webm blob
  → POST /api/ai/transcribe (Whisper)
  → optimistic reveal: show user text under the orb (one beat)
  → POST user text to /api/ai/converse
      → SSE: "text" deltas stream into the coach caption
      → SSE: "audio" chunks enqueue + play in order (useAudioQueue)
  → on "done": persist assistant message (/api/session/message)
  → orb returns to "Your turn"; VAD resumes
```

User message persistence (`/api/session/message`) for the user's turn happens right after transcription, as today.

## 8. Tap-to-Interrupt Semantics

- The orb surface is a tap target whenever state is `speaking` (and during `processing`).
- **Client:** on tap → `abort()` the `/converse` fetch (AbortController) and `stop()` the audio queue; transition immediately to `listening` (resume VAD).
- **Server:** the SSE generator checks `request.is_disconnected()` between steps; on disconnect it stops pulling DeepSeek and stops dispatching new sentences to Kokoro.
- **History truthfulness:** record the assistant turn as **only the sentences whose audio was actually emitted/played** (what the user heard). If nothing was spoken yet, drop the assistant turn entirely. This keeps the conversation history and downstream assessment accurate.

## 9. Speculative Greeting

`/session` already fetches session start, which returns the scenario `openingMessage` (`session/page.tsx`). As soon as that text is available, `useSpeculativeGreeting` pre-synthesizes it (via the existing `/api/ai/speak` per-sentence stream) and caches the decoded audio buffers. When the user taps **Start** (after mic permission granted and noise calibration completes), playback uses the cached buffers immediately instead of synthesizing on the spot.

- Onboarding / LLM-generated openings (no pre-written line): generated + spoken via `/converse` as a normal turn (with the initial-greeting prompt), kicked off during the mic-permission + calibration window so it overlaps with setup. Speculative pre-synthesis via `/speak` applies only to the **pre-written** scenario `openingMessage`, which is spoken verbatim.
- Failure: silently fall back to synth-on-Start (no user-visible change).

## 10. Error Handling

- **DeepSeek error mid-stream:** emit `error` SSE event; client shows a soft inline "let's try that again" and returns to listening. Any audio already played stays.
- **Kokoro synth failure on a sentence:** skip that sentence's audio (as today's `synthesize_sentence` returns `None`), keep the text, continue with later sentences.
- **Transcribe empty / failed:** silently resume listening (today's behavior).
- **Mic errors:** unchanged from today.
- **Speculative greeting failure:** fall back to synth-on-Start.
- **1GB VPS memory:** peak synthesis stays ~one sentence per user at a time (bounded by the existing `tts_executor`, `max_workers=4`), so streaming does not raise peak memory vs. today. Expose Whisper `beam_size` as a tunable to trade a little accuracy for faster transcribe if needed.

## 11. Testing

- **Unit — `sentence_streamer`:** feed a fake token iterator; assert sentence boundaries, mid-sentence partials, and end-of-stream flush of a punctuation-less remainder.
- **Unit — `useAudioQueue`:** mock `AudioContext`; assert in-order playback and that `stop()` halts and clears the queue.
- **Integration — `/converse`:** stub DeepSeek with a canned token stream + real Kokoro; assert SSE event order (text/audio interleave, `audio` indices ascending, `done` last) and that history records the full text on completion.
- **Integration — interrupt:** simulate client disconnect mid-stream; assert the server stops and history records only emitted sentences.
- **Manual (in browser, per `web/AGENTS.md`):** run dev, complete a session — confirm first audio ≤ ~4s, tap-to-interrupt cuts off instantly and returns to "Your turn", and the speculative greeting plays the moment Start is tapped. Watch for regressions in VAD turn-taking.

## 12. Files Touched

- `ai-service/app.py` — add `/converse` endpoint + streaming `sentence_streamer` helper (reuse `synthesize_sentence`, `tts_executor`, `conversations`).
- `web/src/app/api/ai/converse/route.ts` — **new** SSE proxy.
- `web/src/components/conversation-ui.tsx` — rebuild body as Calm Orb consuming `/converse`; extract `useAudioQueue` and `useConverseStream`; retain VAD/recorder logic.
- `web/src/app/session/page.tsx` (+ onboarding entry) — wire `useSpeculativeGreeting`.
- New small files for the hooks/components above (`use-audio-queue.ts`, `use-converse-stream.ts`, `calm-orb.tsx`, `use-speculative-greeting.ts` — exact paths decided in the plan).

## 13. Implementation Notes

- Per `web/AGENTS.md`, this Next.js version has breaking changes vs. common knowledge. The streaming route handler and any new server code must be written against `node_modules/next/dist/docs/`, not from memory.
- TTS output must remain emoji/symbol-free (existing system-prompt rule) since text is read aloud by Kokoro.
