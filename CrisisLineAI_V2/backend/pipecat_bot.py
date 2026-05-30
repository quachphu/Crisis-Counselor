"""
CrisisLine AI v2 — Pipecat voice bot.

Pipeline: Nemotron Speech STT → Nemotron-3-Super LLM → Gradium TTS
Falls back to Gradium STT + OpenAI GPT-4.1 if NVIDIA endpoints are unreachable.

Three LLM tools are registered:
  • trigger_handoff      — escalate to human counselor
  • update_risk_score    — update running risk assessment in Firestore
  • log_eval_metric      — per-turn self-evaluation (empathy / brevity / safety)

Transcript turns are written to Firestore (chat_messages) so the counselor
dashboard can display a live scrolling transcript.

Run locally:
    uv run pipecat_bot.py          (WebRTC at http://localhost:7860)

Deploy to Pipecat Cloud:
    pc cloud deploy                (reads pcc-deploy.toml)
"""

import asyncio
import os

from dotenv import load_dotenv
from loguru import logger

from pipecat.adapters.schemas.tools_schema import ToolsSchema
from pipecat.audio.vad.silero import SileroVADAnalyzer
from pipecat.frames.frames import EndTaskFrame, FunctionCallResultProperties, LLMRunFrame
from pipecat.pipeline.pipeline import Pipeline
from pipecat.pipeline.worker import PipelineParams, PipelineWorker
from pipecat.processors.aggregators.llm_context import LLMContext
from pipecat.processors.aggregators.llm_response_universal import (
    LLMContextAggregatorPair,
    LLMUserAggregatorParams,
)
from pipecat.processors.frame_processor import FrameDirection, FrameProcessor
from pipecat.runner.types import (
    RunnerArguments,
    SmallWebRTCRunnerArguments,
    WebSocketRunnerArguments,
)
from pipecat.runner.utils import parse_telephony_websocket
from pipecat.serializers.twilio import TwilioFrameSerializer
from pipecat.services.gradium.tts import GradiumTTSService
from pipecat.services.llm_service import FunctionCallParams
from pipecat.transports.base_transport import BaseTransport, TransportParams
from pipecat.transports.smallwebrtc.connection import SmallWebRTCConnection
from pipecat.transports.smallwebrtc.transport import SmallWebRTCTransport
from pipecat.transports.websocket.fastapi import FastAPIWebsocketParams, FastAPIWebsocketTransport
from pipecat.turns.user_turn_strategies import FilterIncompleteUserTurnStrategies
from pipecat.workers.runner import WorkerRunner

load_dotenv(override=True)

# ── System prompt ────────────────────────────────────────────────────────────

CRISIS_SYSTEM_PROMPT = """You are a compassionate AI crisis counselor for a 988-style \
mental health support line. Your role is to provide immediate emotional support while a \
human counselor becomes available if needed.

VOICE RULES — non-negotiable:
- Maximum 2 sentences per turn. No exceptions.
- Never use bullet points, lists, or headers — this is spoken audio.
- Speak naturally, like a calm human counselor. No robotic phrases.
- Do not say "I understand", "That must be hard", "I'm just an AI."

RESPONSE FRAMEWORK (every turn):
1. Acknowledge what you heard (1 phrase)
2. Validate the emotion (1 phrase)
3. Ask ONE gentle open question

ESCALATION — call trigger_handoff tool immediately if:
- Caller mentions a specific plan, method, or timeline for self-harm
- Caller mentions weapons, pills, or means of harm
- Caller says they are currently hurting themselves
- Caller requests a human or emergency services
- Caller goes silent for more than 8 seconds after a distressing statement

NEVER SAY:
- "It could be worse" / "Others have it harder"
- "You have so much to live for"
- "Why would you want to do that?"
- "Let me transfer you" (say "I'm connecting you with someone" instead)
- Any medical diagnosis or medication advice

SAFE ANCHORING PHRASES:
- "You reached out — that matters. I'm here."
- "Can we slow down together for a moment?"
- "What's happening for you right now, in this moment?"

TOOL USAGE (mandatory):
- Call update_risk_score every 3–4 turns with your current risk assessment.
- Call log_eval_metric after EVERY substantive response you give.
- Call trigger_handoff immediately when any escalation condition is met.
"""


# ── Transcript logger (frame processor) ─────────────────────────────────────

class TranscriptLogger(FrameProcessor):
    """
    Inserted between STT and user_aggregator to catch user speech frames,
    and between LLM and TTS to catch AI text frames.
    Writes both to Firestore via FirestoreSync.
    """

    def __init__(self, fs, role: str, context: LLMContext | None = None, **kwargs):
        super().__init__(**kwargs)
        self._fs = fs
        self._role = role  # "user" or "ai_counselor"
        self._context = context
        self._ai_buf = ""

    async def process_frame(self, frame, direction):
        await super().process_frame(frame, direction)
        if self._fs:
            try:
                from pipecat.frames.frames import TranscriptionFrame, TextFrame

                if self._role == "user" and isinstance(frame, TranscriptionFrame):
                    if getattr(frame, "text", "").strip():
                        asyncio.ensure_future(
                            self._fs.write_transcript_turn("user", frame.text.strip())
                        )
                elif self._role == "ai_counselor" and isinstance(frame, TextFrame):
                    text = getattr(frame, "text", "")
                    if text:
                        self._ai_buf += text
            except Exception:
                pass

        await self.push_frame(frame, direction)

    async def flush_ai_turn(self):
        """Call this after each LLM response to commit the buffered text."""
        if self._fs and self._ai_buf.strip():
            await self._fs.write_transcript_turn("ai_counselor", self._ai_buf.strip())
        self._ai_buf = ""


