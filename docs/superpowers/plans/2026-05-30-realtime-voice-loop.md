# Real-Time Voice Loop ("Calm Orb") Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Cut perceived per-turn latency in the live practice session from ~20s to ~3-4s by streaming the LLM reply sentence-by-sentence into pipelined TTS over one SSE endpoint, add tap-to-interrupt, optimistic transcript reveal, and a speculative greeting, behind a single calm-orb UI.

**Architecture:** A new `POST /converse` SSE endpoint on the FastAPI AI service streams DeepSeek tokens, splits them into sentences with a pure `streaming.py` module, synthesizes each finished sentence via the existing Kokoro thread pool, and emits ordered `text`/`audio`/`done` events. A Next.js passthrough proxy (`/api/ai/converse`) forwards the stream. The frontend consumes it with two small hooks (`useConverseStream` for SSE parsing, `useAudioQueue` for in-order WAV playback) behind a presentational `CalmOrb`. `conversation-ui.tsx` is rebuilt as the orchestrator, retaining all existing VAD/recorder/calibration logic. A `useSpeculativeGreeting` hook pre-synthesizes pre-written openings during mic calibration.

**Tech Stack:** FastAPI / Python 3.14 (stdlib-only streaming core, httpx for DeepSeek, Kokoro ONNX TTS, faster-whisper STT); Next.js 16.2.4 / React 19.2.4 / TypeScript; vitest (node env) for pure TS; pytest (no async plugin) for pure Python.

---

## Conventions

- **TDD where testable.** Pure logic (`streaming.py`, `converse-stream-core.ts`) is built test-first: write a failing test, run it red, implement, run it green, commit. DOM/network/React code (routes, hooks, components) cannot run under this repo's test setup (vitest is node-only, no jsdom; the AI service loads Whisper+Kokoro at import) — those tasks gate on a type-check and an explicit in-browser verification instead.
- **Commit after every task.** Stage only the files the task names (never `git add -A`).
- **Commit trailer.** Every commit message ends with this exact trailer:

  ```
  Generated with [Claude Code](https://claude.ai/code)
  via [Happy](https://happy.engineering)

  Co-Authored-By: Claude <noreply@anthropic.com>
  Co-Authored-By: Happy <yesreply@happy.engineering>
  ```

- **No emojis/symbols in any text that reaches Kokoro** (existing system-prompt rule — it is read aloud).
- **Next.js:** This repo pins Next 16.2.4 with breaking changes vs. common knowledge (`web/AGENTS.md`). The route handler in this plan mirrors the already-working `web/src/app/api/ai/speak/route.ts` exactly; do not invent new patterns.
- **Keep `/chat`, `/speak`, `/speak-stream` untouched** — they remain as fallback / other callers. Only the live loop moves to `/converse`.

## File Structure

**AI service (`ai-service/`):**
- `streaming.py` — **new.** Pure, stdlib-only streaming helpers: `_find_boundary`, `stream_sentences`, `converse_events`, `parse_deepseek_delta`. No model imports (keeps unit tests instant).
- `tests/test_streaming.py` — **new.** Pytest unit tests for `streaming.py` (async via `asyncio.run`, no plugin).
- `requirements-dev.txt`, `pytest.ini`, `.gitignore` — **new.** Test tooling (pytest only) + config.
- `app.py` — **modify.** Add `deepseek_tokens` (streaming DeepSeek client) and the `/converse` endpoint; import the two helpers from `streaming.py`.

**Web (`web/src/`):**
- `lib/converse-stream-core.ts` — **new.** Pure SSE chunk parser + `ConverseEvent` types.
- `lib/converse-stream-core.test.ts` — **new.** Vitest unit tests.
- `app/api/ai/converse/route.ts` — **new.** SSE passthrough proxy (mirrors speak route).
- `components/use-audio-queue.ts` — **new.** In-order WAV playback over one `AudioContext`.
- `components/use-converse-stream.ts` — **new.** POST + SSE parse + callbacks + abort.
- `components/use-speculative-greeting.ts` — **new.** Pre-synthesize the pre-written opening.
- `components/calm-orb.tsx` — **new.** Presentational orb (idle/listening/recording/processing/hearing/speaking) + tap-to-interrupt surface.
- `components/conversation-ui.tsx` — **rebuild.** Orchestrator: retains VAD/recorder/calibration, swaps the per-turn pipeline to `/converse`, renders `CalmOrb`.

`session/page.tsx` already passes `openingLine={scenario?.openingMessage}` and `onboarding/page.tsx` mounts `ConversationUI` with no opening (LLM greeting) — **no page changes required**; the rebuilt component handles both paths.

---

## Phase A — AI service streaming core (pure, TDD)

### Task 1: Python test harness

**Files:**
- Create: `ai-service/requirements-dev.txt`
- Create: `ai-service/pytest.ini`
- Create: `ai-service/.gitignore`
- Create: `ai-service/tests/test_streaming.py` (smoke test only, fleshed out in later tasks)

- [ ] **Step 1: Create the dev requirements** (test tooling only — the streaming core is pure stdlib, so it does not need the heavy runtime deps)

Create `ai-service/requirements-dev.txt`:

```
# Test tooling only. The streaming unit tests import ai-service/streaming.py,
# which is pure stdlib, so they do NOT need the runtime deps in requirements.txt.
pytest>=8.0
```

- [ ] **Step 2: Create pytest config**

Create `ai-service/pytest.ini`:

```ini
[pytest]
pythonpath = .
testpaths = tests
```

- [ ] **Step 3: Create gitignore so the test venv / caches are never committed**

Create `ai-service/.gitignore`:

```
.venv-test/
__pycache__/
.pytest_cache/
```

- [ ] **Step 4: Create a smoke test**

Create `ai-service/tests/test_streaming.py`:

```python
import asyncio


def collect(make_agen):
    """Drain an async generator (created by `make_agen()`) into a list."""
    async def run():
        return [x async for x in make_agen()]
    return asyncio.run(run())


async def _aiter(items):
    for it in items:
        yield it


def test_harness_works():
    assert collect(lambda: _aiter([1, 2, 3])) == [1, 2, 3]
```

- [ ] **Step 5: Create the venv and install pytest**

Run:
```bash
cd ai-service && python3.13 -m venv .venv-test && .venv-test/bin/pip install -q -r requirements-dev.txt
```
Expected: installs pytest with no errors. (Use `python3.13`, not the Homebrew `python3` which is 3.14 with a broken `pyexpat` that fails `ensurepip`. The streaming core is pure stdlib with no 3.14-only syntax, so the 3.13 test venv is equivalent.)

- [ ] **Step 6: Run the smoke test**

Run:
```bash
cd ai-service && .venv-test/bin/python -m pytest tests/test_streaming.py -v
```
Expected: PASS (`test_harness_works`).

- [ ] **Step 7: Commit**

```bash
git add ai-service/requirements-dev.txt ai-service/pytest.ini ai-service/.gitignore ai-service/tests/test_streaming.py
git commit -m "$(cat <<'EOF'
test: add pytest harness for ai-service streaming core

Generated with [Claude Code](https://claude.ai/code)
via [Happy](https://happy.engineering)

Co-Authored-By: Claude <noreply@anthropic.com>
Co-Authored-By: Happy <yesreply@happy.engineering>
EOF
)"
```

---

### Task 2: Sentence boundary detection + `stream_sentences`

**Files:**
- Create: `ai-service/streaming.py`
- Modify: `ai-service/tests/test_streaming.py`

- [ ] **Step 1: Write the failing tests**

Append to `ai-service/tests/test_streaming.py`:

