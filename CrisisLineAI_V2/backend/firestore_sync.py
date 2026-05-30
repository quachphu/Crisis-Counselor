"""
Firestore sync for CrisisLine AI v2.
Writes all bot activity to Firestore so the counselor dashboard
can display live transcripts, risk scores, eval metrics, and
auto-improve history.
"""
import os
import asyncio
from datetime import datetime, timezone

try:
    import firebase_admin
    from firebase_admin import credentials, firestore as firestore_admin

    if not firebase_admin._apps:
        service_account_path = os.getenv(
            "FIREBASE_SERVICE_ACCOUNT_PATH", "./firebase-service-account.json"
        )
        if os.path.exists(service_account_path):
            cred = credentials.Certificate(service_account_path)
            firebase_admin.initialize_app(cred)

    db = firestore_admin.client()
    FIREBASE_AVAILABLE = True
except Exception as e:
    db = None
    FIREBASE_AVAILABLE = False
    print(f"[firestore_sync] Firebase not available: {e}")


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


class FirestoreSync:
    def __init__(self, session_id: str):
        self.session_id = session_id
        self.turn_count = 0
        self.available = FIREBASE_AVAILABLE and db is not None

    async def init_session(self):
        if not self.available:
            return
        loop = asyncio.get_event_loop()
        await loop.run_in_executor(None, self._init_session_sync)

    def _init_session_sync(self):
        db.collection("chat_sessions").document(self.session_id).set(
            {
                "clientUid": self.session_id,
                "handlerMode": "ai",
                "channel": "voice",
                "riskLevel": "low",
                "emotionalState": "unknown",
                "startedAt": _now(),
                "lastUpdated": _now(),
                "status": "active",
                "promptVersion": self._get_current_prompt_version(),
            },
            merge=True,
        )

    async def write_transcript_turn(self, role: str, content: str):
        """Write a single transcript turn. role = 'user' | 'ai_counselor'"""
        if not self.available or not content.strip():
            return
        self.turn_count += 1
        loop = asyncio.get_event_loop()
        await loop.run_in_executor(None, self._write_turn_sync, role, content)

    def _write_turn_sync(self, role: str, content: str):
        db.collection("chat_messages").add(
            {
                "uid": "ai_counselor" if role == "ai_counselor" else self.session_id,
                "clientUid": self.session_id,
                "message": content,
                "source": role,
                "channelType": "voice",
                "turnIndex": self.turn_count,
                "createdAt": _now(),
            }
        )

    async def update_session_risk(self, risk_level: str, emotional_state: str):
        if not self.available:
            return
        loop = asyncio.get_event_loop()
        await loop.run_in_executor(
            None,
            lambda: db.collection("chat_sessions")
            .document(self.session_id)
            .set(
                {
                    "riskLevel": risk_level,
                    "emotionalState": emotional_state,
                    "lastUpdated": _now(),
                },
                merge=True,
            ),
        )

    async def log_eval_metric(
        self,
        empathy_score: float,
        brevity_score: float,
        safety_maintained: bool,
        turn_note: str = "",
        ai_response_text: str = "",
    ):
        """Log per-turn self-evaluation metric for the Session Intelligence panel."""
        if not self.available:
            return
        loop = asyncio.get_event_loop()
        await loop.run_in_executor(
            None,
            lambda: db.collection("eval_metrics").add(
                {
                    "sessionId": self.session_id,
                    "turnIndex": self.turn_count,
                    "empathyScore": empathy_score,
                    "brevityScore": brevity_score,
                    "safetyMaintained": safety_maintained,
                    "turnNote": turn_note,
                    "aiResponseText": ai_response_text,
                    "promptVersion": self._get_current_prompt_version(),
                    "createdAt": _now(),
                }
            ),
        )

    async def trigger_handoff(self, risk_level: str, reason: str, summary: str):
        if not self.available:
            return
        loop = asyncio.get_event_loop()
        await loop.run_in_executor(None, self._handoff_sync, risk_level, reason, summary)

    def _handoff_sync(self, risk_level: str, reason: str, summary: str):
        db.collection("chat_sessions").document(self.session_id).set(
            {
                "handlerMode": "counselor",
                "riskLevel": risk_level,
                "escalationReason": reason,
                "escalatedAt": _now(),
                "lastUpdated": _now(),
            },
            merge=True,
        )
        db.collection("case_cards").document(self.session_id).set(
            {
                "sessionId": self.session_id,
                "riskLevel": risk_level,
                "escalationReason": reason,
                "aiSummary": summary,
                "createdAt": _now(),
                "status": "pending_counselor",
                "promptVersion": self._get_current_prompt_version(),
            }
        )

    async def close_session(self):
        if not self.available:
            return
        loop = asyncio.get_event_loop()
        await loop.run_in_executor(
            None,
            lambda: db.collection("chat_sessions")
            .document(self.session_id)
            .set(
                {"status": "ended", "endedAt": _now(), "lastUpdated": _now()},
                merge=True,
            ),
        )

    def _get_current_prompt_version(self) -> str:
        try:
            doc = db.collection("prompt_versions").document("active").get()
            if doc.exists:
                return doc.to_dict().get("version", "v1")
        except Exception:
            pass
        return "v1"
