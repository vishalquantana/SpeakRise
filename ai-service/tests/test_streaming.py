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