```python
from streaming import _find_boundary, stream_sentences


def test_find_boundary_basic():
    # index just past the '.' (the following space stays in the buffer)
    assert _find_boundary("Hello. World") == 6


def test_find_boundary_none_without_punct():
    assert _find_boundary("Hello world") == -1


def test_find_boundary_none_when_punct_is_last_char():
    # No trailing whitespace yet -> could still be "..." mid-stream; wait.
    assert _find_boundary("Hello.") == -1


def test_stream_sentences_splits_on_boundaries():
    tokens = ["Hi", " there.", " How", " are", " you?", " Good"]
    out = collect(lambda: stream_sentences(_aiter(tokens)))
    sentences = [p for k, p in out if k == "sentence"]
    assert sentences == ["Hi there.", "How are you?", "Good"]


def test_stream_sentences_emits_raw_text_deltas():
    tokens = ["Hi", " there."]
    out = collect(lambda: stream_sentences(_aiter(tokens)))
    deltas = [p for k, p in out if k == "text"]
    assert deltas == ["Hi", " there."]


def test_stream_sentences_flushes_tail_without_punctuation():
    tokens = ["No", " punctuation", " here"]
    out = collect(lambda: stream_sentences(_aiter(tokens)))
    sentences = [p for k, p in out if k == "sentence"]
    assert sentences == ["No punctuation here"]


def test_stream_sentences_multiple_sentences_in_one_token():
    out = collect(lambda: stream_sentences(_aiter(["A. B. C."])))
    sentences = [p for k, p in out if k == "sentence"]
    assert sentences == ["A.", "B.", "C."]
```

- [ ] **Step 2: Run tests to verify they fail**

Run:
```bash
cd ai-service && .venv-test/bin/python -m pytest tests/test_streaming.py -v
```
Expected: FAIL with `ModuleNotFoundError: No module named 'streaming'`.

- [ ] **Step 3: Implement `streaming.py` (boundary + `stream_sentences`)**

Create `ai-service/streaming.py`:

```python
"""Pure streaming helpers for the /converse live loop.

No model imports here so this module stays cheap to import in unit tests
(app.py loads Whisper + Kokoro at import time).
"""

import base64
from collections.abc import AsyncIterator, Awaitable, Callable

_BOUNDARY_CHARS = ".!?"


def _find_boundary(buffer: str) -> int:
    """Index just past the first complete sentence in `buffer`, or -1.

    A boundary is a .!? character followed by whitespace. The returned index
    points just past the punctuation; the whitespace is left in the buffer for
    the caller to strip. Punctuation as the final character is NOT a boundary
    yet (it might be mid-token, e.g. an ellipsis still streaming).
    """
    for i in range(len(buffer) - 1):
        if buffer[i] in _BOUNDARY_CHARS and buffer[i + 1].isspace():
            return i + 1
    return -1


async def stream_sentences(
    tokens: AsyncIterator[str],
) -> AsyncIterator[tuple[str, str]]:
    """Consume a token stream, yielding ("text", delta) for every token and
    ("sentence", text) each time a complete sentence is detected. At end of
    stream, flushes any remaining buffered text as a final ("sentence", text).
    """
    buffer = ""
    async for token in tokens:
        if not token:
            continue
        yield ("text", token)
        buffer += token
        while True:
            idx = _find_boundary(buffer)
            if idx == -1:
                break
            sentence = buffer[:idx].strip()
            buffer = buffer[idx:].lstrip()
            if sentence:
                yield ("sentence", sentence)
    tail = buffer.strip()
    if tail:
        yield ("sentence", tail)
```

- [ ] **Step 4: Run tests to verify they pass**

Run:
```bash
cd ai-service && .venv-test/bin/python -m pytest tests/test_streaming.py -v
```
Expected: PASS (all boundary + `stream_sentences` tests).

- [ ] **Step 5: Commit**

```bash
git add ai-service/streaming.py ai-service/tests/test_streaming.py
git commit -m "$(cat <<'EOF'
feat: add sentence-boundary token streamer for live voice loop

Generated with [Claude Code](https://claude.ai/code)
via [Happy](https://happy.engineering)

Co-Authored-By: Claude <noreply@anthropic.com>
Co-Authored-By: Happy <yesreply@happy.engineering>
EOF
)"
```

---

### Task 3: `converse_events` (text/audio/done assembly)

**Files:**
- Modify: `ai-service/streaming.py`
- Modify: `ai-service/tests/test_streaming.py`

- [ ] **Step 1: Write the failing tests**

Append to `ai-service/tests/test_streaming.py`:

```python
import base64 as _b64
from streaming import converse_events


def test_converse_events_order_indices_and_done():
    async def synth(sentence):
        return sentence.encode()  # fake WAV bytes

    out = collect(lambda: converse_events(_aiter(["One.", " Two."]), synth))
    assert out[-1]["type"] == "done"
    assert out[-1]["text"] == "One. Two."

    audio = [e for e in out if e["type"] == "audio"]
    assert [a["index"] for a in audio] == [0, 1]
    assert [a["sentence"] for a in audio] == ["One.", "Two."]
    assert _b64.b64decode(audio[0]["audio"]) == b"One."


def test_converse_events_skips_failed_synth_but_keeps_text():
    async def synth(sentence):
        return None if sentence == "Bad." else sentence.encode()

    out = collect(lambda: converse_events(_aiter(["Good.", " Bad.", " Fine."]), synth))
    audio = [e for e in out if e["type"] == "audio"]
    # Failed sentence has no audio event; indices stay contiguous.
    assert [a["sentence"] for a in audio] == ["Good.", "Fine."]
    assert [a["index"] for a in audio] == [0, 1]
    # done.text retains the full reply, including the un-synthesized sentence.
    assert out[-1]["text"] == "Good. Bad. Fine."
```

- [ ] **Step 2: Run tests to verify they fail**

Run:
```bash
cd ai-service && .venv-test/bin/python -m pytest tests/test_streaming.py -k converse_events -v
```
Expected: FAIL with `ImportError: cannot import name 'converse_events'`.

- [ ] **Step 3: Implement `converse_events`**

Append to `ai-service/streaming.py`:

```python
async def converse_events(
    tokens: AsyncIterator[str],
    synth: Callable[[str], Awaitable[bytes | None]],
) -> AsyncIterator[dict]:
    """Turn a token stream into ordered SSE payload dicts:

        {"type": "text",  "delta": ...}                         per token
        {"type": "audio", "index": i, "sentence": s, "audio": b64}  per sentence
        {"type": "done",  "text": full}                         once at the end

    `synth` synthesizes one sentence to WAV bytes (or None on failure, in which
    case that sentence's audio event is skipped but its text is still counted in
    `done.text`). Audio indices stay contiguous across skipped sentences.
    """
    sentences: list[str] = []
    index = 0
    async for kind, payload in stream_sentences(tokens):
        if kind == "text":
            yield {"type": "text", "delta": payload}
        else:  # "sentence"
            sentences.append(payload)
            wav = await synth(payload)
            if wav is not None:
                yield {
                    "type": "audio",
                    "index": index,
                    "sentence": payload,
                    "audio": base64.b64encode(wav).decode("ascii"),
                }
                index += 1
    yield {"type": "done", "text": " ".join(sentences).strip()}
```

- [ ] **Step 4: Run tests to verify they pass**

Run:
```bash
cd ai-service && .venv-test/bin/python -m pytest tests/test_streaming.py -v
```
Expected: PASS (all tests).

- [ ] **Step 5: Commit**

```bash
git add ai-service/streaming.py ai-service/tests/test_streaming.py
git commit -m "$(cat <<'EOF'
feat: assemble ordered text/audio/done events from sentence stream

Generated with [Claude Code](https://claude.ai/code)
via [Happy](https://happy.engineering)

Co-Authored-By: Claude <noreply@anthropic.com>
Co-Authored-By: Happy <yesreply@happy.engineering>
EOF
)"
```

---

