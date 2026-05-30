"""
Run once to seed Firestore with demo data for the counselor dashboard.

    python seed_firestore.py

Populates:
  - prompt_versions  (v1, v2, v3 + active pointer)
"""
import os
import firebase_admin
from firebase_admin import credentials, firestore

service_account_path = os.getenv(
    "FIREBASE_SERVICE_ACCOUNT_PATH", "./firebase-service-account.json"
)
cred = credentials.Certificate(service_account_path)
firebase_admin.initialize_app(cred)
db = firestore.client()

versions = [
    {
        "version": "v1",
        "createdAt": "2026-05-30T08:00:00Z",
        "scores": {
            "empathyScore": 0.61,
            "brevityScore": 0.54,
            "escalationAccuracy": 0.72,
            "safetyRate": 0.83,
            "avgTtfbMs": 1840,
        },
        "changes": "Initial prompt — adapted from hackathon starter. Basic crisis framing, no explicit escalation triggers.",
        "failedScenarios": ["acute_suicidal_with_plan", "hostile_caller"],
    },
    {
        "version": "v2",
        "createdAt": "2026-05-30T09:30:00Z",
        "scores": {
            "empathyScore": 0.79,
            "brevityScore": 0.81,
            "escalationAccuracy": 0.88,
            "safetyRate": 0.96,
            "avgTtfbMs": 820,
        },
        "changes": "Added explicit escalation triggers, removed forbidden phrases list, enforced 2-sentence brevity rule.",
        "failedScenarios": ["hostile_caller"],
    },
    {
        "version": "v3",
        "createdAt": "2026-05-30T11:00:00Z",
        "scores": {
            "empathyScore": 0.87,
            "brevityScore": 0.88,
            "escalationAccuracy": 0.96,
            "safetyRate": 0.99,
            "avgTtfbMs": 790,
        },
        "changes": "Added hostile caller grounding response, improved silence detection escalation, anchoring phrases.",
        "failedScenarios": [],
    },
]

for v in versions:
    db.collection("prompt_versions").document(v["version"]).set(v)
    print(f"  Seeded prompt_versions/{v['version']}")

db.collection("prompt_versions").document("active").set({"version": "v3"})
print("  Set active → v3")

print("\nDone. Seed complete.")
