"use client";

import RiskBadge, { type RiskLevel } from "./RiskBadge";

export type SessionCardProps = {
	/** Single character or short string for the avatar */
	avatarInitial: string;
	/** Tailwind background color class for the avatar circle */
	avatarColor?: string;
	/** Client display name */
	name: string;
	/** Formatted time string */
	time: string;
	/** Last message preview */
	lastMessage: string;
	/** Whether this card is currently selected */
	isSelected: boolean;
	/** Number of unread messages (0 = no badge) */
	unreadCount?: number;
	/** Risk level for this client */
	riskLevel?: RiskLevel;
	/** Click handler */
	onClick: () => void;
};

export default function SessionCard({
	avatarInitial,
	avatarColor = "bg-[#22c55e]",
	name,
	time,
	lastMessage,
	isSelected,
	unreadCount = 0,
	riskLevel,
	onClick,
}: SessionCardProps) {
	return (
		<button
			type="button"
			onClick={onClick}
			className={`flex w-full items-center gap-3 rounded-xl px-3.5 py-3.5 text-left transition-all duration-200 hover:-translate-y-0.5 hover:bg-[#243044] active:translate-y-0 ${
				isSelected ? "bg-[#243044]" : "bg-transparent"
			}`}
		>
			{/* Avatar */}
			<div
				className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-base font-bold text-white ${avatarColor}`}
			>
				{avatarInitial}
			</div>

			{/* Name + preview */}
			<div className="min-w-0 flex-1">
				<div className="flex items-center gap-2">
					<p className="truncate text-base font-semibold text-white">{name}</p>
					{riskLevel ? <RiskBadge level={riskLevel} /> : null}
				</div>
				<p className="mt-0.5 truncate text-sm text-[#8b93a7]">{lastMessage}</p>
			</div>

			{/* Time + unread */}
			<div className="flex shrink-0 flex-col items-end gap-1">
				<p className="text-xs text-[#8b93a7]">{time}</p>
				{unreadCount > 0 ? (
					<span className="inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-[#5b6fff] px-1.5 text-[11px] font-bold text-white">
						{unreadCount > 99 ? "99+" : unreadCount}
					</span>
				) : null}
			</div>
		</button>
	);
}