### Task 4: `parse_deepseek_delta` (SSE line parsing)

**Files:**
- Modify: `ai-service/streaming.py`
- Modify: `ai-service/tests/test_streaming.py`

- [ ] **Step 1: Write the failing tests**

Append to `ai-service/tests/test_streaming.py`:

```python
from streaming import parse_deepseek_delta


def test_parse_deepseek_delta_extracts_content():
    line = 'data: {"choices":[{"delta":{"content":"Hi"}}]}'
    assert parse_deepseek_delta(line) == "Hi"


def test_parse_deepseek_delta_done_sentinel():
    assert parse_deepseek_delta("data: [DONE]") is None


def test_parse_deepseek_delta_blank_and_comment_lines():
    assert parse_deepseek_delta("") is None
    assert parse_deepseek_delta(": keep-alive") is None


def test_parse_deepseek_delta_role_only_delta_has_no_content():
    line = 'data: {"choices":[{"delta":{"role":"assistant"}}]}'
    assert parse_deepseek_delta(line) is None


def test_parse_deepseek_delta_malformed_json():
    assert parse_deepseek_delta("data: {not json") is None
```

- [ ] **Step 2: Run tests to verify they fail**

Run:
```bash
cd ai-service && .venv-test/bin/python -m pytest tests/test_streaming.py -k deepseek -v
```
Expected: FAIL with `ImportError: cannot import name 'parse_deepseek_delta'`.

- [ ] **Step 3: Implement `parse_deepseek_delta`**

Append to `ai-service/streaming.py` (add `import json` to the top imports first, so the import block becomes `import base64`, `import json`, then the `collections.abc` line):

```python
def parse_deepseek_delta(line: str) -> str | None:
    """Extract the content delta from one DeepSeek SSE line, or None.

    Handles the `data: {json}` framing, the terminal `data: [DONE]`, blank
    keep-alive / comment lines, role-only deltas, and malformed JSON.
    """
    if not line.startswith("data:"):
        return None
    data = line[len("data:"):].strip()
    if not data or data == "[DONE]":
        return None
    try:
        chunk = json.loads(data)
        return chunk["choices"][0]["delta"].get("content")
    except (json.JSONDecodeError, KeyError, IndexError, TypeError):
        return None
```

- [ ] **Step 4: Run tests to verify they pass**

Run:
```bash
cd ai-service && .venv-test/bin/python -m pytest tests/test_streaming.py -v
```
Expected: PASS (all tests, including the new deepseek ones).

- [ ] **Step 5: Commit**

```bash
git add ai-service/streaming.py ai-service/tests/test_streaming.py
git commit -m "$(cat <<'EOF'
feat: parse DeepSeek streaming SSE deltas

Generated with [Claude Code](https://claude.ai/code)
via [Happy](https://happy.engineering)

Co-Authored-By: Claude <noreply@anthropic.com>
Co-Authored-By: Happy <yesreply@happy.engineering>
EOF
)"
```

---

## Phase B — AI service `/converse` endpoint

### Task 5: `deepseek_tokens` + `/converse` handler

**Files:**
- Modify: `ai-service/app.py` (imports near top; new code after the `/chat` handler, before `/speak`)

This task wires the pure core into a live SSE endpoint. It cannot be unit-tested without loading Whisper+Kokoro (imported at module load) and a live DeepSeek key, so it gates on a syntax/import check plus a manual curl verification.

- [ ] **Step 1: Add the streaming-core import**

In `ai-service/app.py`, add this import immediately after `from kokoro_onnx import Kokoro`:

```python
from streaming import converse_events, parse_deepseek_delta
```

(`Request` is intentionally NOT imported — client disconnect is handled via asyncio task cancellation, not `is_disconnected()` polling.)

- [ ] **Step 2: Add the streaming DeepSeek client**

In `ai-service/app.py`, add this function immediately after `synthesize_sentence` (after its closing line, before the `@app.get("/")` index route):

```python
async def deepseek_tokens(messages: list[dict]):
    """Yield content deltas from a streaming DeepSeek chat completion."""
    async with httpx.AsyncClient(timeout=60.0) as client:
        async with client.stream(
            "POST",
            "https://api.deepseek.com/chat/completions",
            headers={"Authorization": f"Bearer {DEEPSEEK_API_KEY}"},
            json={"model": "deepseek-v4-flash", "messages": messages, "stream": True},
        ) as resp:
            async for line in resp.aiter_lines():
                delta = parse_deepseek_delta(line)
                if delta:
                    yield delta
```

- [ ] **Step 3: Add the `/converse` endpoint**

In `ai-service/app.py`, add this handler immediately after the `/chat` handler (after its `return {"text": assistant_text}` line, before `@app.post("/speak")`):

```python
@app.post("/converse")
async def converse(request: dict):
    """Live conversational turn: stream DeepSeek -> sentence -> Kokoro -> SSE.

    Emits text/audio/done events (see streaming.converse_events). On client
    disconnect the asyncio task is cancelled; the `finally` records only the
    sentences whose audio was actually emitted (what the user heard), so the
    server-side history stays truthful for downstream assessment.
    """
    session_id = request.get("session_id", "default")
    user_text = request["text"]
    base_prompt = request.get("system_prompt", SYSTEM_PROMPT)
    addition = request.get("system_prompt_addition")
    system_prompt = base_prompt + ("\n\nToday's scenario:\n" + addition if addition else "")
    opening = request.get("opening")
    voice = request.get("voice", "af_sarah")
    speed = request.get("speed", 1.0)

    if session_id not in conversations:
        conversations[session_id] = []
        if opening:
            conversations[session_id].append({"role": "assistant", "content": opening})

    conversations[session_id].append({"role": "user", "content": user_text})
    messages = [{"role": "system", "content": system_prompt}] + conversations[session_id][-20:]

    loop = asyncio.get_running_loop()

    async def synth(sentence: str):
        return await loop.run_in_executor(
            tts_executor, synthesize_sentence, sentence, voice, speed
        )

    async def event_stream():
        spoken: list[str] = []
        final_text: str | None = None
        try:
            async for event in converse_events(deepseek_tokens(messages), synth):
                if event["type"] == "audio":
                    spoken.append(event["sentence"])
                elif event["type"] == "done":
                    final_text = event["text"]
                yield f"data: {json.dumps(event)}\n\n"
        except Exception as e:  # noqa: BLE001 - report, never crash the stream
            print(f"/converse error: {e}")
            yield f'data: {json.dumps({"type": "error", "message": "stream failed"})}\n\n'
        finally:
            # final_text set => completed normally (full reply).
            # final_text None => interrupted/cancelled => only what was spoken.
            text = final_text if final_text is not None else " ".join(spoken).strip()
            if text:
                conversations[session_id].append({"role": "assistant", "content": text})

    return StreamingResponse(event_stream(), media_type="text/event-stream")
```

- [ ] **Step 4: Verify the module parses (syntax check, no model load)**

Run:
```bash
cd ai-service && .venv-test/bin/python -c "import ast; ast.parse(open('app.py').read()); print('app.py parses OK')"
```
Expected: `app.py parses OK`.

- [ ] **Step 5: Manual verification — live SSE round-trip**

Start the AI service in its normal environment (the one with `requirements.txt` installed and a valid `DEEPSEEK_API_KEY` in `ai-service/.env`):
```bash
cd ai-service && python3 app.py
```
Wait for `Kokoro loaded.` Then in another terminal:
```bash
curl -N -s -X POST http://localhost:8770/converse \
  -H "Content-Type: application/json" \
  -d '{"session_id":"manual-test","text":"Hi, I just finished a big project at work today."}' \
  | head -c 1200
```
Expected: a stream of `data: {...}` lines — several `{"type":"text",...}`, then `{"type":"audio","index":0,...}` (a long base64 string), ascending indices, and finally `{"type":"done","text":"..."}`. The first `audio` event should arrive within a few seconds, well before `done`.

