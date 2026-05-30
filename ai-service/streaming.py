"""Pure streaming helpers for the /converse live loop.

No model imports here so this module stays cheap to import in unit tests
(app.py loads Whisper + Kokoro at import time).
"""

import base64
import json
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
