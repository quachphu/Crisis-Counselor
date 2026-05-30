import os, json, base64, asyncio
import dotenv
import websockets
from app.core.utils import ws_connect_kwargs, buffer_to_phrases

dotenv.load_dotenv()

XI_API_KEY = os.environ["XI_API_KEY"]
VOICE_ID = "pFZP5JQG7iQjIQuC4Bku"
MODEL_ID = "eleven_flash_v2_5"


def get_ws_url(output_format: str = "ulaw_8000") -> str:
    return (
        f"wss://api.elevenlabs.io/v1/text-to-speech/{VOICE_ID}/stream-input"
        f"?model_id={MODEL_ID}&output_format={output_format}&inactivity_timeout=180"
    )


async def stream_tts_from_llm(token_stream, output_format: str = "ulaw_8000", stop_event: asyncio.Event | None = None):
    """
    Async generator: yields raw audio chunks from ElevenLabs TTS.

    Args:
        token_stream: async iterable of LLM tokens
        output_format: "ulaw_8000" for Twilio, "pcm_16000" for local playback
        stop_event: if set, stops yielding and tears down the stream

    Yields:
        bytes: audio chunks in the requested format
    """
    headers = {"xi-api-key": XI_API_KEY}
    ws_url = get_ws_url(output_format)

    audio_queue: asyncio.Queue[bytes | None] = asyncio.Queue()

    async with websockets.connect(ws_url, **ws_connect_kwargs(headers)) as ws:
        # 1) init message
        await ws.send(json.dumps({
            "xi_api_key": XI_API_KEY,
            "text": " ",
            "voice_settings": {
                "stability": 0.1,
                "similarity_boost": 0.8,
                "speed": 1.0
            }
        }))

        async def sender():
            # 2) send buffered phrases as LLM generates
            async for phrase in buffer_to_phrases(token_stream):
                if phrase.strip():
                    await ws.send(json.dumps({"text": phrase}))
            # 3) end marker
            await ws.send(json.dumps({"text": ""}))

        async def receiver():
            # 4) receive audio chunks and put them in the queue
            while True:
                try:
                    msg = await ws.recv()
                except websockets.exceptions.ConnectionClosedOK:
                    break

                data = json.loads(msg)

                if data.get("audio"):
                    pcm = base64.b64decode(data["audio"])
                    await audio_queue.put(pcm)

                if data.get("isFinal") is True:
                    break

            await audio_queue.put(None)  # sentinel

        # Run sender and receiver concurrently
        sender_task = asyncio.ensure_future(sender())
        receiver_task = asyncio.ensure_future(receiver())

        # Yield audio chunks as they arrive
        try:
            while True:
                try:
                    chunk = await asyncio.wait_for(audio_queue.get(), timeout=0.2)
                except asyncio.TimeoutError:
                    if stop_event and stop_event.is_set():
                        break
                    continue
                if chunk is None:
                    break
                if stop_event and stop_event.is_set():
                    break
                yield chunk
        finally:
            sender_task.cancel()
            receiver_task.cancel()
            await asyncio.gather(sender_task, receiver_task, return_exceptions=True)