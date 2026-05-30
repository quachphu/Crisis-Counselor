"use client";

import { useState } from "react";
import TranscriptEntry from "./TranscriptEntry";
import RiskBadge from "./RiskBadge";
import SummaryNoteCard from "./SummaryNoteCard";
import type { RiskLevel } from "./RiskBadge";

export type TranscriptMessage = {
	role: string;
	content: string;
};

export type TranscriptSession = {
	sessionId: string;
	/** Display label for the session, e.g. "Call with Angela" */
	label: string;
	/** Short description, e.g. "Ruth answered · 9:58" */
	subtitle?: string;
	/** Formatted date/time string, e.g. "Today, 9:26 AM" */
	dateLabel?: string;
	messages: TranscriptMessage[];
	/** Risk level from summary analysis */
	riskLevel?: RiskLevel;
};

type TranscriptDetailViewProps = {
	session: TranscriptSession;
	/** Called when the user presses the back button */
	onBack: () => void;
	/** Called when summary analysis returns a risk level */
	onRiskLevelChange?: (sessionId: string, level: RiskLevel) => void;
};

/** Map speaker roles to display names */
function speakerName(role: string): string {
	switch (role) {
		case "user":
		case "human":
			return "Client";
		case "assistant":
		case "ai":
			return "CrisisLine AI Agent";
		default:
			return role;
	}
}

/** Generate a simple mm:ss timestamp based on message index */
function fakeTimestamp(index: number): string {
	const minutes = Math.floor(index * 0.4);
	const seconds = Math.round((index * 0.4 - minutes) * 60);
	return `${minutes}:${seconds.toString().padStart(2, "0")}`;
}

/**
 * Full-screen detail view of a single transcript session.
 * Displays a header with a back arrow, session info, and a scrollable
 * list of TranscriptEntry rows matching the call-log design.
 */
export default function TranscriptDetailView({ session, onBack, onRiskLevelChange }: TranscriptDetailViewProps) {
	const [showSummary, setShowSummary] = useState(false);

	function toRiskLevel(raw: string): RiskLevel {
		const lower = raw.toLowerCase();
		if (lower === "critical" || lower === "high" || lower === "medium" || lower === "low") return lower;
		return "low";
	}

	return (
		<div className="relative flex h-full flex-col bg-[#0f1724]">
			{/* ── Header ── */}
			<header className="flex items-center gap-3 border-b border-[#2a3545] px-5 py-4">
				<button
					type="button"
					onClick={onBack}
					className="flex h-8 w-8 items-center justify-center rounded-full text-[#8b93a7] transition-colors hover:bg-[#243044] hover:text-white"
					aria-label="Back to transcript list"
				>
					<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="h-5 w-5">
						<path
							fillRule="evenodd"
							d="M17 10a.75.75 0 0 1-.75.75H5.612l4.158 3.96a.75.75 0 1 1-1.04 1.08l-5.5-5.25a.75.75 0 0 1 0-1.08l5.5-5.25a.75.75 0 1 1 1.04 1.08L5.612 9.25H16.25A.75.75 0 0 1 17 10Z"
							clipRule="evenodd"
						/>
					</svg>
				</button>

				{/* Phone icon */}
				<div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[#334155]">
					<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="white" className="h-5 w-5">
						<path
							fillRule="evenodd"
							d="M2 3.5A1.5 1.5 0 0 1 3.5 2h1.148a1.5 1.5 0 0 1 1.465 1.175l.716 3.223a1.5 1.5 0 0 1-1.052 1.767l-.933.267c-.41.117-.643.555-.48.95a11.542 11.542 0 0 0 6.254 6.254c.395.163.833-.07.95-.48l.267-.933a1.5 1.5 0 0 1 1.767-1.052l3.223.716A1.5 1.5 0 0 1 18 15.352V16.5a1.5 1.5 0 0 1-1.5 1.5H15c-1.149 0-2.263-.15-3.326-.43A13.022 13.022 0 0 1 2.43 8.326 13.019 13.019 0 0 1 2 5V3.5Z"
							clipRule="evenodd"
						/>
					</svg>
				</div>

				<div className="min-w-0 flex-1">
					<div className="flex items-center gap-2">
						<h2 className="text-base font-semibold text-white">{session.label}</h2>
						{session.riskLevel && <RiskBadge level={session.riskLevel} />}
					</div>
					{session.subtitle && <p className="text-sm text-[#8b93a7]">{session.subtitle}</p>}
				</div>

				{/* Summary button */}
				<button
					type="button"
					onClick={() => setShowSummary(true)}
					className="shrink-0 rounded-lg border border-[#2a3545] px-3 py-1.5 text-xs font-semibold text-[#8b93a7] transition-colors hover:bg-[#243044] hover:text-white"
				>
					Summary
				</button>

				{session.dateLabel && (
					<span className="shrink-0 text-xs text-[#64748b]">{session.dateLabel}</span>
				)}
			</header>

			{/* ── Transcript body ── */}
			<div className="flex-1 overflow-y-auto px-6 py-4">
				<div className="mx-auto max-w-2xl rounded-xl border border-[#2a3545] bg-[#1a2332] px-6 py-4">
					{session.messages.length === 0 ? (
						<p className="py-8 text-center text-sm text-[#64748b]">No messages in this transcript.</p>
					) : (
						<div className="divide-y divide-[#2a3545]">
							{session.messages.map((msg, i) => (
								<TranscriptEntry
									key={i}
									timestamp={fakeTimestamp(i)}
									speaker={speakerName(msg.role)}
									text={msg.content}
								/>
							))}
						</div>
					)}
				</div>
			</div>

			{/* Summary overlay */}
			{showSummary && (
				<SummaryNoteCard
					sessionId={session.sessionId}
					onClose={() => setShowSummary(false)}
					onSummaryLoaded={(data) => {
						const level = toRiskLevel(data.risk_level);
						onRiskLevelChange?.(session.sessionId, level);
					}}
				/>
			)}
		</div>
	);
}
