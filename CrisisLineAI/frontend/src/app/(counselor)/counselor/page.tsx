"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
	addDoc,
	collection,
	doc,
	getDocs,
	limit,
	onSnapshot,
	orderBy,
	query,
	serverTimestamp,
	setDoc,
	Timestamp,
} from "firebase/firestore";
import CounselorSidebar, {
	type SidebarConversation,
	type SidebarTab,
} from "@/app/components/couselor/CounselorSidebar";
import CounselorChatPanel from "@/app/components/couselor/CounselorChatPanel";
import Transcript from "@/app/components/couselor/Transcript";
import TranscriptDetailView from "@/app/components/couselor/TranscriptDetailView";
import type { TranscriptSession } from "@/app/components/couselor/TranscriptDetailView";
import type { ChatMessageItem } from "@/app/components/chat/MessageList";
import type { RiskLevel } from "@/app/components/couselor/RiskBadge";
import type { HandlerMode } from "@/lib/chat-types";
import { db } from "@/lib/firebase";

// Admin credentials - multiple users supported
const ADMIN_USERS: { username: string; password: string; uid: string }[] = [
	{ username: "khoi2104", password: "123", uid: "admin_khoi2104" },
	{ username: "syn", password: "123", uid: "admin_syn" },
	{ username: "phu", password: "123", uid: "admin_phu" },
];

const ADMIN_SESSION_KEY = "counselor_admin_session";

type ChatMessage = {
	id: string;
	uid: string;
	clientUid?: string;
	message: string;
	createdAt?: Timestamp;
};

type ChatSessionControl = {
	clientUid: string;
	handlerMode: HandlerMode;
	changedBy?: string;
	changedAt?: Timestamp;
};

function inferClientUid(message: ChatMessage): string {
	if (message.clientUid?.trim()) {
		return message.clientUid;
	}

	const isAdmin = ADMIN_USERS.some((u) => u.uid === message.uid);
	if (!isAdmin) {
		return message.uid;
	}

	return "";
}

