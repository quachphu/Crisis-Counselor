"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
	collection,
	doc,
	getDoc,
	onSnapshot,
	orderBy,
	query,
	serverTimestamp,
	setDoc,
	Timestamp,
	updateDoc,
	where,
} from "firebase/firestore";
import { db } from "@/lib/firebase";
import type { HandlerMode } from "@/lib/chat-types";
import SessionIntelligence from "@/app/components/couselor/SessionIntelligence";
import PromptEvolution from "@/app/components/couselor/PromptEvolution";

// ── Auth ─────────────────────────────────────────────────────────────────────

const ADMIN_USERS = [
	{ username: "khoi2104", password: "123", uid: "admin_khoi2104" },
	{ username: "syn", password: "123", uid: "admin_syn" },
	{ username: "phu", password: "123", uid: "admin_phu" },
];
const ADMIN_SESSION_KEY = "counselor_admin_session";
const ADMIN_UID_KEY = "admin_uid";

// ── Types ─────────────────────────────────────────────────────────────────────

type RiskLevel = "low" | "medium" | "high" | "critical";

type ActiveSession = {
	clientUid: string;
	riskLevel: RiskLevel;
	emotionalState: string;
	handlerMode: HandlerMode;
	promptVersion: string;
	startedAt?: string;
};

type TranscriptMessage = {
	id: string;
	uid: string;
	message: string;
	source: string;
	createdAt?: Timestamp | string;
};

// ── Helpers ───────────────────────────────────────────────────────────────────

function riskColor(level: RiskLevel) {
	switch (level) {
		case "critical":
			return { dot: "bg-[#ef4444] animate-pulse", badge: "bg-[#ef4444]/20 text-[#ef4444] border-[#ef4444]/30" };
		case "high":
			return { dot: "bg-[#f97316] animate-pulse", badge: "bg-[#f97316]/20 text-[#f97316] border-[#f97316]/30" };
		case "medium":
			return { dot: "bg-[#eab308]", badge: "bg-[#eab308]/20 text-[#eab308] border-[#eab308]/30" };
		default:
			return { dot: "bg-[#22c55e]", badge: "bg-[#22c55e]/20 text-[#22c55e] border-[#22c55e]/30" };
	}
}

