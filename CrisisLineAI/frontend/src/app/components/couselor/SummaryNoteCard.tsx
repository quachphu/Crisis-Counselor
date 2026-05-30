"use client";

import { useCallback, useEffect, useState } from "react";

const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:1000";

export type SummaryData = {
	summary: string;
	main_issue: string;
	emotional_state: string;
	risk_level: string;
	risk_reasoning: string;
	immediate_needs: string;
	location_mentioned: string | null;
	follow_up_recommendation: string;
};

type SummaryNoteCardProps = {
	/** The session / client UID to fetch the summary for */
	sessionId: string;
	/** Called when the user closes the card */
	onClose: () => void;
	/** Called when summary data is successfully fetched */
	onSummaryLoaded?: (data: SummaryData) => void;
};

const RISK_COLOR: Record<string, { bg: string; text: string; dot: string }> = {
	low: { bg: "bg-[#22c55e]/15", text: "text-[#22c55e]", dot: "bg-[#22c55e]" },
	medium: { bg: "bg-[#f59e0b]/15", text: "text-[#f59e0b]", dot: "bg-[#f59e0b]" },
	high: { bg: "bg-[#ef4444]/15", text: "text-[#ef4444]", dot: "bg-[#ef4444]" },
	critical: { bg: "bg-[#dc2626]/15", text: "text-[#dc2626]", dot: "bg-[#dc2626]" },
};

function riskStyle(level: string) {
	return RISK_COLOR[level.toLowerCase()] ?? RISK_COLOR.low;
}

export default function SummaryNoteCard({ sessionId, onClose, onSummaryLoaded }: SummaryNoteCardProps) {
	const [data, setData] = useState<SummaryData | null>(null);
	const [isLoading, setIsLoading] = useState(false);
	const [error, setError] = useState<string | null>(null);

	const fetchSummary = useCallback(async () => {
		setIsLoading(true);
		setError(null);
		try {
			const res = await fetch(`${API_BASE}/llm/summary/${encodeURIComponent(sessionId)}`);
			if (!res.ok) throw new Error(`Server returned ${res.status}`);
			const json = await res.json();
			const raw = json.summary ?? json;

			// Backend returns a plain string when there's no conversation history
			if (typeof raw === "string") {
				throw new Error(raw || "No conversation data available.");
			}

			const summaryData: SummaryData = raw;
			setData(summaryData);
			onSummaryLoaded?.(summaryData);
		} catch (err) {
			setError(err instanceof Error ? err.message : "Failed to load summary.");
		} finally {
			setIsLoading(false);
		}
	}, [sessionId]);

	// Fetch on mount
	useEffect(() => {
		void fetchSummary();
	}, [fetchSummary]);

	return (
		<div className="absolute inset-0 z-30 flex items-center justify-center bg-black/50 backdrop-blur-sm">
			<div className="relative mx-4 w-full max-w-lg rounded-2xl border border-[#2a3545] bg-[#1a2332] shadow-2xl">
				{/* Header */}
				<div className="flex items-center justify-between border-b border-[#2a3545] px-5 py-3">
					<h3 className="text-sm font-bold text-white">Session Summary</h3>
					<button
						type="button"
						onClick={onClose}
						className="flex h-7 w-7 items-center justify-center rounded-lg text-[#8b93a7] transition-colors hover:bg-[#243044] hover:text-white"
					>
						✕
					</button>
				</div>

				{/* Body */}
				<div className="max-h-[70vh] overflow-y-auto px-5 py-4">
					{isLoading && (
						<div className="flex items-center justify-center py-12">
							<div className="h-6 w-6 animate-spin rounded-full border-2 border-[#5b6fff] border-t-transparent" />
							<span className="ml-3 text-sm text-[#8b93a7]">Generating summary…</span>
						</div>
					)}

					{error && (
						<div className="rounded-lg border border-[#ef4444]/30 bg-[#ef4444]/10 px-4 py-3">
							<p className="text-sm text-[#ef4444]">{error}</p>
							<button
								type="button"
								onClick={() => void fetchSummary()}
								className="mt-2 text-xs font-semibold text-[#8b93a7] underline hover:text-white"
							>
								Retry
							</button>
						</div>
					)}

					{data && !isLoading && (
						<div className="space-y-3">
							{/* Risk level badge */}
							{data.risk_level && (
								<div className="flex items-center gap-2">
									<span
										className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[11px] font-bold uppercase tracking-wide ${riskStyle(data.risk_level).bg} ${riskStyle(data.risk_level).text}`}
									>
										<span className={`h-1.5 w-1.5 rounded-full ${riskStyle(data.risk_level).dot}`} />
										{data.risk_level.toUpperCase()} RISK
									</span>
								</div>
							)}

							{/* Summary — full width */}
							<FieldCard icon="📝" label="Summary" value={data.summary} />

							{/* 2-column grid */}
							<div className="grid grid-cols-2 gap-3">
								<FieldCard icon="🎯" label="Main Issue" value={data.main_issue} />
								<FieldCard icon="💭" label="Emotional State" value={data.emotional_state} capitalize />
								<FieldCard icon="⚠️" label="Risk Reasoning" value={data.risk_reasoning} />
								<FieldCard icon="🆘" label="Immediate Needs" value={data.immediate_needs} />
								<FieldCard icon="📍" label="Location Mentioned" value={data.location_mentioned ?? "None"} />
								<FieldCard icon="📋" label="Follow-up" value={data.follow_up_recommendation} />
							</div>
						</div>
					)}
				</div>

				{/* Footer */}
				{data && !isLoading && (
					<div className="border-t border-[#2a3545] px-5 py-3">
						<button
							type="button"
							onClick={() => void fetchSummary()}
							className="rounded-lg border border-[#2a3545] px-3 py-1.5 text-xs font-semibold text-[#8b93a7] transition-colors hover:bg-[#243044] hover:text-white"
						>
							Refresh
						</button>
					</div>
				)}
			</div>
		</div>
	);
}

function FieldCard({
	icon,
	label,
	value,
	capitalize = false,
}: {
	icon: string;
	label: string;
	value: string;
	capitalize?: boolean;
}) {
	return (
		<div className="rounded-xl border border-[#2a3545] bg-[#0f1724]/60 px-3.5 py-3">
			<div className="mb-1.5 flex items-center gap-1.5">
				<span className="text-sm">{icon}</span>
				<p className="text-[11px] font-semibold uppercase tracking-wide text-[#64748b]">{label}</p>
			</div>
			<p className={`text-sm font-medium leading-relaxed ${value ? "text-[#c4cad8]" : "text-[#64748b] italic"} ${capitalize ? "capitalize" : ""}`}>
				{value || "—"}
			</p>
		</div>
	);
}
