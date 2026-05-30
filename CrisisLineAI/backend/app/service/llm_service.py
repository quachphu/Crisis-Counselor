from app.model.llm import Model
from dotenv import load_dotenv
load_dotenv()


async def get_response(user_input, session_id,model) -> dict:
    """
    Send a user message and get the AI counselor's reply.
    Conversation history is maintained per session_id.
    """
    response = await model.get_response(user_input=user_input,session_id=session_id)

    return {"response": response, "session_id": session_id}

async def stream_response(user_input: str, session_id: str,model):
    """
    Async generator — yields one text chunk at a time from the LLM.
    Each chunk is a small string (a word or partial word) as it's produced.
    """
    async for chunk in model.converse_stream(
        session_id=session_id, user_input=user_input
    ):
        if chunk:
            yield chunk

async def get_chat_history(session_id: str,model) -> list[dict]:
    """Return the full conversation history for a session."""
    history = model.get_session_history(session_id)
    def normalize_role(msg_type: str) -> str:
        if "ai" in msg_type.lower():
            return "ai"
        if "human" in msg_type.lower():
            return "Client"
        return msg_type
    return [{"role": normalize_role(msg.type), "content": msg.content} for msg in history.messages]

