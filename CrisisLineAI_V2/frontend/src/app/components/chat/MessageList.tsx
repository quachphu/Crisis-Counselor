export type ChatMessageItem = {
	id: string;
	text: string;
	senderLabel: string;
	timeLabel?: string;
	isOwn: boolean;
};

export type MessageListTheme = "light" | "dark";

type MessageListProps = {
	messages: ChatMessageItem[];
	emptyText?: string;
	/** Color theme — "light" (default) for client view, "dark" for counselor view */
	theme?: MessageListTheme;
};

function initialsFromLabel(label: string): string {
	const parts = label.trim().split(/\s+/).filter(Boolean);
	if (parts.length === 0) {
		return "?";
	}

	if (parts.length === 1) {
		return parts[0].slice(0, 1).toUpperCase();
	}

	return `${parts[0].slice(0, 1)}${parts[1].slice(0, 1)}`.toUpperCase();
}

/* ── Grouping logic ────────────────────────────────────────────── */

type GroupPosition = "solo" | "first" | "middle" | "last";

function computeGroupPositions(messages: ChatMessageItem[]): GroupPosition[] {
	return messages.map((msg, i) => {
		const prev = i > 0 ? messages[i - 1] : null;
		const next = i < messages.length - 1 ? messages[i + 1] : null;
		const sameSenderAsPrev = prev !== null && prev.senderLabel === msg.senderLabel && prev.isOwn === msg.isOwn;
		const sameSenderAsNext = next !== null && next.senderLabel === msg.senderLabel && next.isOwn === msg.isOwn;

		if (sameSenderAsPrev && sameSenderAsNext) return "middle";
		if (sameSenderAsPrev && !sameSenderAsNext) return "last";
		if (!sameSenderAsPrev && sameSenderAsNext) return "first";
		return "solo";
	});
}

/* ── Bubble border-radius per group position ───────────────────── */

// Messenger-style: the side closest to the avatar gets a small radius
// on interior bubbles, creating a connected cluster look.
// Using 18px as the "full" radius and 4px as the "flat" radius.

const BUBBLE_RADIUS_OWN: Record<GroupPosition, string> = {
	solo:   "rounded-[18px]",
	first:  "rounded-[18px] rounded-br-[4px]",
	middle: "rounded-[18px] rounded-r-[4px]",
	last:   "rounded-[18px] rounded-tr-[4px]",
};

const BUBBLE_RADIUS_OTHER: Record<GroupPosition, string> = {
	solo:   "rounded-[18px]",
	first:  "rounded-[18px] rounded-bl-[4px]",
	middle: "rounded-[18px] rounded-l-[4px]",
	last:   "rounded-[18px] rounded-tl-[4px]",
};

/* ── Theme-aware style maps ────────────────────────────────────── */

const THEME_STYLES = {
	light: {
		empty: "rounded-xl border border-black/10 px-4 py-6 text-center text-sm text-[#5f6578]",
		label: "text-xs font-semibold text-[#4c5266]",
		time: "text-[11px] text-[#70778d]",
		avatarOwn: "flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[#5b6fff] text-xs font-bold text-white",
		avatarOther: "flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[#22c55e] text-xs font-bold text-white",
		bubbleOwn: "border border-transparent bg-linear-to-b from-[#6b4dff] to-[#5a33f0] text-white px-3 py-2 text-sm",
		bubbleOther: "border border-transparent bg-[#e3e4ea] text-[#222632] px-3 py-2 text-sm",
	},
	dark: {
		empty: "rounded-xl border border-[#2a3545] px-4 py-6 text-center text-sm text-[#64748b]",
		label: "text-xs font-semibold text-[#8b93a7]",
		time: "text-[11px] text-[#64748b]",
		avatarOwn: "flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[#5b6fff] text-xs font-bold text-white",
		avatarOther: "flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[#22c55e] text-xs font-bold text-white",
		bubbleOwn: "border border-transparent bg-linear-to-b from-[#5b6fff] to-[#4f5dff] text-white px-3 py-2 text-sm",
		bubbleOther: "border border-transparent bg-[#1e293b] text-white px-3 py-2 text-sm",
	},
} as const;

export default function MessageList({ messages, emptyText = "No messages yet.", theme = "light" }: MessageListProps) {
	const s = THEME_STYLES[theme];

	if (messages.length === 0) {
		return <div className={s.empty}>{emptyText}</div>;
	}

	const positions = computeGroupPositions(messages);

	return (
		<ul className="flex flex-col">
			{messages.map((message, i) => {
				const pos = positions[i];
				const isNewGroup = i === 0 || positions[i - 1] === "solo" || positions[i - 1] === "last";
				const showAvatar = pos === "solo" || pos === "last";
				const showLabel = pos === "solo" || pos === "first";
				const radiusClass = message.isOwn
					? BUBBLE_RADIUS_OWN[pos]
					: BUBBLE_RADIUS_OTHER[pos];

				return (
					<li
						key={message.id}
						className={`flex items-end gap-2 ${message.isOwn ? "justify-end" : "justify-start"} ${isNewGroup ? "mt-3" : "mt-0.5"}`}
					>
						{/* Left avatar / spacer (other's messages) */}
						{!message.isOwn ? (
							showAvatar ? (
								<div className={s.avatarOther}>
									{initialsFromLabel(message.senderLabel)}
								</div>
							) : (
								<div className="w-8 shrink-0" />
							)
						) : null}

						{/* Bubble column */}
						<div className={`group/msg relative max-w-[80%] ${message.isOwn ? "text-right" : "text-left"}`}>
							{showLabel && (
								<p className={`mb-1 ${s.label}`}>{message.senderLabel}</p>
							)}
							<div className={`${message.isOwn ? s.bubbleOwn : s.bubbleOther} ${radiusClass}`}>
								{message.text || "(empty)"}
							</div>
							{/* Hover timestamp */}
							{message.timeLabel ? (
								<span
									className={`pointer-events-none absolute top-1/2 -translate-y-1/2 opacity-0 transition-opacity duration-150 group-hover/msg:opacity-100 ${s.time} whitespace-nowrap ${
										message.isOwn ? "right-full mr-2" : "left-full ml-2"
									}`}
								>
									{message.timeLabel}
								</span>
							) : null}
						</div>

						{/* Right avatar / spacer (own messages) */}
						{message.isOwn ? (
							showAvatar ? (
								<div className={s.avatarOwn}>
									{initialsFromLabel(message.senderLabel)}
								</div>
							) : (
								<div className="w-8 shrink-0" />
							)
						) : null}
					</li>
				);
			})}
		</ul>
	);
}
