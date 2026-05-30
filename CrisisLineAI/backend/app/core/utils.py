import websockets

def ws_connect_kwargs(headers: dict):
    """Handle websockets v11 vs v12+ header arg."""
    major = int(websockets.__version__.split(".")[0])
    if major >= 12:
        return {"additional_headers": headers}
    return {"extra_headers": headers}


async def buffer_to_phrases(token_stream, flush_chars=set(".?!\n"), max_chars=40):
    """
    Buffers token stream into phrase-ish chunks.
    This makes speech smoother than sending single tokens.
    """
    buf = ""
    async for tok in token_stream:
        buf += tok
        # flush on punctuation or when buffer gets long
        if any(c in tok for c in flush_chars) or len(buf) >= max_chars:
            yield buf
            buf = ""
    if buf.strip():
        yield buf