"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
	addDoc,
	collection,
	doc,
	onSnapshot,
	orderBy,
	query,
	serverTimestamp,
	where,
	type DocumentData,
	type QuerySnapshot,
	type Timestamp,
} from "firebase/firestore";
import ChatWindow from "@/app/components/chat/ChatWindow";
import type { ChatMessageItem } from "@/app/components/chat/MessageList";
import type { HandlerMode } from "@/lib/chat-types";
import { auth, db, isFirebaseConfigured } from "@/lib/firebase";
import { useAuth } from "@/lib/auth-context";

const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:1000";

type ChatMessage = {
	id: string;
	message: string;
	uid: string;
	clientUid?: string;
	createdAt?: Timestamp;
};

type ListenerMode = "indexed" | "fallback";

type ChatSessionControl = {
	clientUid: string;
	handlerMode: HandlerMode;
	changedBy?: string;
	changedAt?: Timestamp;
};

function sortMessagesByTimestamp(items: ChatMessage[]): ChatMessage[] {
	return [...items].sort((a, b) => {
		const aMillis = a.createdAt?.toMillis();
		const bMillis = b.createdAt?.toMillis();
		const aMissing = aMillis === undefined;
		const bMissing = bMillis === undefined;

		if (aMissing !== bMissing) {
			return aMissing ? 1 : -1;
		}
		if (!aMissing && !bMissing && aMillis !== bMillis) {
			return aMillis - bMillis;
		}
		return a.id.localeCompare(b.id);
	});
}

function asErrorMessage(error: unknown): string {
	if (error instanceof Error && error.message) {
		return error.message;
	}
	return "Unknown Firestore listener error.";
}

function isCompositeIndexMissingError(error: unknown): boolean {
	if (!error || typeof error !== "object") {
		return false;
	}

	const candidate = error as { code?: string; message?: string };
	if (candidate.code === "failed-precondition") {
		return true;
	}

	const message = candidate.message?.toLowerCase() ?? "";
	return message.includes("requires an index") || (message.includes("index") && message.includes("create"));
}

