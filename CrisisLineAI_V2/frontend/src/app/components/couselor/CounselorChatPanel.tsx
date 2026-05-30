"use client";

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import type { ChatMessageItem } from "@/app/components/chat/MessageList";
import MessageList from "@/app/components/chat/MessageList";
import MessageInput from "@/app/components/chat/MessageInput";
import RiskBadge, { type RiskLevel } from "./RiskBadge";
import InfoBanner from "./InfoBanner";
import DateSeparator from "./DateSeparator";
import SummaryNoteCard, { type SummaryData } from "./SummaryNoteCard";
import type { HandlerMode } from "@/lib/chat-types";

/** Normalise a free-form risk string from the API to the RiskLevel union */
function toRiskLevel(raw: string | undefined): RiskLevel {
	const normalised = (raw ?? "").trim().toLowerCase();
	if (normalised === "critical" || normalised === "high" || normalised === "medium" || normalised === "low") {
		return normalised;
	}
	return "low";
}

type CounselorChatPanelProps = {
	/** Currently selected client UID (empty = no selection) */
	selectedClientUid: string;
	/** Messages to display */
	messages: ChatMessageItem[];
	/** Draft message value */
	draftMessage: string;
	/** Draft change handler */
	onDraftChange: (value: string) => void;
	/** Send handler */
	onSend: () => void;
	/** Whether a message is being sent */
	isSending: boolean;
	/** Current handler mode */
	handlerMode: HandlerMode;
	/** Whether handler mode is being updated */
	isUpdatingHandlerMode: boolean;
	/** Handler for "Take over chat" */
	onTakeOver: () => void;
	/** Number of messages in the thread */
	messageCount: number;
	/** Formatted start time */
	startTime?: string;
	/** Risk level for the selected client */
	riskLevel?: RiskLevel;
	/** Status text at the bottom */
	statusText: string;
	/** Date separator text */
	dateSeparator?: string;
	/** Additional header actions */
	headerActions?: ReactNode;
	/** Called when the risk level changes (e.g. after a summary is fetched) */
	onRiskLevelChange?: (level: RiskLevel) => void;
};