- [ ] **Step 6: Commit**

```bash
git add ai-service/app.py
git commit -m "$(cat <<'EOF'
feat: add streaming /converse endpoint for the live voice loop

Streams DeepSeek tokens, splits into sentences, synthesizes each via the
Kokoro thread pool, and emits ordered text/audio/done SSE events. Records
only spoken sentences to history on interrupt.

Generated with [Claude Code](https://claude.ai/code)
via [Happy](https://happy.engineering)

Co-Authored-By: Claude <noreply@anthropic.com>
Co-Authored-By: Happy <yesreply@happy.engineering>
EOF
)"
```

---

## Phase C — Frontend SSE parser (pure, TDD)

### Task 6: `converse-stream-core.ts` parser

**Files:**
- Create: `web/src/lib/converse-stream-core.ts`
- Test: `web/src/lib/converse-stream-core.test.ts`

- [ ] **Step 1: Write the failing test**

Create `web/src/lib/converse-stream-core.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { parseSseChunk } from "./converse-stream-core";

describe("parseSseChunk", () => {
  it("parses a complete single event", () => {
    const { events, rest } = parseSseChunk('data: {"type":"text","delta":"Hi"}\n\n');
    expect(events).toEqual([{ type: "text", delta: "Hi" }]);
    expect(rest).toBe("");
  });

  it("parses multiple events in one chunk", () => {
    const buf =
      'data: {"type":"text","delta":"Hi"}\n\n' +
      'data: {"type":"audio","index":0,"sentence":"Hi.","audio":"AA=="}\n\n';
    const { events } = parseSseChunk(buf);
    expect(events.map((e) => e.type)).toEqual(["text", "audio"]);
  });

  it("carries a partial trailing line as rest", () => {
    const { events, rest } = parseSseChunk(
      'data: {"type":"text","delta":"Hi"}\n\ndata: {"type":"do',
    );
    expect(events).toEqual([{ type: "text", delta: "Hi" }]);
    expect(rest).toBe('data: {"type":"do');
  });

  it("reassembles a split event across two chunks via rest", () => {
    const first = parseSseChunk('data: {"type":"te');
    expect(first.events).toEqual([]);
    const second = parseSseChunk(first.rest + 'xt","delta":"Hi"}\n\n');
    expect(second.events).toEqual([{ type: "text", delta: "Hi" }]);
  });

  it("ignores [DONE] and blank lines", () => {
    const { events } = parseSseChunk("data: [DONE]\n\n\n");
    expect(events).toEqual([]);
  });

  it("ignores malformed JSON without throwing", () => {
    const { events } = parseSseChunk("data: {not json}\n\n");
    expect(events).toEqual([]);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run:
```bash
cd web && npm test -- converse-stream-core
```
Expected: FAIL — cannot resolve `./converse-stream-core`.

- [ ] **Step 3: Implement the parser**

Create `web/src/lib/converse-stream-core.ts`:

```ts
export type ConverseEvent =
  | { type: "text"; delta: string }
  | { type: "audio"; index: number; sentence: string; audio: string }
  | { type: "done"; text: string }
  | { type: "error"; message: string };

export interface ParsedSse {
  events: ConverseEvent[];
  rest: string;
}

/**
 * Parse a (possibly partial) accumulated SSE buffer into events plus any
 * trailing partial line. The caller prepends `rest` to the next network chunk:
 *
 *   buffer = rest + decoder.decode(value);
 *   const { events, rest } = parseSseChunk(buffer);
 *
 * Each frame here is a single `data: <json>` line. Splitting on "\n" and
 * popping the last element isolates an incomplete trailing line; blank lines
 * (frame separators), `[DONE]`, and malformed JSON are ignored.
 */
