"use client";

import RiskBadge from "./RiskBadge";
import type { RiskLevel } from "./RiskBadge";

export type TranscriptSessionCardProps = {
	/** Display label, e.g. "Session 1" */
	label: string;
	/** Short preview of latest message */
	preview: string;
	/** Time label, e.g. "9:26 AM" */
	timeLabel?: string;
	/** Number of messages */
	messageCount: number;
	/** Whether this card is selected */
	isSelected: boolean;
	/** Click handler */
	onClick: () => void;
	/** Optional risk level badge */
	riskLevel?: RiskLevel;
};

/**
 * A sidebar card representing a single transcript session.
 * Styled to match the existing SessionCard design in the dark sidebar.
 */
export default function TranscriptSessionCard({
	label,
	preview,
	timeLabel,
	messageCount,
	isSelected,
	onClick,
	riskLevel,
}: TranscriptSessionCardProps) {
	return (
		<button
			type="button"
			onClick={onClick}
			className={`flex w-full items-center gap-3 rounded-xl px-3.5 py-3.5 text-left transition-all duration-200 hover:-translate-y-0.5 hover:bg-[#243044] active:translate-y-0 ${
				isSelected ? "bg-[#243044]" : "bg-transparent"
			}`}
		>
			{/* Icon */}
			<div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-[#334155]">
				<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="h-5 w-5 text-white">
					<path
						fillRule="evenodd"
						d="M2 3.5A1.5 1.5 0 0 1 3.5 2h1.148a1.5 1.5 0 0 1 1.465 1.175l.716 3.223a1.5 1.5 0 0 1-1.052 1.767l-.933.267c-.41.117-.643.555-.48.95a11.542 11.542 0 0 0 6.254 6.254c.395.163.833-.07.95-.48l.267-.933a1.5 1.5 0 0 1 1.767-1.052l3.223.716A1.5 1.5 0 0 1 18 15.352V16.5a1.5 1.5 0 0 1-1.5 1.5H15c-1.149 0-2.263-.15-3.326-.43A13.022 13.022 0 0 1 2.43 8.326 13.019 13.019 0 0 1 2 5V3.5Z"
						clipRule="evenodd"
					/>
				</svg>
			</div>

			{/* Label + preview */}
			<div className="min-w-0 flex-1">
				<div className="flex items-center gap-2">
					<p className="truncate text-base font-semibold text-white">{label}</p>
					{riskLevel && <RiskBadge level={riskLevel} />}
				</div>
				<p className="mt-0.5 truncate text-sm text-[#8b93a7]">{preview}</p>
			</div>

			{/* Meta */}
			<div className="flex shrink-0 flex-col items-end gap-1">
				{timeLabel && <p className="text-xs text-[#8b93a7]">{timeLabel}</p>}
				<span className="inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-[#334155] px-1.5 text-[11px] font-bold text-[#8b93a7]">
					{messageCount}
				</span>
			</div>
		</button>
	);
}
