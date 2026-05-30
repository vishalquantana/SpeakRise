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
