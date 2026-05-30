import threading, asyncio, base64,json
import assemblyai as aai
from assemblyai.streaming.v3 import (
    StreamingClient, StreamingClientOptions, StreamingParameters,
    StreamingEvents, BeginEvent, TurnEvent, TerminationEvent, StreamingError
)
from app.model.tts import stream_tts_from_llm

TWILIO_SAMPLE_RATE = 8000  
BYTES_PER_MS = TWILIO_SAMPLE_RATE // 1000  
BUFFER_MS = 100                            
BUFFER_BYTES = BUFFER_MS * BYTES_PER_MS     

class AssemblyAIStreamerTwilio(StreamingClient):
    def __init__(self, api_key: str,model,loop,ws,stream_sid,call_session_id="1"):
        super().__init__(StreamingClientOptions(api_key=api_key, api_host="streaming.assemblyai.com"))

        self.model = model
        self._ws = ws
        self._stream_sid = stream_sid
        self._call_session_id = call_session_id

        self.on(StreamingEvents.Begin, self.on_begin)
        self.on(StreamingEvents.Turn, self.on_turn)
        self.on(StreamingEvents.Termination, self.on_terminated)
        self.on(StreamingEvents.Error, self.on_error)

        self._buf = bytearray()
        self._lock = threading.Lock()
        self._loop = loop
        self._active = False
        self._tts_stop_event: asyncio.Event | None = None

    def start(self):
        params = StreamingParameters(
            sample_rate=TWILIO_SAMPLE_RATE,              
            encoding=aai.AudioEncoding.pcm_mulaw,        
            format_turns=True,
        )
        self._active = True
        self.connect(params)

    async def _send_greeting(self):
        """Send a greeting TTS message when the call begins."""
        async def greeting_tokens():
            yield '''Hello, welcome to CrisisLine, currently all crisis counselor are busy helping others!
                        My name is Lily, I will help you stay accompanied.
                        How can I help you today?'''
        try:
            async for audio_chunk in stream_tts_from_llm(greeting_tokens()):
                payload = base64.b64encode(audio_chunk).decode("utf-8")
                await self._ws.send_text(json.dumps({
                    "event": "media",
                    "streamSid": self._stream_sid,
                    "media": {"payload": payload},
                }))
            await self._ws.send_text(json.dumps({
                "event": "mark",
                "streamSid": self._stream_sid,
                "mark": {"name": "greeting_end"},
            }))
        except Exception as e:
            print(f"[AssemblyAI] greeting error: {e}")

    # ...existing code...

    # ---- callbacks ----
    def on_begin(self, client: "StreamingClient", event: BeginEvent):
        print(f"[AssemblyAI] Session started: {event.id}")
        asyncio.run_coroutine_threadsafe(self._send_greeting(), self._loop)

    def send_audio(self, mulaw_bytes: bytes):
        if not self._active:
            return

        with self._lock:
            self._buf.extend(mulaw_bytes)

            # flush in >=100ms chunks
            while len(self._buf) >= BUFFER_BYTES:
                chunk = bytes(self._buf[:BUFFER_BYTES])
                del self._buf[:BUFFER_BYTES]
                self.stream(chunk)  # v3: stream(bytes)

    def stop(self):
        self._active = False
        with self._lock:
            if self._buf:
                # only send remainder if it meets minimum (50ms = 400 bytes)
                if len(self._buf) >= 50 * BYTES_PER_MS:
                    self.stream(bytes(self._buf))
                self._buf.clear()
        self.disconnect(terminate=True)

    # ---- callbacks ----

    def on_turn(self, client: "StreamingClient", event: TurnEvent):
        txt = (event.transcript or "").strip()
        if not txt:
            return

        # ---- BARGE-IN: user started speaking → kill current TTS ----
        if not event.end_of_turn:
            if self._tts_stop_event is not None and not self._tts_stop_event.is_set():
                self._tts_stop_event.set()
                # Tell Twilio to flush any queued audio immediately
                asyncio.run_coroutine_threadsafe(
                    self._ws.send_text(json.dumps({
                        "event": "clear",
                        "streamSid": self._stream_sid,
                    })),
                    self._loop,
                )
                print(f"[Barge-in] Interrupted TTS — user said: {txt}")
            return

        # ---- END OF TURN: user finished speaking → start new TTS ----
        if event.turn_is_formatted:
            # Stop any still-running TTS stream
            if self._tts_stop_event is not None:
                self._tts_stop_event.set()
            # Fresh event for the new stream
            self._tts_stop_event = asyncio.Event()
            asyncio.run_coroutine_threadsafe(
                self._handle_turn(txt, self._call_session_id, self._tts_stop_event),
                self._loop,
            )

    async def _handle_turn(self, txt: str, session_id: str, stop: asyncio.Event):
        try:
            async for audio_chunk in stream_tts_from_llm(
                self.model.converse_stream(user_input=txt, session_id=session_id),
                stop_event=stop,
            ):
                payload = base64.b64encode(audio_chunk).decode("utf-8")
                await self._ws.send_text(json.dumps({
                    "event": "media",
                    "streamSid": self._stream_sid,
                    "media": {"payload": payload},
                }))

            # send once at end
            await self._ws.send_text(json.dumps({
                "event": "mark",
                "streamSid": self._stream_sid,
                "mark": {"name": "response_end"},
            }))
        except Exception as e:
            print(f"[AssemblyAI] converse_stream error: {e}")
            raise

    def on_terminated(self, client: "StreamingClient", event: TerminationEvent):
        print(f"[AssemblyAI] Session terminated ({event.audio_duration_seconds}s processed)")

    def on_error(self, client: "StreamingClient", error: StreamingError):
        print(f"[AssemblyAI] Error: {error}")