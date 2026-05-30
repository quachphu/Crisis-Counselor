import os
import uuid

from fastapi import APIRouter, Request, WebSocket
from fastapi.responses import Response
from app.service.twilio_service import stream_and_transcribe
from app.model.llm import Model
from app.dependencies.model import get_model

twilio_router = APIRouter()


@twilio_router.post("/call")
async def twilio_voice(request: Request):
    """
    Twilio webhook — called when someone dials the crisis line.
    Routes audio to Pipecat Cloud via MediaStream.
    """
    call_session_id = str(uuid.uuid4())[:8]

    # Pipecat Cloud stream URL (set PIPECAT_STREAM_URL in .env)
    stream_url = os.getenv(
        "PIPECAT_STREAM_URL", "wss://api.pipecat.daily.co/ws/twilio"
    )
    org_name = os.getenv("PIPECAT_ORG_NAME", "")
    service_host = f"crisis-bot.{org_name}" if org_name else "crisis-bot"

    twiml = f"""<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Connect>
    <Stream url="{stream_url}">
      <Parameter name="_pipecatCloudServiceHost" value="{service_host}"/>
      <Parameter name="call_session_id" value="{call_session_id}"/>
    </Stream>
  </Connect>
</Response>"""
    return Response(content=twiml, media_type="text/xml")

@twilio_router.websocket("/stream")
async def twilio_stream(ws: WebSocket):
    model = ws.app.state.model
    await stream_and_transcribe(ws,model)
    