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