export function parseSseChunk(buffer: string): ParsedSse {
  const events: ConverseEvent[] = [];
  const lines = buffer.split("\n");
  const rest = lines.pop() ?? "";
  for (const raw of lines) {
    const line = raw.trim();
    if (!line.startsWith("data:")) continue;
    const data = line.slice("data:".length).trim();
    if (!data || data === "[DONE]") continue;
    try {
      const parsed = JSON.parse(data) as ConverseEvent;
      if (parsed && typeof parsed.type === "string") {
        events.push(parsed);
      }
    } catch {
      // ignore malformed / partially-buffered JSON
    }
  }
  return { events, rest };
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run:
```bash
cd web && npm test -- converse-stream-core
```
Expected: PASS (6 tests).

- [ ] **Step 5: Commit**

```bash
git add web/src/lib/converse-stream-core.ts web/src/lib/converse-stream-core.test.ts
git commit -m "$(cat <<'EOF'
feat: add SSE chunk parser for the converse stream

Generated with [Claude Code](https://claude.ai/code)
via [Happy](https://happy.engineering)

Co-Authored-By: Claude <noreply@anthropic.com>
Co-Authored-By: Happy <yesreply@happy.engineering>
EOF
)"
```

---

## Phase D — Frontend proxy route

### Task 7: `/api/ai/converse` SSE passthrough

**Files:**
- Create: `web/src/app/api/ai/converse/route.ts`

This mirrors the working `web/src/app/api/ai/speak/route.ts`, adding `signal: req.signal` so that when the browser aborts (tap-to-interrupt), the upstream `/converse` request is torn down and the AI service stops generating.

- [ ] **Step 1: Create the route**

Create `web/src/app/api/ai/converse/route.ts`:

```ts
import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/session";

const AI_URL = process.env.AI_SERVICE_URL || "http://localhost:8770";

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session.userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json();
  const res = await fetch(`${AI_URL}/converse`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal: req.signal,
  });

  return new NextResponse(res.body, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
}
```

- [ ] **Step 2: Type-check**

Run:
```bash
cd web && npx tsc --noEmit
```
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add web/src/app/api/ai/converse/route.ts
git commit -m "$(cat <<'EOF'
feat: add /api/ai/converse SSE passthrough proxy

Generated with [Claude Code](https://claude.ai/code)
via [Happy](https://happy.engineering)

Co-Authored-By: Claude <noreply@anthropic.com>
Co-Authored-By: Happy <yesreply@happy.engineering>
EOF
)"
```

---

## Phase E — Frontend hooks

These hooks are DOM/network-bound (`AudioContext`, `fetch`, streams) and cannot run under this repo's node-only vitest setup, so they gate on `npx tsc --noEmit` and are exercised in the Phase H browser verification. Their pure dependency — the SSE parser — is already unit-tested (Task 6).

### Task 8: `useAudioQueue` — in-order WAV playback

**Files:**
- Create: `web/src/components/use-audio-queue.ts`

Extracted and hardened from the inline `playTTS` queue in the old `conversation-ui.tsx`. Guarantees in-order playback even though `decodeAudioData` is async (serializes decodes through a promise chain) and supports instant `stop()` for interrupts (a generation counter discards in-flight decodes).

- [ ] **Step 1: Create the hook**

Create `web/src/components/use-audio-queue.ts`:

```ts
import { useCallback, useRef } from "react";

function base64ToArrayBuffer(b64: string): ArrayBuffer {
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes.buffer;
}

export interface AudioQueue {
  /** Create/resume the AudioContext. Call from a user gesture (e.g. Start tap). */
  start: () => void;
  /** Queue a base64 WAV chunk for in-order playback. */
  enqueue: (b64: string) => void;
  /** Stop playback immediately and clear the queue (and any in-flight decodes). */
  stop: () => void;
  /** Resolves once everything enqueued so far has decoded and finished playing. */
  whenDrained: () => Promise<void>;
}

export function useAudioQueue(): AudioQueue {
  const ctxRef = useRef<AudioContext | null>(null);
  const queueRef = useRef<AudioBuffer[]>([]);
  const playingRef = useRef(false);
  const sourceRef = useRef<AudioBufferSourceNode | null>(null);
  const decodeChainRef = useRef<Promise<void>>(Promise.resolve());
  const generationRef = useRef(0);
  const drainResolversRef = useRef<Array<() => void>>([]);

  const ctx = useCallback(() => {
    if (!ctxRef.current) ctxRef.current = new AudioContext();
    return ctxRef.current;
  }, []);

  const settleDrain = useCallback(() => {
    const resolvers = drainResolversRef.current;
    drainResolversRef.current = [];
    resolvers.forEach((r) => r());
  }, []);

  const playNext = useCallback(() => {
    const buffer = queueRef.current.shift();
    if (!buffer) {
      playingRef.current = false;
      settleDrain();
      return;
    }
    playingRef.current = true;
    const source = ctx().createBufferSource();
    source.buffer = buffer;
    source.connect(ctx().destination);
    source.onended = () => {
      if (sourceRef.current === source) sourceRef.current = null;
      playNext();
    };
    sourceRef.current = source;
    source.start();
  }, [ctx, settleDrain]);

  const start = useCallback(() => {
    const c = ctx();
    if (c.state === "suspended") void c.resume();
  }, [ctx]);

  const enqueue = useCallback(
    (b64: string) => {
      const c = ctx();
      const gen = generationRef.current;
      decodeChainRef.current = decodeChainRef.current.then(async () => {
        if (gen !== generationRef.current) return; // stopped since enqueue
        try {
          const buffer = await c.decodeAudioData(base64ToArrayBuffer(b64));
          if (gen !== generationRef.current) return; // stopped during decode
          queueRef.current.push(buffer);
          if (!playingRef.current) playNext();
        } catch (e) {
          console.error("[useAudioQueue] decode failed", e);
        }
      });
    },
    [ctx, playNext],
  );

  const stop = useCallback(() => {
    generationRef.current += 1;
    queueRef.current = [];
    if (sourceRef.current) {
      sourceRef.current.onended = null;
      try {
        sourceRef.current.stop();
      } catch {
        // already stopped
      }
      sourceRef.current = null;
    }
    playingRef.current = false;
    settleDrain();
  }, [settleDrain]);

  const whenDrained = useCallback(async () => {
    // Wait for all enqueued chunks to finish decoding/pushing first...
    await decodeChainRef.current;
    // ...then resolve immediately if idle, else when playback reaches empty.
    return new Promise<void>((resolve) => {
      if (!playingRef.current && queueRef.current.length === 0) {
        resolve();
        return;
      }
      drainResolversRef.current.push(resolve);
    });
  }, []);

  return { start, enqueue, stop, whenDrained };
}
```

- [ ] **Step 2: Type-check**

Run:
```bash
cd web && npx tsc --noEmit
```
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add web/src/components/use-audio-queue.ts
git commit -m "$(cat <<'EOF'
feat: add ordered audio queue hook for streamed TTS playback

Generated with [Claude Code](https://claude.ai/code)
via [Happy](https://happy.engineering)

Co-Authored-By: Claude <noreply@anthropic.com>
Co-Authored-By: Happy <yesreply@happy.engineering>
EOF
)"
```

---

### Task 9: `useConverseStream` — POST + parse + abort

**Files:**
- Create: `web/src/components/use-converse-stream.ts`

Wraps the `/api/ai/converse` POST, parses the SSE body with the tested `parseSseChunk`, dispatches typed callbacks, and exposes `abort()` (AbortController) for tap-to-interrupt.

- [ ] **Step 1: Create the hook**

Create `web/src/components/use-converse-stream.ts`:

```ts
import { useCallback, useRef } from "react";
import { parseSseChunk, type ConverseEvent } from "@/lib/converse-stream-core";

export interface ConverseParams {
  sessionId: string;
  text: string;
  systemPromptAddition?: string;
  opening?: string;
  voice?: string;
  speed?: number;
}

export interface ConverseCallbacks {
  onText?: (delta: string) => void;
  onAudio?: (b64: string, sentence: string, index: number) => void;
  onDone?: (fullText: string) => void;
  onError?: (message: string) => void;
}

function dispatch(ev: ConverseEvent, cb: ConverseCallbacks) {
  switch (ev.type) {
    case "text":
      cb.onText?.(ev.delta);
      break;
    case "audio":
      cb.onAudio?.(ev.audio, ev.sentence, ev.index);
      break;
    case "done":
      cb.onDone?.(ev.text);
      break;
    case "error":
      cb.onError?.(ev.message);
      break;
  }
}

export function useConverseStream() {
  const abortRef = useRef<AbortController | null>(null);

  const abort = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
  }, []);

  const converse = useCallback(
    async (params: ConverseParams, callbacks: ConverseCallbacks) => {
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;

      let res: Response;
      try {
        res = await fetch("/api/ai/converse", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            session_id: params.sessionId,
            text: params.text,
            system_prompt_addition: params.systemPromptAddition,
            opening: params.opening,
            voice: params.voice,
            speed: params.speed,
          }),
          signal: controller.signal,
        });
      } catch (e) {
        if ((e as Error).name !== "AbortError") callbacks.onError?.("network error");
        return;
      }

      if (!res.body) {
        callbacks.onError?.("no response body");
        return;
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      try {
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          const { events, rest } = parseSseChunk(buffer);
          buffer = rest;
          for (const ev of events) dispatch(ev, callbacks);
        }
      } catch (e) {
        if ((e as Error).name !== "AbortError") callbacks.onError?.("stream error");
      } finally {
        if (abortRef.current === controller) abortRef.current = null;
      }
    },
    [],
  );

  return { converse, abort };
}
```

- [ ] **Step 2: Type-check**

Run:
```bash
cd web && npx tsc --noEmit
```
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add web/src/components/use-converse-stream.ts
git commit -m "$(cat <<'EOF'
feat: add converse stream hook with tap-to-interrupt abort

Generated with [Claude Code](https://claude.ai/code)
via [Happy](https://happy.engineering)

Co-Authored-By: Claude <noreply@anthropic.com>
Co-Authored-By: Happy <yesreply@happy.engineering>
EOF
)"
```

---

## Phase F — Calm Orb UI

### Task 10: `CalmOrb` presentational component

**Files:**
- Create: `web/src/components/calm-orb.tsx`

Pure presentational component (props in, JSX out). Renders one breathing/pulsing orb, a single status line, a single caption, and — only while `state === "speaking"` — a full-surface tap target that fires `onInterrupt`. Ports the visual language from the approved `orb-states.html` mockup. Uses the existing CSS variables (`--accent`, `--success`, `--gold`, `--muted`, `--indigo`, `--card-border`, `--background`).

- [ ] **Step 1: Create the component**

Create `web/src/components/calm-orb.tsx`:

```tsx
"use client";

import type { ReactNode } from "react";

export type OrbState =
  | "idle"
  | "listening"
  | "recording"
  | "processing"
  | "hearing"
  | "speaking";

interface CalmOrbProps {
  state: OrbState;
  coachCaption: string;
  userTranscript: string;
  timeLabel?: ReactNode;
  micError?: string;
  onStart: () => void;
  onEnd: () => void;
  onInterrupt: () => void;
}

const META: Record<OrbState, { label: string; color: string }> = {
  idle: { label: "Ready", color: "var(--muted)" },
  listening: { label: "Your turn", color: "var(--success)" },
  recording: { label: "Hearing you", color: "var(--accent)" },
  processing: { label: "Thinking", color: "var(--indigo)" },
  hearing: { label: "Hearing you", color: "var(--accent)" },
  speaking: { label: "Speaking", color: "var(--gold)" },
};

export default function CalmOrb({
  state,
  coachCaption,
  userTranscript,
  timeLabel,
  micError,
  onStart,
  onEnd,
  onInterrupt,
}: CalmOrbProps) {
  const meta = META[state];
  const orbMotion =
    state === "speaking" ? "orb-pulse" : state === "idle" ? "orb-dim" : "orb-breathe";
  const showWave = state === "recording";
  const speaking = state === "speaking";

  let caption: ReactNode;
  if (state === "idle") caption = "Tap to start";
  else if (state === "hearing") caption = userTranscript ? `"${userTranscript}"` : "...";
  else if (state === "speaking") caption = coachCaption || "...";
  else if (state === "processing") caption = "...";
  else caption = "I'm listening...";

  return (
    <div className="flex flex-col h-screen bg-[var(--background)]">
      {/* status bar */}
      <div className="flex items-center justify-between px-4 py-3">
        <div className="flex items-center gap-2">
          <span
            className="w-2 h-2 rounded-full"
            style={{ backgroundColor: meta.color }}
          />
          <span className="text-xs font-bold" style={{ color: meta.color }}>
            {meta.label}
          </span>
        </div>
        <div className="text-xs text-[var(--muted)]">{timeLabel}</div>
      </div>

      {/* orb + caption */}
      <div className="flex-1 flex flex-col items-center justify-center px-8 relative">
        {speaking ? (
          <button
            type="button"
            onClick={onInterrupt}
            aria-label="Tap to interrupt"
            className="absolute inset-0 flex flex-col items-center justify-center px-8 cursor-pointer bg-transparent"
          >
            <div className={`orb ${orbMotion}`} />
            <p className="text-center text-base leading-relaxed mt-6 max-w-md text-[var(--foreground)]">
              {caption}
            </p>
            <span
              className="mt-4 text-[11px] font-bold px-3 py-1 rounded-full"
              style={{
                color: "var(--gold)",
                background: "rgba(217,164,65,.14)",
                border: "1px solid rgba(217,164,65,.45)",
              }}
            >
              tap anywhere to interrupt
            </span>
          </button>
        ) : (
          <>
            <div className={`orb ${orbMotion}`} />
            {showWave && (
              <div className="wave mt-3">
                {[0, 0.1, 0.2, 0.05, 0.15].map((d, i) => (
                  <i key={i} style={{ animationDelay: `${d}s` }} />
                ))}
              </div>
            )}
            <p
              className={`text-center text-base leading-relaxed mt-6 max-w-md ${
                state === "hearing" ? "text-[var(--foreground)]" : "text-[var(--muted)]"
              }`}
            >
              {caption}
            </p>
          </>
        )}
      </div>

      {micError && (
        <div className="mx-4 mb-2 p-3 bg-[var(--accent-light)] border border-[var(--accent)] rounded-xl text-[var(--accent)] text-sm text-center">
          {micError}
        </div>
      )}

      {/* footer action */}
      <div className="p-6 flex justify-center">
        {state === "idle" ? (
          <button
            type="button"
            onClick={onStart}
            className="px-8 py-3 rounded-full bg-[var(--accent)] hover:bg-[#B5502F] font-semibold text-white transition shadow-sm"
          >
            Start Talking
          </button>
        ) : (
          <button
            type="button"
            onClick={onEnd}
            className="px-8 py-2.5 rounded-full border border-[var(--card-border)] hover:border-[var(--accent)] text-[var(--muted)] hover:text-[var(--accent)] text-sm font-semibold transition"
          >
            End
          </button>
        )}
      </div>

      <style jsx>{`
        .orb {
          width: 132px;
          height: 132px;
          border-radius: 50%;
          background: radial-gradient(
            circle at 35% 30%,
            #f3c18b,
            #e8a06a 42%,
            #c2593c 78%
          );
        }
        .orb-dim {
          filter: grayscale(0.5) opacity(0.45);
        }
        .orb-breathe {
          animation: orb-breathe 3.2s ease-in-out infinite;
        }
        .orb-pulse {
          animation: orb-pulse 1.1s ease-in-out infinite;
          box-shadow: 0 0 0 10px rgba(194, 89, 60, 0.1),
            0 0 32px rgba(224, 160, 106, 0.6);
        }
        .wave {
          display: flex;
          gap: 3px;
          align-items: flex-end;
          height: 22px;
        }
        .wave i {
          width: 3px;
          background: var(--accent);
          border-radius: 2px;
          animation: orb-wave 0.8s ease-in-out infinite alternate;
        }
        @keyframes orb-breathe {
          0%,
          100% {
            transform: scale(1);
          }
          50% {
            transform: scale(1.05);
          }
        }
        @keyframes orb-pulse {
          0%,
          100% {
            transform: scale(1);
          }
          50% {
            transform: scale(1.07);
          }
        }
        @keyframes orb-wave {
          0% {
            height: 5px;
          }
          100% {
            height: 21px;
          }
        }
      `}</style>
    </div>
  );
}
```

- [ ] **Step 2: Type-check**

Run:
```bash
cd web && npx tsc --noEmit
```
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add web/src/components/calm-orb.tsx
git commit -m "$(cat <<'EOF'
feat: add CalmOrb presentational component

Generated with [Claude Code](https://claude.ai/code)
via [Happy](https://happy.engineering)

Co-Authored-By: Claude <noreply@anthropic.com>
Co-Authored-By: Happy <yesreply@happy.engineering>
EOF
)"
```

---

### Task 11: Rebuild `conversation-ui.tsx` as the orchestrator

**Files:**
- Modify (full rewrite): `web/src/components/conversation-ui.tsx`

Keeps the exact VAD / recorder / noise-calibration logic from the current file (`getRMS`, `startRecording`, `startVAD`, the calibration loop, the constants). Replaces the per-turn `chat` + `playTTS` pipeline with: transcribe → optimistic reveal → `/converse` streaming → ordered audio playback. Drives `CalmOrb`. Adds tap-to-interrupt and the speculative greeting. Public props are unchanged so `session/page.tsx` and `onboarding/page.tsx` keep working.

The speculative greeting hook used here is created in Task 12; create the file in that task. To keep this task independently type-checkable, **Task 12 must be applied together with this one before type-checking** (they are committed separately but the import is mutual). Apply Step 1 here, then Task 12 Step 1, then type-check both.

- [ ] **Step 1: Rewrite the component**

Replace the entire contents of `web/src/components/conversation-ui.tsx` with:

```tsx
"use client";

import { useEffect, useRef, useState } from "react";
import Timer from "./timer";
import CalmOrb, { type OrbState } from "./calm-orb";
import { useAudioQueue } from "./use-audio-queue";
import { useConverseStream } from "./use-converse-stream";
import { useSpeculativeGreeting } from "./use-speculative-greeting";

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

const DEFAULT_INIT_PROMPT =
  "Start the conversation by introducing yourself briefly and asking the user a friendly question to get them talking.";

const SILENCE_DURATION = 1500;
const MIN_SPEECH_DURATION = 400;
const SPEECH_MARGIN = 3.0;
const NOISE_SAMPLES = 30;

export default function ConversationUI({
  sessionId,
  voice = "af_sarah",
  onSessionEnd,
  initialPrompt,
  openingLine,
  systemPromptAddition,
  duration = 300,
}: ConversationUIProps) {
  const [state, setState] = useState<OrbState>("idle");
  const [timerRunning, setTimerRunning] = useState(false);
  const [micError, setMicError] = useState("");
  const [coachCaption, setCoachCaption] = useState("");
  const [userTranscript, setUserTranscript] = useState("");

  const {
    start: audioStart,
    enqueue: audioEnqueue,
    stop: audioStop,
    whenDrained: audioWhenDrained,
  } = useAudioQueue();
  const { converse, abort } = useConverseStream();
  const greeting = useSpeculativeGreeting(openingLine, voice);

  // Mic / VAD plumbing (retained from the previous implementation).
  const streamRef = useRef<MediaStream | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const activeRef = useRef(false);
  const processingRef = useRef(false);
  const vadRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const noiseFloorRef = useRef(0);
  const isSpeakingRef = useRef(false);
  const silenceStartRef = useRef(0);
  const speechStartRef = useRef(0);

  // Coach-turn bookkeeping for truthful persistence on interrupt.
  const coachSpokenRef = useRef<string[]>([]);
  const coachPersistedRef = useRef(false);
  const firstAudioRef = useRef(false);

  function addMessage(role: "user" | "assistant", content: string) {
    fetch("/api/session/message", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sessionId, role, content }),
    });
  }

  function persistCoach(text: string) {
    if (coachPersistedRef.current) return;
    coachPersistedRef.current = true;
    if (text.trim()) addMessage("assistant", text.trim());
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

  function startRecording() {
    if (recorderRef.current?.state === "recording") return;
    chunksRef.current = [];
    const recorder = new MediaRecorder(streamRef.current!, {
      mimeType: "audio/webm;codecs=opus",
    });
    recorder.ondataavailable = (e) => {
      if (e.data.size > 0) chunksRef.current.push(e.data);
    };
    recorder.start(100);
    recorderRef.current = recorder;
  }

  // One coach turn over /converse. Resolves after audio has drained and the
  // orb has returned to "listening" (unless the session was ended/interrupted).
  async function runTurn(userText: string) {
    coachSpokenRef.current = [];
    coachPersistedRef.current = false;
    firstAudioRef.current = false;
    setCoachCaption("");
    audioStart();

    await converse(
      {
        sessionId,
        text: userText,
        systemPromptAddition,
        opening: openingLine,
        voice,
      },
      {
        onText: (delta) => setCoachCaption((p) => p + delta),
        onAudio: (b64, sentence) => {
          coachSpokenRef.current.push(sentence);
          if (!firstAudioRef.current) {
            firstAudioRef.current = true;
            setState("speaking");
          }
          audioEnqueue(b64);
        },
        onDone: (full) => persistCoach(full),
        onError: () => setCoachCaption("Let's try that again."),
      },
    );

    await audioWhenDrained();
    // If the stream ended without a `done` (error after some audio), persist
    // whatever was actually spoken.
    if (!coachPersistedRef.current && coachSpokenRef.current.length) {
      persistCoach(coachSpokenRef.current.join(" "));
    }
    if (activeRef.current) {
      processingRef.current = false;
      setUserTranscript("");
      setCoachCaption("");
      setState("listening");
      startVAD();
    }
  }

  async function processAudio() {
    if (!recorderRef.current || recorderRef.current.state !== "recording") return;
    processingRef.current = true;
    setState("processing");

    const blob = await new Promise<Blob>((resolve) => {
      recorderRef.current!.onstop = () =>
        resolve(new Blob(chunksRef.current, { type: "audio/webm" }));
      recorderRef.current!.stop();
    });

    try {
      const form = new FormData();
      form.append("audio", blob, "recording.webm");
      const trRes = await fetch("/api/ai/transcribe", { method: "POST", body: form });
      const { text } = await trRes.json();

      if (!text?.trim()) {
        processingRef.current = false;
        if (activeRef.current) {
          setState("listening");
          startVAD();
        }
        return;
      }

      // Optimistic reveal: show the user's words for one beat before the coach.
      setUserTranscript(text);
      setState("hearing");
      addMessage("user", text);

      await runTurn(text);
    } catch (err) {
      console.error("Pipeline error:", err);
      setCoachCaption("Let's try that again.");
      processingRef.current = false;
      if (activeRef.current) {
        setState("listening");
        startVAD();
      }
    }
  }

  function startVAD() {
    if (vadRef.current) clearInterval(vadRef.current);
    vadRef.current = setInterval(() => {
      if (processingRef.current || !activeRef.current) return;
      const rms = getRMS();
      const now = Date.now();
      const speechThreshold = Math.max(
        noiseFloorRef.current * SPEECH_MARGIN,
        noiseFloorRef.current + 2,
      );
      const silenceThreshold = Math.max(
        noiseFloorRef.current * 1.5,
        noiseFloorRef.current + 1,
      );

      if (!isSpeakingRef.current && rms > speechThreshold) {
        isSpeakingRef.current = true;
        speechStartRef.current = now;
        silenceStartRef.current = 0;
        startRecording();
        setState("recording");
      } else if (isSpeakingRef.current && rms < silenceThreshold) {
        if (!silenceStartRef.current) silenceStartRef.current = now;
        if (
          now - silenceStartRef.current >= SILENCE_DURATION &&
          now - speechStartRef.current >= MIN_SPEECH_DURATION
        ) {
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
    processingRef.current = true;
    setCoachCaption("");
    audioStart();

    if (openingLine) {
      // Pre-written opening: speak verbatim, using the speculatively
      // pre-synthesized audio when available.
      coachPersistedRef.current = false;
      setCoachCaption(openingLine);
      setState("speaking");
      await greeting.playInto(audioEnqueue);
      persistCoach(openingLine);
      await audioWhenDrained();
      if (activeRef.current) {
        processingRef.current = false;
        setState("listening");
        startVAD();
      }
    } else {
      // LLM-generated opening: stream it through /converse like a normal turn.
      await runTurn(initialPrompt || DEFAULT_INIT_PROMPT);
    }
  }

  async function startConversation() {
    setMicError("");
    greeting.prefetch(); // overlap synthesis with permission + calibration

    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch (err: unknown) {
      const e = err as { name?: string; message?: string };
      console.error("Mic access error:", e);
      if (e.name === "NotAllowedError" || e.name === "PermissionDeniedError") {
        setMicError(
          "Microphone access denied. Please allow microphone access in your browser settings and try again.",
        );
      } else if (e.name === "NotFoundError") {
        setMicError("No microphone found. Please connect a microphone and try again.");
      } else {
        setMicError(
          `Microphone error: ${e.message || "Unknown error"}. Check browser permissions.`,
        );
      }
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
    await sendInitialGreeting();
  }

  function interrupt() {
    if (state !== "speaking") return;
    abort();
    audioStop();
    if (!coachPersistedRef.current && coachSpokenRef.current.length) {
      persistCoach(coachSpokenRef.current.join(" "));
    }
    // runTurn's continuation (after converse resolves) returns to "listening".
  }

  function endConversation() {
    activeRef.current = false;
    processingRef.current = false;
    setTimerRunning(false);
    if (vadRef.current) clearInterval(vadRef.current);
    if (streamRef.current) streamRef.current.getTracks().forEach((t) => t.stop());
    if (audioCtxRef.current) audioCtxRef.current.close();
    abort();
    audioStop();
    setState("idle");
    onSessionEnd();
  }

  useEffect(() => {
    return () => {
      activeRef.current = false;
      if (vadRef.current) clearInterval(vadRef.current);
      if (streamRef.current) streamRef.current.getTracks().forEach((t) => t.stop());
      abort();
      audioStop();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <CalmOrb
      state={state}
      coachCaption={coachCaption}
      userTranscript={userTranscript}
      micError={micError}
      timeLabel={
        timerRunning ? (
          <Timer duration={duration} running={timerRunning} onEnd={endConversation} />
        ) : null
      }
      onStart={startConversation}
      onEnd={endConversation}
      onInterrupt={interrupt}
    />
  );
}
```

- [ ] **Step 2: Apply Task 12 Step 1** (create `use-speculative-greeting.ts`) so the import resolves, then return here.

- [ ] **Step 3: Type-check**

Run:
```bash
cd web && npx tsc --noEmit
```
Expected: no errors.

- [ ] **Step 4: Commit** (commit together with Task 12's hook file)

```bash
git add web/src/components/conversation-ui.tsx web/src/components/use-speculative-greeting.ts
git commit -m "$(cat <<'EOF'
feat: rebuild live session as streaming Calm Orb loop

Replaces the sequential transcribe/chat/TTS pipeline with the streaming
/converse loop behind CalmOrb: optimistic transcript reveal, sentence-level
audio playback, tap-to-interrupt, and a speculative greeting. Retains the
existing VAD, recorder, and noise-calibration logic.

Generated with [Claude Code](https://claude.ai/code)
via [Happy](https://happy.engineering)

Co-Authored-By: Claude <noreply@anthropic.com>
Co-Authored-By: Happy <yesreply@happy.engineering>
EOF
)"
```

---

## Phase G — Speculative greeting

### Task 12: `useSpeculativeGreeting`

**Files:**
- Create: `web/src/components/use-speculative-greeting.ts`

Pre-synthesizes the **pre-written** opening line via the existing `/api/ai/speak` per-sentence SSE stream during the mic-permission + calibration window, caching the base64 WAV chunks. `playInto` enqueues the cached chunks instantly (or, on cache miss, streams them live as a fallback). Returns `false` only when there is no opening line. This file is created here but committed with Task 11 (mutual import).

- [ ] **Step 1: Create the hook**

Create `web/src/components/use-speculative-greeting.ts`:

```ts
import { useCallback, useRef } from "react";

interface SpeakChunk {
  index: number;
  audio: string;
}

export function useSpeculativeGreeting(openingLine: string | undefined, voice: string) {
  const chunksRef = useRef<string[] | null>(null);
  const prefetchedRef = useRef(false);

  const fetchChunks = useCallback(async (): Promise<string[]> => {
    const res = await fetch("/api/ai/speak", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text: openingLine, voice }),
    });
    if (!res.body) return [];
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    const collected: SpeakChunk[] = [];
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";
      for (const line of lines) {
        if (!line.startsWith("data:")) continue;
        const data = line.slice("data:".length).trim();
        if (!data || data === "[DONE]") continue;
        try {
          const p = JSON.parse(data);
          if (typeof p.audio === "string") {
            collected.push({
              index: typeof p.index === "number" ? p.index : collected.length,
              audio: p.audio,
            });
          }
        } catch {
          // ignore malformed chunk
        }
      }
    }
    collected.sort((a, b) => a.index - b.index);
    return collected.map((c) => c.audio);
  }, [openingLine, voice]);

  const prefetch = useCallback(() => {
    if (!openingLine || prefetchedRef.current) return;
    prefetchedRef.current = true;
    fetchChunks()
      .then((c) => {
        chunksRef.current = c;
      })
      .catch((e) => {
        console.error("[speculativeGreeting] prefetch failed", e);
        chunksRef.current = null;
      });
  }, [openingLine, fetchChunks]);

  const playInto = useCallback(
    async (enqueue: (b64: string) => void): Promise<boolean> => {
      if (!openingLine) return false;
      let chunks = chunksRef.current;
      if (!chunks) {
        try {
          chunks = await fetchChunks();
        } catch {
          chunks = [];
        }
      }
      if (!chunks.length) return false;
      for (const b64 of chunks) enqueue(b64);
      return true;
    },
    [openingLine, fetchChunks],
  );

  return { prefetch, playInto };
}
```

- [ ] **Step 2: Type-check + commit**

This file's type-check and commit happen together with Task 11 (Task 11 Steps 3-4). After creating this file, run `cd web && npx tsc --noEmit` (expected: no errors) and then perform the Task 11 commit, which stages both files.

---

## Phase H — Integrated verification

### Task 13: Full-suite + in-browser verification

**Files:** none (verification only). Per `web/AGENTS.md`, frontend behavior is verified in a real browser.

- [ ] **Step 1: Run the full automated suites**

Run:
```bash
cd ai-service && .venv-test/bin/python -m pytest -v
```
Expected: all `test_streaming.py` tests PASS.

Run:
```bash
cd web && npm test
```
Expected: all vitest suites PASS (including `converse-stream-core` and the pre-existing `assessment-core` / `lessons-core`).

Run:
```bash
cd web && npm run build
```
Expected: production build succeeds (Next type-checks the whole app, including the new routes/hooks/components).

- [ ] **Step 2: Start both services**

Terminal 1:
```bash
cd ai-service && python3 app.py
```
Wait for `Kokoro loaded.`

Terminal 2:
```bash
cd web && npm run dev
```

- [ ] **Step 3: Verify a pre-written-opening session (scenario path)**

In the browser, log in and open `/session`. Then:

1. **Speculative greeting:** Tap **Start Talking**, grant mic. The coach's opening line should begin playing within ~1s of calibration finishing (audio was pre-synthesized during permission/calibration). The orb pulses gold with the opening caption.
2. **Latency:** When it returns to "Your turn" (green, breathing), speak one sentence and stop. Confirm the orb shows your transcribed words (accent, "Hearing you") within ~2s, and the **first coach audio plays within ~3-4s** of you finishing — not ~20s.
3. **Streaming caption:** The coach caption fills in as it speaks; audio plays sentence-by-sentence in order (no gaps out of order, no overlap).
4. **Tap-to-interrupt:** While the coach is speaking, tap anywhere on the orb. Audio must cut off immediately and the orb returns to "Your turn" within a beat. Speak again — the next turn should proceed normally and the coach's reply should reflect only what it actually said before the interruption (check the report later).
5. **VAD regression:** Confirm turn-taking still feels right — it waits for you to finish (~1.5s silence) before responding, and short noises don't trigger a turn.

- [ ] **Step 4: Verify an LLM-opening session (onboarding path)**

Open the onboarding flow that mounts `ConversationUI` with no `openingLine`. Confirm the coach still greets you (streamed via `/converse`) and the loop behaves as in Step 3. There is no speculative pre-synthesis here (expected — the opening is generated), but first audio should still arrive within a few seconds.

- [ ] **Step 5: Verify history/report integrity**

End a session (tap **End**). On the report page, confirm the transcript contains your turns and the coach's turns. For the session where you interrupted, confirm the coach turn shows only the sentences you actually heard (not the full un-spoken reply).

- [ ] **Step 6: Console + network check**

With dev tools open during a turn, confirm: one `POST /api/ai/converse` per turn streaming `text`/`audio`/`done` events; on interrupt the request shows as cancelled; no uncaught exceptions in the console.

- [ ] **Step 7: Final commit (only if Step 1 surfaced fixes)**

If the build/tests required any fixes, commit them:
```bash
git add <fixed files>
git commit -m "$(cat <<'EOF'
fix: address issues found in voice-loop integration verification

Generated with [Claude Code](https://claude.ai/code)
via [Happy](https://happy.engineering)

Co-Authored-By: Claude <noreply@anthropic.com>
Co-Authored-By: Happy <yesreply@happy.engineering>
EOF
)"
```

---

## Notes for the implementer

- **Latency budget:** First coach audio = transcribe (~2s with `beam_size=5`; lower it toward `1` in `app.py:/transcribe` if the 1GB VPS is slow) + first-sentence DeepSeek tokens + one Kokoro synth (~0.5-1s). Target ≤4s.
- **Memory:** Peak synthesis stays ~one sentence per user at a time (bounded by the existing `tts_executor`, `max_workers=4`); streaming does not raise peak memory vs. today.
- **Do not** remove or alter `/chat`, `/speak`, `/speak-stream`, or `playTTS`-style callers elsewhere; only the live session loop is migrated.
- **Deploy:** unchanged — `./deploy.sh` (rsync → build → systemctl). The new `streaming.py` is plain Python picked up by the rsync of `ai-service/`.