export default function CounselorPage() {
	const [isAdminAuthenticated, setIsAdminAuthenticated] = useState(false);
	const [adminUid, setAdminUid] = useState("");
	const [loginUsername, setLoginUsername] = useState("");
	const [loginPassword, setLoginPassword] = useState("");
	const [loginError, setLoginError] = useState("");
	const [selectedTab, setSelectedTab] = useState<SidebarTab>("chat");
	const [allMessages, setAllMessages] = useState<ChatMessage[]>([]);
	const [selectedClientUid, setSelectedClientUid] = useState("");
	const [draftMessage, setDraftMessage] = useState("");
	const [status, setStatus] = useState("Ready");
	const [isLoadingMessages, setIsLoadingMessages] = useState(false);
	const [isSending, setIsSending] = useState(false);
	const [selectedHandlerMode, setSelectedHandlerMode] = useState<HandlerMode>("ai");
	const [isUpdatingHandlerMode, setIsUpdatingHandlerMode] = useState(false);
	const [handlerModeStatus, setHandlerModeStatus] = useState("AI handles replies by default.");
	const [unreadCounts, setUnreadCounts] = useState<Record<string, number>>({});
	const [riskLevels, setRiskLevels] = useState<Record<string, RiskLevel>>({});
	const [selectedTranscriptSession, setSelectedTranscriptSession] = useState<TranscriptSession | null>(null);
	const [transcriptSessions, setTranscriptSessions] = useState<TranscriptSession[]>([]);
	const seenClientMessageIdsRef = useRef<Set<string>>(new Set());
	const didInitializeSeenClientMessagesRef = useRef(false);


	const timeFormatter = useMemo(
		() =>
			new Intl.DateTimeFormat(undefined, {
				hour: "numeric",
				minute: "2-digit",
			}),
		[],
	);

	useEffect(() => {
		if (window.localStorage.getItem(ADMIN_SESSION_KEY) === "true") {
			setIsAdminAuthenticated(true);
			const storedUid = window.localStorage.getItem("admin_uid") ?? "";
			setAdminUid(storedUid);
		}
	}, []);

	// ── Real-time Firestore listener for call_transcripts ──
	useEffect(() => {
		if (!db || !isAdminAuthenticated) return;
		const q = query(collection(db, "call_transcripts"), orderBy("createdAt", "desc"));
		const unsub = onSnapshot(
			q,
			(snapshot) => {
				const sessions: TranscriptSession[] = snapshot.docs.map((docSnap) => {
					const data = docSnap.data();
					const createdAt = data.createdAt as Timestamp | undefined;
					return {
						sessionId: docSnap.id,
						label: data.label ?? `Call Session ${docSnap.id}`,
						subtitle: `${(data.messages as unknown[])?.length ?? 0} messages`,
						dateLabel: createdAt
							? createdAt.toDate().toLocaleString("en-US", {
									month: "short",
									day: "numeric",
									hour: "numeric",
									minute: "2-digit",
							  })
							: undefined,
						messages: (data.messages as { role: string; content: string }[]) ?? [],							riskLevel: data.riskLevel as RiskLevel | undefined,					};
				});
				setTranscriptSessions(sessions);
			},
			(err) => {
				console.error("[Transcripts] onSnapshot error:", err);
			},
		);
		return () => unsub();
	}, [isAdminAuthenticated]);

	// ── Fetch all sessions from backend and commit to Firestore ──
	const fetchAndCommitTranscripts = useCallback(async () => {
		if (!db) throw new Error("Firestore not configured");

		// 1. Get all session IDs from backend
		const sessionsRes = await fetch("http://localhost:1000/llm/sessions");
		if (!sessionsRes.ok) throw new Error(`Failed to list sessions: ${sessionsRes.status}`);
		const { sessions: sessionIds } = (await sessionsRes.json()) as { sessions: string[] };

		// 2. For each session, fetch history and commit to Firestore
		for (const sessionId of sessionIds) {
			const historyRes = await fetch(`http://localhost:1000/llm/history/${sessionId}`);
			if (!historyRes.ok) continue;
			const data = await historyRes.json();
			const messages = data.messages ?? [];
			if (messages.length === 0) continue;

			// Fetch summary for this session (best-effort)
			let riskLevel: string | undefined;
			try {
				const summaryRes = await fetch(`http://localhost:1000/llm/summary/${sessionId}`);
				if (summaryRes.ok) {
					const summaryJson = await summaryRes.json();
					const raw = summaryJson.summary ?? summaryJson;
					if (typeof raw === "object" && raw.risk_level) {
						riskLevel = raw.risk_level.toLowerCase();
					}
				}
			} catch {
				// Summary fetch is best-effort
			}

			// Commit to Firestore (merge to avoid overwriting createdAt on re-fetch)
			await setDoc(
				doc(db, "call_transcripts", sessionId),
				{
					sessionId,
					label: `Call Session ${sessionId}`,
					messages,
					messageCount: messages.length,
					createdAt: serverTimestamp(),
					status: "ended",
					...(riskLevel ? { riskLevel } : {}),
				},
				{ merge: true },
			);
		}
	}, []);

	function isClientAuthoredMessage(message: ChatMessage): boolean {
		const isAdmin = ADMIN_USERS.some((user) => user.uid === message.uid);
		return !isAdmin && message.uid !== "ai_counselor";
	}

	function playNewMessageSound() {
		try {
			const AudioContextCtor = window.AudioContext ?? (window as Window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
			if (!AudioContextCtor) {
				return;
			}

			const context = new AudioContextCtor();
			const now = context.currentTime;

			const oscillatorA = context.createOscillator();
			const gainA = context.createGain();
			oscillatorA.type = "sine";
			oscillatorA.frequency.setValueAtTime(880, now);
			gainA.gain.setValueAtTime(0.0001, now);
			gainA.gain.exponentialRampToValueAtTime(0.05, now + 0.01);
			gainA.gain.exponentialRampToValueAtTime(0.0001, now + 0.18);
			oscillatorA.connect(gainA);
			gainA.connect(context.destination);
			oscillatorA.start(now);
			oscillatorA.stop(now + 0.18);

			const oscillatorB = context.createOscillator();
			const gainB = context.createGain();
			oscillatorB.type = "sine";
			oscillatorB.frequency.setValueAtTime(1175, now + 0.12);
			gainB.gain.setValueAtTime(0.0001, now + 0.12);
			gainB.gain.exponentialRampToValueAtTime(0.04, now + 0.14);
			gainB.gain.exponentialRampToValueAtTime(0.0001, now + 0.28);
			oscillatorB.connect(gainB);
			gainB.connect(context.destination);
			oscillatorB.start(now + 0.12);
			oscillatorB.stop(now + 0.28);

			window.setTimeout(() => {
				void context.close();
			}, 400);
		} catch {
			// Notification audio is best-effort only.
		}
	}

	function handleAdminLogin() {
		const validUser = ADMIN_USERS.find(
			(u) => u.username === loginUsername && u.password === loginPassword
		);
		if (validUser) {
			window.localStorage.setItem(ADMIN_SESSION_KEY, "true");
			window.localStorage.setItem("admin_uid", validUser.uid);
			setAdminUid(validUser.uid);
			setIsAdminAuthenticated(true);
			setLoginError("");
			setStatus(`Authenticated as ${validUser.username}.`);
			return;
		}

		setLoginError("Invalid admin credentials.");
	}

	function handleAdminLogout() {
		window.localStorage.removeItem(ADMIN_SESSION_KEY);
		setIsAdminAuthenticated(false);
		setLoginUsername("");
		setLoginPassword("");
		setSelectedClientUid("");
		setDraftMessage("");
		setAllMessages([]);
		setUnreadCounts({});
		seenClientMessageIdsRef.current = new Set();
		didInitializeSeenClientMessagesRef.current = false;
		setStatus("Signed out.");
	}

	const loadMessages = useCallback(async () => {
		if (!db || !isAdminAuthenticated) {
			setStatus("Firestore not configured.");
			return;
		}

		setIsLoadingMessages(true);
		try {
			const snapshot = await getDocs(query(collection(db, "chat_messages"), limit(500)));
			const items = snapshot.docs.map((doc) => {
				const data = doc.data() as {
					uid?: string;
					clientUid?: string;
					message?: string;
					createdAt?: Timestamp;
				};

				return {
					id: doc.id,
					uid: data.uid ?? "unknown",
					clientUid: data.clientUid,
					message: data.message ?? "",
					createdAt: data.createdAt,
				};
			});

			const clientMessages = items.filter(isClientAuthoredMessage);
			if (!didInitializeSeenClientMessagesRef.current) {
				for (const message of clientMessages) {
					seenClientMessageIdsRef.current.add(message.id);
				}
				didInitializeSeenClientMessagesRef.current = true;
			} else {
				const newClientMessages = clientMessages.filter(
					(message) => !seenClientMessageIdsRef.current.has(message.id),
				);

				if (newClientMessages.length > 0) {
					for (const message of newClientMessages) {
						seenClientMessageIdsRef.current.add(message.id);
					}

					setUnreadCounts((previous) => {
						const next = { ...previous };
						for (const message of newClientMessages) {
							const clientUid = inferClientUid(message);
							if (!clientUid || clientUid === selectedClientUid) {
								continue;
							}
							next[clientUid] = (next[clientUid] ?? 0) + 1;
						}
						return next;
					});

					playNewMessageSound();
				}
			}

			setAllMessages(items);
			setStatus(`Loaded ${items.length} message(s).`);
		} catch (error) {
			setStatus(error instanceof Error ? error.message : "Failed to load messages.");
		} finally {
			setIsLoadingMessages(false);
		}
	}, [isAdminAuthenticated, selectedClientUid]);

	useEffect(() => {
		if (!isAdminAuthenticated) {
			return;
		}

		void loadMessages();
		const intervalId = window.setInterval(() => {
			void loadMessages();
		}, 2000);

		return () => window.clearInterval(intervalId);
	}, [isAdminAuthenticated, loadMessages]);

	const conversations = useMemo<SidebarConversation[]>(() => {
		if (!isAdminAuthenticated) {
			return [];
		}

		const byClient = new Map<string, { message: string; ts: number }>();

		for (const item of allMessages) {
			const clientUid = inferClientUid(item);
			if (!clientUid) {
				continue;
			}

			const timestamp = item.createdAt?.toDate()?.getTime() ?? 0;
			const previous = byClient.get(clientUid);
			if (!previous || timestamp >= previous.ts) {
				byClient.set(clientUid, {
					message: item.message || "(empty)",
					ts: timestamp,
				});
			}
		}

		return [...byClient.entries()]
			.map(([uid, info]) => ({
				uid,
				label: uid,
				initial: uid.charAt(0).toUpperCase(),
				lastMessage: info.message,
				lastTimestampMs: info.ts,
				timeLabel: info.ts > 0 ? timeFormatter.format(new Date(info.ts)) : "",
			}))
			.sort((a, b) => b.lastTimestampMs - a.lastTimestampMs);
	}, [allMessages, isAdminAuthenticated, timeFormatter]);

	useEffect(() => {
		if (!selectedClientUid && conversations.length > 0) {
			setSelectedClientUid(conversations[0].uid);
		}
	}, [conversations, selectedClientUid]);

	useEffect(() => {
		if (!selectedClientUid) {
			return;
		}

		setUnreadCounts((previous) => {
			if (!(selectedClientUid in previous)) {
				return previous;
			}

			const next = { ...previous };
			delete next[selectedClientUid];
			return next;
		});
	}, [selectedClientUid]);

	function handleSelectClient(clientUid: string) {
		setSelectedClientUid(clientUid);
	}

	useEffect(() => {
		if (!db || !isAdminAuthenticated || !selectedClientUid) {
			setSelectedHandlerMode("ai");
			setHandlerModeStatus("AI handles replies by default.");
			return;
		}

		const sessionRef = doc(db, "chat_sessions", selectedClientUid);

		// Reset handler mode to AI every time a client is selected / page loads.
		// Firestore SDK applies this locally before the snapshot fires, so no flash.
		void setDoc(
			sessionRef,
			{
				clientUid: selectedClientUid,
				handlerMode: "ai",
				changedBy: adminUid,
				changedAt: serverTimestamp(),
			},
			{ merge: true },
		);

		const unsubscribe = onSnapshot(
			sessionRef,
			(snapshot) => {
				if (!snapshot.exists()) {
					setSelectedHandlerMode("ai");
					setHandlerModeStatus("AI handles replies by default.");
					return;
				}

				const data = snapshot.data() as Partial<ChatSessionControl>;
				const mode = data.handlerMode === "counselor" ? "counselor" : "ai";
				setSelectedHandlerMode(mode);
				setHandlerModeStatus(
					mode === "counselor" ? "Counselor is handling replies." : "AI is handling replies.",
				);
			},
			(error) => {
				setSelectedHandlerMode("ai");
				setHandlerModeStatus(error.message || "Failed to load handler mode.");
			},
		);

		return () => unsubscribe();
	}, [isAdminAuthenticated, selectedClientUid]);

	const selectedThread = useMemo(() => {
		if (!isAdminAuthenticated || !selectedClientUid) {
			return [] as ChatMessage[];
		}

		return allMessages
			.filter((item) => inferClientUid(item) === selectedClientUid)
			.sort((a, b) => {
				const aMs = a.createdAt?.toDate()?.getTime() ?? 0;
				const bMs = b.createdAt?.toDate()?.getTime() ?? 0;
				return aMs - bMs;
			});
	}, [allMessages, isAdminAuthenticated, selectedClientUid]);

	const counselorMessages = useMemo<ChatMessageItem[]>(() => {
		return selectedThread.map((item) => {
			const isCounselor = ADMIN_USERS.some((u) => u.uid === item.uid) || item.uid === "ai_counselor";
			let senderLabel = "Client";
			if (item.uid === "ai_counselor") {
				senderLabel = "Counselor (AI)";
			} else if (isCounselor) {
				senderLabel = "Counselor";
			}

			return {
				id: item.id,
				text: item.message,
				senderLabel,
				timeLabel: item.createdAt ? timeFormatter.format(item.createdAt.toDate()) : "",
				isOwn: isCounselor,
			};
		});
	}, [selectedThread, timeFormatter]);

	// Computed date separator for the first message
	const dateSeparator = useMemo(() => {
		if (selectedThread.length === 0) return "";
		const first = selectedThread[0];
		if (!first.createdAt) return "";
		const d = first.createdAt.toDate();
		const today = new Date();
		const isToday = d.toDateString() === today.toDateString();
		const label = isToday ? "Today" : d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
		return `${label} · ${timeFormatter.format(d)}`;
	}, [selectedThread, timeFormatter]);

	// Start time of the conversation
	const conversationStartTime = useMemo(() => {
		if (selectedThread.length === 0) return "";
		const first = selectedThread[0];
		if (!first.createdAt) return "";
		return timeFormatter.format(first.createdAt.toDate());
	}, [selectedThread, timeFormatter]);

	async function sendReply() {
		if (!db) {
			setStatus("Firestore not configured.");
			return;
		}

		if (!isAdminAuthenticated || !selectedClientUid || draftMessage.trim().length === 0) {
			return;
		}

		const text = draftMessage.trim();

		try {
			setIsSending(true);

			// Auto-switch to counselor mode when sending a reply (so AI stops responding)
			if (selectedHandlerMode !== "counselor") {
				await setDoc(
					doc(db, "chat_sessions", selectedClientUid),
					{
						clientUid: selectedClientUid,
						handlerMode: "counselor",
						changedBy: adminUid,
						changedAt: serverTimestamp(),
					},
					{ merge: true },
				);
			}

			const docRef = await addDoc(collection(db, "chat_messages"), {
				uid: adminUid,
				clientUid: selectedClientUid,
				message: text,
				source: "counselor_page",
				channelType: "counselor",
				createdAt: serverTimestamp(),
			});

			// Optimistically add the sent message so it appears instantly
			setAllMessages((prev) => [
				...prev,
				{
					id: docRef.id,
					uid: adminUid,
					clientUid: selectedClientUid,
					message: text,
					createdAt: Timestamp.now(),
				},
			]);
			setDraftMessage("");
			setStatus("Reply sent.");
			// Let the polling interval reconcile with server data
			void loadMessages();
		} catch (error) {
			setStatus(error instanceof Error ? error.message : "Failed to send reply.");
		} finally {
			setIsSending(false);
		}
	}

	async function updateHandlerMode(nextMode: HandlerMode) {
		if (!db || !selectedClientUid) {
			return;
		}

		try {
			setIsUpdatingHandlerMode(true);
			await setDoc(
				doc(db, "chat_sessions", selectedClientUid),
				{
					clientUid: selectedClientUid,
					handlerMode: nextMode,
					changedBy: adminUid,
					changedAt: serverTimestamp(),
				},
				{ merge: true },
			);
			setHandlerModeStatus(
				nextMode === "counselor" ? "Counselor is handling replies." : "AI is handling replies.",
			);
		} catch (error) {
			setHandlerModeStatus(error instanceof Error ? error.message : "Failed to update handler mode.");
		} finally {
			setIsUpdatingHandlerMode(false);
		}
	}

	if (!isAdminAuthenticated) {
		return (
			<main className="flex min-h-screen items-center justify-center">
				<section className="w-full max-w-sm rounded-2xl border border-[#2a3545] bg-[#1a2332] p-6">
					<div className="mb-5 flex items-center gap-3">
						<div className="flex h-10 w-10 items-center justify-center rounded-full bg-linear-to-br from-[#7c67ff] to-[#5b38f5]">
							<span className="text-lg font-bold text-white">💬</span>
						</div>
						<div>
							<h1 className="text-lg font-bold text-white">Counselor</h1>
							<p className="text-xs text-[#8b93a7]">Crisis Support Assistant</p>
						</div>
					</div>
					<p className="mb-4 text-sm text-[#8b93a7]">Sign in with admin credentials to access the dashboard.</p>
					<div className="space-y-3">
						<input
							type="text"
							placeholder="Username"
							value={loginUsername}
							onChange={(event) => setLoginUsername(event.target.value)}
							className="w-full rounded-lg border border-[#2a3545] bg-[#0f1724] px-3 py-2.5 text-sm text-white placeholder:text-[#64748b] outline-none focus:border-[#5b6fff]"
						/>
						<input
							type="password"
							placeholder="Password"
							value={loginPassword}
							onChange={(event) => setLoginPassword(event.target.value)}
							className="w-full rounded-lg border border-[#2a3545] bg-[#0f1724] px-3 py-2.5 text-sm text-white placeholder:text-[#64748b] outline-none focus:border-[#5b6fff]"
						/>
						<button
							type="button"
							onClick={handleAdminLogin}
							className="w-full rounded-lg bg-linear-to-b from-[#5b6fff] to-[#4f5dff] py-2.5 text-sm font-semibold text-white transition-opacity hover:opacity-90"
						>
							Sign in
						</button>
						{loginError ? (
							<p className="text-sm text-[#ef4444]">{loginError}</p>
						) : null}
					</div>
				</section>
			</main>
		);
	}

	const statusBannerText =
		selectedHandlerMode === "ai" ? "AI is actively handling replies" : "Counselor is handling replies";

	const statusBannerVariant = selectedHandlerMode === "ai" ? "success" : "info";

	return (
		<main className="h-screen overflow-hidden">
			<div className="grid h-full grid-cols-1 grid-rows-[1fr] md:grid-cols-[35%_1fr]">
				<CounselorSidebar
					onSignOut={handleAdminLogout}
					statusText={statusBannerText}
					statusVariant={statusBannerVariant as "success" | "info"}
					selectedTab={selectedTab}
					onTabChange={setSelectedTab}
					conversationCount={conversations.length}
					conversations={conversations}
					unreadCounts={unreadCounts}
					riskLevels={riskLevels}
					selectedClientUid={selectedClientUid}
					onSelectClient={handleSelectClient}
					transcriptContent={
						<Transcript
							sessions={transcriptSessions}
							onSelectSession={(session) => setSelectedTranscriptSession(session)}
							selectedSessionId={selectedTranscriptSession?.sessionId}
							onFetchAndCommit={fetchAndCommitTranscripts}
						/>
					}
				/>
				{selectedTranscriptSession ? (
					<TranscriptDetailView
						session={selectedTranscriptSession}
						onBack={() => setSelectedTranscriptSession(null)}
						onRiskLevelChange={(sessionId, level) => {
							setTranscriptSessions((prev) =>
								prev.map((s) => (s.sessionId === sessionId ? { ...s, riskLevel: level } : s)),
							);
							setSelectedTranscriptSession((prev) =>
								prev && prev.sessionId === sessionId ? { ...prev, riskLevel: level } : prev,
							);
						}}
					/>
				) : (
					<CounselorChatPanel
						selectedClientUid={selectedClientUid}
						messages={counselorMessages}
						draftMessage={draftMessage}
						onDraftChange={setDraftMessage}
						onSend={() => void sendReply()}
						isSending={isSending}
						handlerMode={selectedHandlerMode}
						isUpdatingHandlerMode={isUpdatingHandlerMode}
						onTakeOver={() => void updateHandlerMode("counselor")}
						messageCount={selectedThread.length}
						startTime={conversationStartTime}
						riskLevel={riskLevels[selectedClientUid] ?? "low"}
						onRiskLevelChange={(level) =>
							setRiskLevels((prev) => ({ ...prev, [selectedClientUid]: level }))
						}
						statusText={`${selectedThread.length} messages loaded · Session active`}
						dateSeparator={dateSeparator}
					/>
				)}
			</div>
		</main>
	);
}