export default function ClientChatPage() {
	const { user: currentUser } = useAuth();
	const [guestUid, setGuestUid] = useState("");
	const [message, setMessage] = useState("");
	const [status, setStatus] = useState("Ready");
	const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
	const [isSending, setIsSending] = useState(false);
	const [listenerMode, setListenerMode] = useState<ListenerMode>("indexed");
	const [listenerError, setListenerError] = useState<string>();
	const [handlerMode, setHandlerMode] = useState<HandlerMode>("ai");
	const [handlerModeError, setHandlerModeError] = useState<string>();

	// Live streaming bubble — shown while AI is responding
	const [streamingText, setStreamingText] = useState("");
	const [isStreaming, setIsStreaming] = useState(false);
	const abortRef = useRef<AbortController | null>(null);

	const activeClientUid = currentUser?.uid ?? guestUid;
	const canUseFirebase = useMemo(() => Boolean(auth && db && isFirebaseConfigured), []);

	// ── Guest UID bootstrap ────────────────────────────────────
	useEffect(() => {
		if (currentUser) {
			setGuestUid("");
			return;
		}
		const storageKey = "guest_client_uid";
		const savedUid = window.localStorage.getItem(storageKey)?.trim() ?? "";
		if (savedUid) {
			setGuestUid(savedUid);
			return;
		}
		const generatedUid = `guest_${crypto.randomUUID().slice(0, 8)}`;
		window.localStorage.setItem(storageKey, generatedUid);
		setGuestUid(generatedUid);
	}, [currentUser]);

	// ── Real-time Firestore listener (replaces polling) ────────
	useEffect(() => {
		if (!db || !activeClientUid) return;
		const firestore = db;
		const clientUid = activeClientUid;

		setListenerMode("indexed");
		setListenerError(undefined);

		const toMessages = (snapshot: QuerySnapshot<DocumentData>) => {
			const items: ChatMessage[] = snapshot.docs.map((doc) => {
				const d = doc.data() as {
					message?: string;
					uid?: string;
					clientUid?: string;
					createdAt?: Timestamp;
				};
				return {
					id: doc.id,
					message: d.message ?? "",
					uid: d.uid ?? "unknown",
					clientUid: d.clientUid,
					createdAt: d.createdAt,
				};
			});

			return items;
		};

		let currentUnsubscribe: (() => void) | null = null;
		let didUnmount = false;

		const subscribeFallback = () => {
			if (didUnmount) {
				return;
			}

			const fallbackQuery = query(collection(firestore, "chat_messages"), where("clientUid", "==", clientUid));

			setListenerMode("fallback");
			setListenerError(undefined);

			currentUnsubscribe = onSnapshot(
				fallbackQuery,
				(snapshot) => {
					const items = sortMessagesByTimestamp(toMessages(snapshot));
					setChatMessages(items);
				},
				(error) => {
					const message = asErrorMessage(error);
					setListenerError(message);
					setStatus(`History load failed: ${message}`);
				},
			);
		};

			const indexedQuery = query(
				collection(firestore, "chat_messages"),
				where("clientUid", "==", clientUid),
				orderBy("createdAt", "asc"),
			);

		currentUnsubscribe = onSnapshot(
			indexedQuery,
			(snapshot) => {
				const items = toMessages(snapshot);
				setListenerMode("indexed");
				setListenerError(undefined);
				setChatMessages(items);
			},
			(error) => {
				if (isCompositeIndexMissingError(error)) {
					if (currentUnsubscribe) {
						currentUnsubscribe();
						currentUnsubscribe = null;
					}
					subscribeFallback();
					return;
				}

				const message = asErrorMessage(error);
				setListenerError(message);
				setStatus(`History load failed: ${message}`);
			},
		);

		return () => {
			didUnmount = true;
			if (currentUnsubscribe) {
				currentUnsubscribe();
			}
		};
	}, [activeClientUid]);

	// ── Session handler mode listener ───────────────────────────
	// Listen for handler mode changes (set by counselor page)
	useEffect(() => {
		if (!db || !activeClientUid) {
			setHandlerMode("ai");
			setHandlerModeError(undefined);
			return;
		}

		const sessionRef = doc(db, "chat_sessions", activeClientUid);

		const unsubscribe = onSnapshot(
			sessionRef,
			(snapshot) => {
				if (!snapshot.exists()) {
					setHandlerMode("ai");
					setHandlerModeError(undefined);
					return;
				}

				const data = snapshot.data() as Partial<ChatSessionControl>;
				if (data.handlerMode === "ai" || data.handlerMode === "counselor") {
					setHandlerMode(data.handlerMode);
					setHandlerModeError(undefined);
					return;
				}

				setHandlerMode("ai");
				setHandlerModeError("Invalid session mode, defaulting to AI.");
			},
			(error) => {
				setHandlerMode("ai");
				setHandlerModeError(error.message || "Failed to read handler mode.");
			},
		);

		return () => unsubscribe();
	}, [activeClientUid]);

	// If counselor takes over mid-stream, stop AI generation immediately.
	useEffect(() => {
		if (handlerMode !== "counselor" || !isStreaming) {
			return;
		}

		abortRef.current?.abort();
		setStreamingText("");
		setIsStreaming(false);
		setStatus("Counselor takeover enabled. AI response stopped.");
	}, [handlerMode, isStreaming]);

	const listenerStatusText = useMemo(() => {
		if (!activeClientUid) {
			return "Preparing session...";
		}

		if (listenerError) {
			return `History error: ${listenerError}`;
		}

		if (listenerMode === "fallback") {
			return "History loaded in compatibility mode (index missing).";
		}

		return "History synced.";
	}, [activeClientUid, listenerError, listenerMode]);

	const handlerStatusText = useMemo(() => {
		if (handlerModeError) {
			return `Handler mode issue: ${handlerModeError}`;
		}
		return handlerMode === "counselor"
			? "Counselor mode active (AI requests still sent)."
			: "AI mode active.";
	}, [handlerMode, handlerModeError]);

	// ── Build rendered messages (+ streaming bubble) ───────────

	const renderedMessages = useMemo<ChatMessageItem[]>(() => {
		const fmt = new Intl.DateTimeFormat(undefined, {
			hour: "numeric",
			minute: "2-digit",
		});

		// Show all messages for this clientUid, regardless of sender
		const list: ChatMessageItem[] = chatMessages.map((item) => {
			let senderLabel = "Client";
			if (item.uid === activeClientUid) senderLabel = "Me";
			else if (item.uid === "ai_counselor") senderLabel = "CrisisLine AI Agent";
			else if (item.uid?.startsWith("admin_")) senderLabel = "Counselor";
			else if (item.uid === "counselor_local") senderLabel = "Counselor";

			return {
				id: item.id,
				text: item.message,
				senderLabel,
				timeLabel: item.createdAt ? fmt.format(item.createdAt.toDate()) : "",
				isOwn: item.uid === activeClientUid,
			};
		});

		// Append live streaming bubble
		if (isStreaming && streamingText) {
			list.push({
				id: "__streaming__",
				text: streamingText + " ▍",
				senderLabel: "CrisisLine AI Agent",
				isOwn: false,
			});
		}

		return list;
	}, [activeClientUid, chatMessages, isStreaming, streamingText]);

	// ── Stream AI response via SSE ─────────────────────────────
	async function streamAIResponse(userText: string) {
		setIsStreaming(true);
		setStreamingText("");

		const controller = new AbortController();
		abortRef.current = controller;
		let fullText = "";
		let wasAborted = false;

		try {
			const res = await fetch(`${API_BASE}/llm/stream`, {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({
					message: userText,
					session_id: activeClientUid,
				}),
				signal: controller.signal,
			});

			if (!res.ok || !res.body) {
				throw new Error(`Stream error ${res.status}`);
			}

			const reader = res.body.getReader();
			const decoder = new TextDecoder();
			let buffer = "";

			while (true) {
				const { done, value } = await reader.read();
				if (done) break;

				buffer += decoder.decode(value, { stream: true });
				const lines = buffer.split("\n");
				buffer = lines.pop() ?? "";

				for (const line of lines) {
					const trimmed = line.trim();
					if (!trimmed.startsWith("data: ")) continue;
					const payload = trimmed.slice(6);
					if (payload === "[DONE]") continue;
					fullText += payload;
					setStreamingText(fullText);
				}
			}
		} catch (err) {
			if ((err as Error).name === "AbortError") {
				wasAborted = true;
			} else {
				setStatus(`AI stream failed: ${(err as Error).message}`);
			}
		} finally {
			setIsStreaming(false);
			setStreamingText("");
			abortRef.current = null;
		}

		// Persist complete AI reply to Firestore
		if (!wasAborted && fullText && db) {
			try {
				await addDoc(collection(db, "chat_messages"), {
					message: fullText,
					uid: "ai_counselor",
					clientUid: activeClientUid,
					source: "ai_stream",
					channelType: "client",
					createdAt: serverTimestamp(),
				});
			} catch {
				setStatus("Failed to save AI reply.");
			}
		}
	}

	// ── Send message handler ───────────────────────────────────
	async function sendMessage() {
		if (!db) {
			setStatus("Firestore not configured.");
			return;
		}
		if (!activeClientUid) {
			setStatus("Preparing guest session...");
			return;
		}
		const text = message.trim();
		if (!text) return;

		try {
			setIsSending(true);
			setMessage("");

			// Save user message to Firestore
			await addDoc(collection(db, "chat_messages"), {
				message: text,
				uid: activeClientUid,
				clientUid: activeClientUid,
				source: currentUser ? "client_page" : "guest_client_page",
				channelType: "client",
				createdAt: serverTimestamp(),
			});

			// Only trigger AI response when AI is handling; skip when counselor is active
			if (handlerMode === "ai") {
				setStatus("Sending to AI...");
				await streamAIResponse(text);
			} else {
				setStatus("Message sent. Waiting for counselor reply.");
			}
		} catch (error) {
			setStatus(error instanceof Error ? error.message : "Failed to send message.");
		} finally {
			setIsSending(false);
		}
	}

	return (
		<main className="mx-auto flex h-full w-full max-w-4xl flex-col px-6 py-6">
			<ChatWindow
				title={currentUser ? "Client Chat" : "Guest Chat"}
				statusText={handlerMode === "counselor" ? "Counselor mode active" : "Connected"}
				messages={renderedMessages}
				inputValue={message}
				onInputChange={setMessage}
				onSend={sendMessage}
				isSending={isSending || isStreaming}
				emptyText="No messages yet. Say something to start chatting with the CrisisLine AI Agent."
				theme="dark"
			/>
		</main>
	);
}
