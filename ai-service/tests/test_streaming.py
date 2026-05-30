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