export default function CounselorChatPanel({
	selectedClientUid,
	messages,
	draftMessage,
	onDraftChange,
	onSend,
	isSending,
	handlerMode,
	isUpdatingHandlerMode,
	onTakeOver,
	messageCount,
	startTime,
	riskLevel = "low",
	statusText,
	dateSeparator,
	headerActions,
	onRiskLevelChange,
}: CounselorChatPanelProps) {
	const [isConfirmingTakeover, setIsConfirmingTakeover] = useState(false);
	const [showSummary, setShowSummary] = useState(false);

	// ── Auto-scroll logic ──────────────────────────────────────────
	const scrollContainerRef = useRef<HTMLDivElement>(null);
	const bottomRef = useRef<HTMLDivElement>(null);
	const isNearBottomRef = useRef(true);
	const prevMessageCountRef = useRef(messages.length);

	const handleScroll = useCallback(() => {
		const el = scrollContainerRef.current;
		if (!el) return;
		// Consider "near bottom" if within 150px of the bottom
		isNearBottomRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < 150;
	}, []);

	// Scroll to bottom on initial mount or when the selected client changes
	useEffect(() => {
		bottomRef.current?.scrollIntoView();
		isNearBottomRef.current = true;
	}, [selectedClientUid]);

	// Scroll to bottom when new messages arrive (only if near bottom)
	useEffect(() => {
		if (messages.length > prevMessageCountRef.current && isNearBottomRef.current) {
			bottomRef.current?.scrollIntoView({ behavior: "smooth" });
		}
		prevMessageCountRef.current = messages.length;
	}, [messages.length]);

	// Close summary card when switching clients
	useEffect(() => {
		setShowSummary(false);
	}, [selectedClientUid]);

	// Reset confirmation when handler mode changes or client changes
	if (handlerMode === "counselor") {
		if (isConfirmingTakeover) setIsConfirmingTakeover(false);
	}

	if (!selectedClientUid) {
		return (
			<div className="flex h-full items-center justify-center bg-[#0f1724]">
				<div className="text-center">
					<p className="text-lg font-medium text-[#8b93a7]">No conversation selected</p>
					<p className="mt-1 text-sm text-[#64748b]">
						Choose a client from the sidebar to start replying.
					</p>
				</div>
			</div>
		);
	}

	return (
		<div className="relative flex h-full flex-col overflow-hidden bg-[#0f1724]">
			{/* Summary overlay */}
			{showSummary && (
				<SummaryNoteCard
					sessionId={selectedClientUid}
					onClose={() => setShowSummary(false)}
					onSummaryLoaded={(summary: SummaryData) => {
						onRiskLevelChange?.(toRiskLevel(summary.risk_level));
					}}
				/>
			)}

			{/* Chat header */}
			<header className="flex shrink-0 items-center justify-between border-b border-[#2a3545] px-5 py-3">
				<div className="flex items-center gap-3">
					<div className="flex h-9 w-9 items-center justify-center rounded-full bg-[#22c55e] text-sm font-bold text-white">
						{selectedClientUid.charAt(0).toUpperCase()}
					</div>
					<div>
						<div className="flex items-center gap-2">
							<h2 className="text-sm font-bold text-white">{selectedClientUid}</h2>
							<RiskBadge level={riskLevel} />
						</div>
						<p className="text-[11px] text-[#8b93a7]">
							{startTime ? `Started ${startTime}` : ""}
						</p>
					</div>
				</div>

				<div className="flex items-center gap-2">
					{headerActions ?? (
						<>
							<button
								type="button"
								onClick={() => setShowSummary(true)}
								className="flex h-8 items-center gap-1.5 rounded-lg border border-[#2a3545] px-3 text-xs font-semibold text-[#8b93a7] transition-colors hover:bg-[#243044] hover:text-white"
							>
								📋 Summary
							</button>
							<HeaderIconButton icon="📎" className="text-[#5b6fff]" />
							<HeaderIconButton icon="🔗" />
							<HeaderIconButton icon="🔴" className="text-[#ef4444]" />
						</>
					)}
				</div>
			</header>

			{/* Handler info banner */}
			<div className="shrink-0 px-4 pt-3">
				{handlerMode === "ai" ? (
					<>
						<InfoBanner
							text="AI is currently handling this conversation"
							variant="ai"
							actionLabel="Take over chat"
							onAction={() => setIsConfirmingTakeover(true)}
							actionDisabled={isUpdatingHandlerMode || isConfirmingTakeover}
						/>
						{isConfirmingTakeover && (
							<div className="mt-2 flex items-center gap-3 rounded-lg border border-[#2a4a6f] bg-[#1e3a5f]/40 px-4 py-2.5">
								<span className="text-sm text-[#c4cad8]">Are you sure you want to take over?</span>
								<button
									type="button"
									onClick={() => {
										onTakeOver();
										setIsConfirmingTakeover(false);
									}}
									disabled={isUpdatingHandlerMode}
									className="shrink-0 rounded-lg bg-linear-to-b from-[#7c67ff] to-[#5b38f5] px-3 py-1.5 text-xs font-semibold text-white transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
								>
									Yes, take over
								</button>
								<button
									type="button"
									onClick={() => setIsConfirmingTakeover(false)}
									className="shrink-0 rounded-lg border border-[#2a3545] px-3 py-1.5 text-xs font-semibold text-[#8b93a7] transition-colors hover:bg-[#243044]"
								>
									Cancel
								</button>
							</div>
						)}
					</>
				) : (
					<InfoBanner
						text="You are handling this conversation"
						variant="counselor"
						icon={<span className="text-base">👤</span>}
					/>
				)}
			</div>

			{/* Messages */}
			<div
				ref={scrollContainerRef}
				onScroll={handleScroll}
				className="min-h-0 flex-1 overflow-y-auto px-5 py-3"
			>
				{dateSeparator ? <DateSeparator text={dateSeparator} /> : null}
				<MessageList messages={messages} emptyText="No messages yet." theme="dark" />
				<div ref={bottomRef} />
			</div>

			{/* Input */}
			<div className="shrink-0 border-t border-[#2a3545] px-4 py-3">
				<MessageInput
					value={draftMessage}
					onChange={onDraftChange}
					onSend={onSend}
					isSending={isSending}
					placeholder="Type a reply..."
					theme="dark"
				/>
			</div>

		</div>
	);
}

function HeaderIconButton({ icon, className = "" }: { icon: string; className?: string }) {
	return (
		<button
			type="button"
			className={`flex h-8 w-8 items-center justify-center rounded-lg border border-[#2a3545] text-sm transition-colors hover:bg-[#243044] ${className}`}
		>
			{icon}
		</button>
	);
}