function formatTime(ts: Timestamp | string | undefined): string {
	if (!ts) return "";
	const d = ts instanceof Timestamp ? ts.toDate() : new Date(ts as string);
	if (Number.isNaN(d.getTime())) return "";
	return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

// ── Login screen ──────────────────────────────────────────────────────────────

function LoginScreen({ onLogin }: { onLogin: (uid: string) => void }) {
	const [username, setUsername] = useState("");
	const [password, setPassword] = useState("");
	const [error, setError] = useState("");

	function handleSubmit(e: React.FormEvent) {
		e.preventDefault();
		const match = ADMIN_USERS.find(
			(u) => u.username === username && u.password === password,
		);
		if (match) {
			localStorage.setItem(ADMIN_SESSION_KEY, "true");
			localStorage.setItem(ADMIN_UID_KEY, match.uid);
			onLogin(match.uid);
		} else {
			setError("Invalid credentials.");
		}
	}

	return (
		<main className="flex min-h-screen items-center justify-center bg-[#080e17]">
			<form
				onSubmit={handleSubmit}
				className="w-full max-w-sm rounded-2xl border border-[#2a3545] bg-[#0f1724] p-7"
			>
				<div className="mb-6 flex items-center gap-3">
					<div className="flex h-10 w-10 items-center justify-center rounded-full bg-linear-to-br from-[#7c67ff] to-[#5b38f5]">
						<span className="text-base font-bold text-white">🆘</span>
					</div>
					<div>
						<h1 className="text-base font-bold text-white">CrisisLine AI</h1>
						<p className="text-xs text-[#8b93a7]">Counselor Dashboard · v2</p>
					</div>
				</div>
				<div className="space-y-3">
					<input
						type="text"
						placeholder="Username"
						value={username}
						onChange={(e) => setUsername(e.target.value)}
						className="w-full rounded-lg border border-[#2a3545] bg-[#0c1420] px-3 py-2.5 text-sm text-white placeholder:text-[#4a5568] outline-none focus:border-[#5b6fff]"
					/>
					<input
						type="password"
						placeholder="Password"
						value={password}
						onChange={(e) => setPassword(e.target.value)}
						className="w-full rounded-lg border border-[#2a3545] bg-[#0c1420] px-3 py-2.5 text-sm text-white placeholder:text-[#4a5568] outline-none focus:border-[#5b6fff]"
					/>
					<button
						type="submit"
						className="w-full rounded-lg bg-linear-to-b from-[#5b6fff] to-[#4f5dff] py-2.5 text-sm font-semibold text-white transition-opacity hover:opacity-90"
					>
						Sign in
					</button>
					{error && <p className="text-sm text-[#ef4444]">{error}</p>}
				</div>
			</form>
		</main>
	);
}

// ── Main dashboard ────────────────────────────────────────────────────────────

export default function CounselorPage() {
	const [isAuth, setIsAuth] = useState(false);
	const [adminUid, setAdminUid] = useState("");

	// Active sessions list + selected session
	const [sessions, setSessions] = useState<ActiveSession[]>([]);
	const [selectedUid, setSelectedUid] = useState<string>("");

	// Live transcript for selected session
	const [transcript, setTranscript] = useState<TranscriptMessage[]>([]);
	const transcriptEndRef = useRef<HTMLDivElement>(null);

	// Selected session's handler mode (live from Firestore)
	const [handlerMode, setHandlerMode] = useState<HandlerMode>("ai");
	const [isUpdatingMode, setIsUpdatingMode] = useState(false);

	// ── Bootstrap auth from localStorage ──────────────────────────────────
	useEffect(() => {
		if (localStorage.getItem(ADMIN_SESSION_KEY) === "true") {
			setIsAuth(true);
			setAdminUid(localStorage.getItem(ADMIN_UID_KEY) ?? "");
		}
	}, []);

	function handleLogin(uid: string) {
		setAdminUid(uid);
		setIsAuth(true);
	}

	function handleLogout() {
		localStorage.removeItem(ADMIN_SESSION_KEY);
		localStorage.removeItem(ADMIN_UID_KEY);
		setIsAuth(false);
		setAdminUid("");
		setSessions([]);
		setSelectedUid("");
		setTranscript([]);
	}

	// ── Listen for active sessions ─────────────────────────────────────────
	useEffect(() => {
		if (!db || !isAuth) return;
		const firestore = db;

		const q = query(
			collection(firestore, "chat_sessions"),
			where("status", "==", "active"),
			orderBy("startedAt", "desc"),
		);

		const unsub = onSnapshot(q, (snap) => {
			const docs: ActiveSession[] = snap.docs.map((d) => {
				const data = d.data();
				return {
					clientUid: d.id,
					riskLevel: (data.riskLevel as RiskLevel) ?? "low",
					emotionalState: data.emotionalState ?? "unknown",
					handlerMode: (data.handlerMode as HandlerMode) ?? "ai",
					promptVersion: data.promptVersion ?? "v3",
					startedAt: data.startedAt,
				};
			});
			setSessions(docs);
			if (!selectedUid && docs.length > 0) {
				setSelectedUid(docs[0].clientUid);
			}
		}, () => {
			// Fallback without ordering if index missing
			const fallbackQ = query(
				collection(firestore, "chat_sessions"),
				where("status", "==", "active"),
			);
			onSnapshot(fallbackQ, (snap) => {
				const docs: ActiveSession[] = snap.docs.map((d) => {
					const data = d.data();
					return {
						clientUid: d.id,
						riskLevel: (data.riskLevel as RiskLevel) ?? "low",
						emotionalState: data.emotionalState ?? "unknown",
						handlerMode: (data.handlerMode as HandlerMode) ?? "ai",
						promptVersion: data.promptVersion ?? "v3",
						startedAt: data.startedAt,
					};
				});
				setSessions(docs);
				if (!selectedUid && docs.length > 0) setSelectedUid(docs[0].clientUid);
			});
		});

		return () => unsub();
	}, [isAuth, selectedUid]);

	// ── Live transcript listener ───────────────────────────────────────────
	useEffect(() => {
		if (!db || !selectedUid) {
			setTranscript([]);
			return;
		}
		const firestore = db;

		const q = query(
			collection(firestore, "chat_messages"),
			where("clientUid", "==", selectedUid),
			orderBy("createdAt", "asc"),
		);

		const unsub = onSnapshot(q, (snap) => {
			const msgs: TranscriptMessage[] = snap.docs.map((d) => {
				const data = d.data();
				return {
					id: d.id,
					uid: data.uid ?? "",
					message: data.message ?? "",
					source: data.source ?? "",
					createdAt: data.createdAt,
				};
			});
			setTranscript(msgs);
		});

		return () => unsub();
	}, [selectedUid]);

	// Scroll transcript to bottom on new messages
	useEffect(() => {
		transcriptEndRef.current?.scrollIntoView({ behavior: "smooth" });
	}, [transcript]);

	// ── Live handler mode listener for selected session ────────────────────
	useEffect(() => {
		if (!db || !selectedUid) {
			setHandlerMode("ai");
			return;
		}
		const firestore = db;

		const unsub = onSnapshot(
			doc(firestore, "chat_sessions", selectedUid),
			(snap) => {
				if (!snap.exists()) {
					setHandlerMode("ai");
					return;
				}
				const mode = snap.data().handlerMode;
				setHandlerMode(mode === "counselor" ? "counselor" : "ai");
			},
		);

		return () => unsub();
	}, [selectedUid]);

	// ── Select session: sticky handlerMode fix ─────────────────────────────
	const handleSelectSession = useCallback(
		async (uid: string) => {
			setSelectedUid(uid);
			if (!db) return;
			const firestore = db;

			// Only reset to ai if NO case_card exists (not an escalated session)
			const caseCardDoc = await getDoc(doc(firestore, "case_cards", uid));
			if (!caseCardDoc.exists()) {
				try {
					await updateDoc(doc(firestore, "chat_sessions", uid), {
						handlerMode: "ai",
						changedBy: adminUid,
						changedAt: serverTimestamp(),
					});
				} catch {
					// Session doc may not exist yet — ignore
				}
			}
		},
		[adminUid],
	);

	// ── Take Over / Release ────────────────────────────────────────────────
	async function setHandlerModeRemote(mode: HandlerMode) {
		if (!db || !selectedUid) return;
		const firestore = db;
		setIsUpdatingMode(true);
		try {
			await setDoc(
				doc(firestore, "chat_sessions", selectedUid),
				{
					handlerMode: mode,
					changedBy: adminUid,
					changedAt: serverTimestamp(),
				},
				{ merge: true },
			);
		} finally {
			setIsUpdatingMode(false);
		}
	}

	// ── Derived: current session metadata ─────────────────────────────────
	const currentSession = useMemo(
		() => sessions.find((s) => s.clientUid === selectedUid) ?? null,
		[sessions, selectedUid],
	);

	const risk = currentSession?.riskLevel ?? "low";
	const { dot: riskDot, badge: riskBadge } = riskColor(risk);

	// ── Login guard ────────────────────────────────────────────────────────
	if (!isAuth) return <LoginScreen onLogin={handleLogin} />;

	// ── Dashboard ──────────────────────────────────────────────────────────
	return (
		<main className="flex h-screen flex-col overflow-hidden bg-[#080e17]">
			{/* Top header */}
			<header className="flex shrink-0 items-center justify-between border-b border-[#2a3545] bg-[#0c1420] px-6 py-3">
				<div className="flex items-center gap-3">
					<div className="flex h-8 w-8 items-center justify-center rounded-full bg-linear-to-br from-[#7c67ff] to-[#5b38f5]">
						<span className="text-sm font-bold text-white">🆘</span>
					</div>
					<div>
						<span className="text-sm font-bold text-white">CrisisLine AI</span>
						<span className="ml-2 text-xs text-[#4a5568]">Counselor Dashboard · v2</span>
					</div>
				</div>

				{/* Session selector */}
				<div className="flex items-center gap-3">
					{sessions.length > 0 ? (
						<select
							value={selectedUid}
							onChange={(e) => void handleSelectSession(e.target.value)}
							className="rounded-lg border border-[#2a3545] bg-[#0f1724] px-3 py-1.5 text-xs text-[#c9d1dc] outline-none focus:border-[#5b6fff]"
						>
							{sessions.map((s) => (
								<option key={s.clientUid} value={s.clientUid}>
									{s.clientUid.slice(0, 12)} · {s.riskLevel}
								</option>
							))}
						</select>
					) : (
						<span className="text-xs text-[#4a5568]">No active calls</span>
					)}
					<button
						type="button"
						onClick={handleLogout}
						className="rounded-lg border border-[#2a3545] px-3 py-1.5 text-xs text-[#8b93a7] hover:border-[#ef4444] hover:text-[#ef4444]"
					>
						Sign out
					</button>
				</div>
			</header>

			{/* 3-panel body */}
			<div className="grid min-h-0 flex-1 grid-cols-[35%_35%_30%]">

				{/* ── Panel A: Active Call ── */}
				<section className="flex flex-col overflow-hidden border-r border-[#2a3545]">
					{/* Panel header */}
					<div className="shrink-0 border-b border-[#2a3545] px-5 py-4">
						<div className="mb-1 flex items-center justify-between">
							<span className="text-xs font-bold uppercase tracking-wider text-[#8b93a7]">
								Active Call
							</span>
							{currentSession ? (
								<span className="flex items-center gap-1.5 text-[10px] font-semibold text-[#22c55e]">
									<span className="h-1.5 w-1.5 animate-pulse rounded-full bg-[#22c55e]" />
									LIVE
								</span>
							) : (
								<span className="text-[10px] text-[#4a5568]">No active call</span>
							)}
						</div>

						{currentSession && (
							<div className="flex items-center gap-2">
								{/* Risk badge */}
								<span
									className={`flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-bold uppercase ${riskBadge}`}
								>
									<span className={`h-1.5 w-1.5 rounded-full ${riskDot}`} />
									{risk}
								</span>
								{/* Emotional state */}
								<span className="text-xs text-[#8b93a7]">
									{currentSession.emotionalState}
								</span>
								{/* Prompt version */}
								<span className="ml-auto text-[10px] text-[#4a5568]">
									{currentSession.promptVersion}
								</span>
							</div>
						)}
					</div>

					{/* Counselor-active banner */}
					{handlerMode === "counselor" && (
						<div className="shrink-0 bg-[#7f1d1d] px-5 py-2 text-center text-xs font-bold uppercase tracking-wider text-[#fca5a5]">
							⚡ Counselor Active — AI paused
						</div>
					)}

					{/* Transcript */}
					<div className="min-h-0 flex-1 overflow-y-auto px-4 py-3">
						{transcript.length === 0 ? (
							<div className="flex h-full items-center justify-center">
								<p className="text-xs text-[#4a5568]">
									{selectedUid
										? "Waiting for transcript…"
										: "Select or wait for an active call."}
								</p>
							</div>
						) : (
							<div className="space-y-2">
								{transcript.map((msg) => {
									const isAI =
										msg.uid === "ai_counselor" || msg.source === "ai_counselor";
									return (
										<div
											key={msg.id}
											className={`flex ${isAI ? "justify-end" : "justify-start"}`}
										>
											<div
												className={`max-w-[85%] rounded-xl px-3 py-2 text-sm ${
													isAI
														? "bg-[#1e3a5f] text-[#bfdbfe]"
														: "bg-[#1a2332] text-[#c9d1dc]"
												}`}
											>
												<p className="mb-0.5 text-[10px] font-semibold opacity-60">
													{isAI ? "Lily (AI)" : "Caller"}
													{msg.createdAt && (
														<span className="ml-1.5">{formatTime(msg.createdAt as Timestamp)}</span>
													)}
												</p>
												<p className="leading-relaxed">{msg.message}</p>
											</div>
										</div>
									);
								})}
								<div ref={transcriptEndRef} />
							</div>
						)}
					</div>

					{/* Take Over / Release */}
					{currentSession && (
						<div className="shrink-0 border-t border-[#2a3545] p-4">
							{handlerMode === "ai" ? (
								<button
									type="button"
									disabled={isUpdatingMode}
									onClick={() => void setHandlerModeRemote("counselor")}
									className="w-full rounded-xl bg-linear-to-b from-[#5b6fff] to-[#4f5dff] py-2.5 text-sm font-bold text-white transition-opacity hover:opacity-90 disabled:opacity-50"
								>
									Take Over →
								</button>
							) : (
								<button
									type="button"
									disabled={isUpdatingMode}
									onClick={() => void setHandlerModeRemote("ai")}
									className="w-full rounded-xl border border-[#ef4444]/40 bg-[#7f1d1d]/30 py-2.5 text-sm font-bold text-[#fca5a5] transition-opacity hover:opacity-90 disabled:opacity-50"
								>
									Release to AI
								</button>
							)}
						</div>
					)}
				</section>

				{/* ── Panel B: Session Intelligence ── */}
				<section className="overflow-hidden border-r border-[#2a3545]">
					<SessionIntelligence sessionId={selectedUid} />
				</section>

				{/* ── Panel C: Prompt Evolution ── */}
				<section className="overflow-hidden">
					<PromptEvolution />
				</section>
			</div>
		</main>
	);
}