# ── Bot logic ────────────────────────────────────────────────────────────────

async def run_bot(
    transport: BaseTransport,
    session_id: str,
    audio_in_sample_rate: int = 16000,
    audio_out_sample_rate: int = 24000,
):
    logger.info(f"Starting crisis bot — session {session_id}")

    # ── Firestore sync (graceful if unavailable) ─────────────────────────
    try:
        from firestore_sync import FirestoreSync

        fs = FirestoreSync(session_id=session_id)
        logger.info("Firestore sync enabled")
    except Exception as e:
        fs = None
        logger.warning(f"Firestore not configured — running without persistence: {e}")

    # ── STT ──────────────────────────────────────────────────────────────
    try:
        from nvidia_stt import NVidiaWebSocketSTTService

        stt = NVidiaWebSocketSTTService(
            url=os.getenv("NVIDIA_ASR_URL", "ws://44.241.251.184:8080"),
            strip_interim_prefix=True,
        )
        logger.info("Using NVIDIA Nemotron STT")
    except Exception as e:
        logger.warning(f"NVIDIA STT unavailable ({e}), falling back to Gradium STT")
        from pipecat.services.gradium.stt import GradiumSTTService
        from pipecat.transcriptions.language import Language

        stt = GradiumSTTService(
            api_key=os.environ["GRADIUM_API_KEY"],
            settings=GradiumSTTService.Settings(language=Language.EN),
        )

    # ── LLM ──────────────────────────────────────────────────────────────
    try:
        from nemotron_llm import VLLMOpenAILLMService

        llm = VLLMOpenAILLMService(
            api_key=os.getenv("NEMOTRON_LLM_API_KEY", "EMPTY"),
            base_url=os.getenv(
                "NEMOTRON_LLM_URL",
                "http://nemotron-fleet-alb-1322439314.us-west-2.elb.amazonaws.com/v1",
            ),
            settings=VLLMOpenAILLMService.Settings(
                model=os.getenv("NEMOTRON_LLM_MODEL", "nvidia/nemotron-3-super"),
                system_instruction=CRISIS_SYSTEM_PROMPT,
                extra={
                    "extra_body": {
                        "chat_template_kwargs": {
                            "enable_thinking": os.getenv(
                                "NEMOTRON_ENABLE_THINKING", "false"
                            ).lower()
                            == "true"
                        }
                    }
                },
            ),
        )
        logger.info("Using NVIDIA Nemotron LLM")
    except Exception as e:
        logger.warning(f"Nemotron LLM unavailable ({e}), falling back to OpenAI")
        from pipecat.services.openai.llm import OpenAILLMService

        llm = OpenAILLMService(
            api_key=os.environ["OPENAI_API_KEY"],
            settings=OpenAILLMService.Settings(
                model="gpt-4.1",
                system_instruction=CRISIS_SYSTEM_PROMPT,
            ),
        )

    # ── TTS ──────────────────────────────────────────────────────────────
    tts = GradiumTTSService(
        api_key=os.environ["GRADIUM_API_KEY"],
        settings=GradiumTTSService.Settings(
            voice=os.getenv("GRADIUM_VOICE_ID", "_6Aslh2DxfmnRLmP"),
        ),
    )

    # ── Tool functions ────────────────────────────────────────────────────
    ai_logger = TranscriptLogger(fs=fs, role="ai_counselor", name="AITranscriptLogger")

    async def trigger_handoff(
        params: FunctionCallParams,
        risk_level: str,
        reason: str,
        summary: str,
    ) -> None:
        """Escalate to human counselor immediately."""
        logger.warning(f"[HANDOFF] risk={risk_level} reason={reason}")
        await ai_logger.flush_ai_turn()
        if fs:
            await fs.trigger_handoff(risk_level=risk_level, reason=reason, summary=summary)
        await params.result_callback(
            {"ok": True, "message": "Connecting you with a counselor now."},
            properties=FunctionCallResultProperties(run_llm=True),
        )

    async def update_risk_score(
        params: FunctionCallParams,
        risk_level: str,
        emotional_state: str,
        session_id: str = "",
    ) -> None:
        """Update the running risk assessment visible on the counselor dashboard."""
        logger.info(f"[RISK] level={risk_level} state={emotional_state}")
        if fs:
            await fs.update_session_risk(
                risk_level=risk_level, emotional_state=emotional_state
            )
        await params.result_callback({"ok": True})

    async def log_eval_metric(
        params: FunctionCallParams,
        empathy_score: float,
        brevity_score: float,
        safety_maintained: bool,
        turn_note: str = "",
    ) -> None:
        """Log a per-turn self-evaluation metric for the Session Intelligence panel."""
        ai_text = ai_logger._ai_buf.strip()
        await ai_logger.flush_ai_turn()
        if fs:
            await fs.log_eval_metric(
                empathy_score=empathy_score,
                brevity_score=brevity_score,
                safety_maintained=safety_maintained,
                turn_note=turn_note,
                ai_response_text=ai_text,
            )
        await params.result_callback({"ok": True})

    tool_functions = [trigger_handoff, update_risk_score, log_eval_metric]
    tools = ToolsSchema(standard_tools=tool_functions)
    for fn in tool_functions:
        llm.register_direct_function(fn)

    # ── Context ───────────────────────────────────────────────────────────
    context = LLMContext(tools=tools)
    user_aggregator, assistant_aggregator = LLMContextAggregatorPair(
        context,
        user_params=LLMUserAggregatorParams(
            vad_analyzer=SileroVADAnalyzer(),
            user_turn_strategies=FilterIncompleteUserTurnStrategies(),
        ),
    )
    ai_logger._context = context

    user_logger = TranscriptLogger(fs=fs, role="user", name="UserTranscriptLogger")

    # ── Pipeline ──────────────────────────────────────────────────────────
    pipeline = Pipeline(
        [
            transport.input(),
            stt,
            user_logger,        # capture user speech → Firestore
            user_aggregator,
            llm,
            ai_logger,          # accumulate AI text chunks
            tts,
            transport.output(),
            assistant_aggregator,
        ]
    )

    worker = PipelineWorker(
        pipeline,
        params=PipelineParams(
            enable_metrics=True,
            enable_usage_metrics=True,
            audio_in_sample_rate=audio_in_sample_rate,
            audio_out_sample_rate=audio_out_sample_rate,
        ),
    )

    @transport.event_handler("on_client_connected")
    async def on_client_connected(transport, client):
        logger.info(f"Caller connected — session {session_id}")
        if fs:
            await fs.init_session()
        context.add_message(
            {
                "role": "user",
                "content": (
                    "A caller has just connected. Greet them warmly: "
                    "'Hello, you've reached CrisisLine. My name is Lily — "
                    "I'm here with you while we connect you with a counselor. "
                    "How are you feeling right now?'"
                ),
            }
        )
        await worker.queue_frames([LLMRunFrame()])

    @transport.event_handler("on_client_disconnected")
    async def on_client_disconnected(transport, client):
        logger.info(f"Caller disconnected — session {session_id}")
        await ai_logger.flush_ai_turn()
        if fs:
            await fs.close_session()
        await worker.cancel()

    runner = WorkerRunner(handle_sigint=False)
    await runner.add_workers(worker)
    await runner.run()


