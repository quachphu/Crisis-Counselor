"use client";

import { useState } from "react";
import TranscriptSessionCard from "./TranscriptSessionCard";
import type { TranscriptSession } from "./TranscriptDetailView";

export type { TranscriptSession };

type TranscriptProps = {
	/** Transcript sessions from Firestore (real-time) */
	sessions: TranscriptSession[];
	/** Called when a session card is clicked so the parent can show the detail view */
	onSelectSession: (session: TranscriptSession) => void;
	/** Currently selected session id (for highlighting) */
	selectedSessionId?: string;
	/** Called to fetch all sessions from backend and commit them to Firestore */
	onFetchAndCommit: () => Promise<void>;
};

export default function Transcript({
	sessions,
	onSelectSession,
	selectedSessionId,
	onFetchAndCommit,
}: TranscriptProps) {
	const [loading, setLoading] = useState(false);
	const [error, setError] = useState<string | null>(null);

	const handleFetch = async () => {
		setLoading(true);
		setError(null);
		try {
			await onFetchAndCommit();
		} catch (err: unknown) {
			setError(err instanceof Error ? err.message : "Failed to fetch transcripts");
		} finally {
			setLoading(false);
		}
	};

	return (
		<section className="space-y-3">
			<button
				onClick={handleFetch}
				disabled={loading}
				className="flex items-center gap-2 rounded-full bg-[#1e293b] px-5 py-2.5 text-sm font-medium text-white transition-colors hover:bg-[#334155] disabled:opacity-50"
			>
				<svg
					xmlns="http://www.w3.org/2000/svg"
					viewBox="0 0 20 20"
					fill="currentColor"
					className={`h-4 w-4 ${loading ? "animate-spin" : ""}`}
				>
					<path
						fillRule="evenodd"
						d="M15.312 11.424a5.5 5.5 0 0 1-9.201 2.466l-.312-.311V15a.75.75 0 0 1-1.5 0v-3.5a.75.75 0 0 1 .75-.75H8.5a.75.75 0 0 1 0 1.5H7.058l.166.166a4 4 0 0 0 6.693-1.793.75.75 0 0 1 1.395.3ZM4.688 8.576a5.5 5.5 0 0 1 9.201-2.466l.312.311V5a.75.75 0 0 1 1.5 0v3.5a.75.75 0 0 1-.75.75H11.5a.75.75 0 0 1 0-1.5h1.442l-.166-.166a4 4 0 0 0-6.693 1.793.75.75 0 1 1-1.395-.3Z"
						clipRule="evenodd"
					/>
				</svg>
				{loading ? "Fetching…" : "Fetch Transcripts"}
			</button>

			{error && <p className="text-sm text-red-400">{error}</p>}

			{sessions.length === 0 && !loading && !error && (
				<p className="text-sm text-[#64748b]">No transcripts available.</p>
			)}

			{sessions.length > 0 && (
				<div className="space-y-0.5">
					{sessions.map((session) => (
						<TranscriptSessionCard
							key={session.sessionId}
							label={session.label}
							preview={
								session.messages.length > 0
									? session.messages[session.messages.length - 1].content.slice(0, 50)
									: "No messages"
							}
							timeLabel={session.dateLabel}
							messageCount={session.messages.length}
							isSelected={selectedSessionId === session.sessionId}
							onClick={() => onSelectSession(session)}
							riskLevel={session.riskLevel}
						/>
					))}
				</div>
			)}
		</section>
	);
}