# ── Entry point (Pipecat Cloud / local WebRTC) ───────────────────────────────

async def bot(runner_args: RunnerArguments):
    """Pipecat Cloud entry point — called once per inbound call."""
    import time

    session_id: str = f"local-{int(time.time())}"
    transport_overrides: dict = {}

    krisp_filter = None
    if os.environ.get("ENV") != "local":
        try:
            from pipecat.audio.filters.krisp_viva_filter import KrispVivaFilter

            krisp_filter = KrispVivaFilter()
        except Exception:
            pass

    match runner_args:
        case SmallWebRTCRunnerArguments():
            webrtc_connection: SmallWebRTCConnection = runner_args.webrtc_connection
            transport = SmallWebRTCTransport(
                webrtc_connection=webrtc_connection,
                params=TransportParams(
                    audio_in_enabled=True,
                    audio_in_filter=krisp_filter,
                    audio_out_enabled=True,
                ),
            )

        case WebSocketRunnerArguments():
            transport_overrides["audio_in_sample_rate"] = 8000
            transport_overrides["audio_out_sample_rate"] = 8000

            _, call_data = await parse_telephony_websocket(runner_args.websocket)
            session_id = call_data.get("call_id", session_id)

            serializer = TwilioFrameSerializer(
                stream_sid=call_data["stream_id"],
                call_sid=call_data["call_id"],
                account_sid=os.getenv("TWILIO_ACCOUNT_SID", ""),
                auth_token=os.getenv("TWILIO_AUTH_TOKEN", ""),
            )
            transport = FastAPIWebsocketTransport(
                websocket=runner_args.websocket,
                params=FastAPIWebsocketParams(
                    audio_in_enabled=True,
                    audio_in_filter=krisp_filter,
                    audio_out_enabled=True,
                    add_wav_header=False,
                    serializer=serializer,
                ),
            )

        case _:
            logger.error(f"Unsupported runner arguments: {type(runner_args)}")
            return

    await run_bot(transport, session_id=session_id, **transport_overrides)


if __name__ == "__main__":
    from pipecat.runner.run import main

    main()
