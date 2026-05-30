"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import MessageInput from "./MessageInput";
import MessageList, { type ChatMessageItem } from "./MessageList";

export type ChatWindowTheme = "light" | "dark";

type ChatWindowProps = {
	title: string;
	statusText?: string;
	messages: ChatMessageItem[];
	inputValue: string;
	onInputChange: (value: string) => void;
	onSend: () => void;
	onReload?: () => void;
	isSending?: boolean;
	emptyText?: string;
	/** Color theme — "light" (default) or "dark" */
	theme?: ChatWindowTheme;
};

const THEME_STYLES = {
	light: {
		section: "mx-auto w-full max-w-4xl overflow-hidden rounded-3xl border border-[#d9d9de] bg-white/95 backdrop-blur-sm",
		header: "flex items-center justify-between border-b border-[#e4e4ea] bg-white px-4 py-3 text-[#1f1f25]",
		statusText: "text-xs text-[#6f6f7a]",
		headerBtn: "rounded-md border border-[#d7d7df] px-2 py-1 text-[#5f5f69]",
		body: "h-[65vh] overflow-y-auto bg-white px-4 py-4",
		footer: "border-t border-[#e4e4ea] px-3 py-3 bg-white/95",
	},
	dark: {
		section: "mx-auto w-full max-w-4xl overflow-hidden rounded-3xl border border-[#2a3545] bg-[#0f1724]",
		header: "flex items-center justify-between border-b border-[#2a3545] bg-[#0f1724] px-4 py-3 text-white",
		statusText: "text-xs text-[#64748b]",
		headerBtn: "rounded-md border border-[#2a3545] px-2 py-1 text-[#8b93a7] hover:bg-[#243044]",
		body: "h-[65vh] overflow-y-auto bg-[#0f1724] px-4 py-4",
		footer: "border-t border-[#2a3545] px-3 py-3 bg-[#0f1724]",
	},
} as const;

export default function ChatWindow({
	title,
	statusText,
	messages,
	inputValue,
	onInputChange,
	onSend,
	onReload,
	isSending = false,
	emptyText,
	theme = "light",
}: ChatWindowProps) {
	const s = THEME_STYLES[theme];
	const [showCallBanner, setShowCallBanner] = useState(false);

	// ── Auto-scroll logic ──────────────────────────────────────
	const scrollContainerRef = useRef<HTMLDivElement>(null);
	const bottomRef = useRef<HTMLDivElement>(null);
	const isNearBottomRef = useRef(true);
	const prevMessageCountRef = useRef(messages.length);

	const handleScroll = useCallback(() => {
		const el = scrollContainerRef.current;
		if (!el) return;
		isNearBottomRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < 150;
	}, []);

	// Scroll to bottom on initial mount
	useEffect(() => {
		bottomRef.current?.scrollIntoView();
		isNearBottomRef.current = true;
	}, []);

	// Scroll to bottom when new messages arrive (only if near bottom)
	useEffect(() => {
		if (messages.length > prevMessageCountRef.current && isNearBottomRef.current) {
			bottomRef.current?.scrollIntoView({ behavior: "smooth" });
		}
		prevMessageCountRef.current = messages.length;
	}, [messages.length]);

	return (
		<section className={s.section}>
			<header className={s.header}>
				<div>
					<p className="text-xl font-semibold">{title}</p>
					<p className={s.statusText}>{statusText ?? "Connected"}</p>
				</div>
				<div className="flex items-center gap-2 text-sm">
					<button type="button" className={s.headerBtn} onClick={() => setShowCallBanner((v) => !v)}>Call</button>
				</div>
			</header>

			{showCallBanner && (
				<div className="flex items-center justify-between gap-3 border-b border-[#2a3545] bg-[#1a2332] px-4 py-2.5">
					<div className="flex items-center gap-2">
						<span className="text-lg">📞</span>
						<p className="text-sm font-medium text-white">
							Dial this number: <a href="tel:3372703540" className="font-bold text-[#5b6fff] underline">(337) 270-3540</a>
						</p>
					</div>
					<button
						type="button"
						onClick={() => setShowCallBanner(false)}
						className="flex h-6 w-6 items-center justify-center rounded-md text-[#8b93a7] transition-colors hover:bg-[#243044] hover:text-white"
					>
						✕
					</button>
				</div>
			)}

			<div ref={scrollContainerRef} onScroll={handleScroll} className={s.body}>
				<MessageList messages={messages} emptyText={emptyText} theme={theme} />
				<div ref={bottomRef} />
			</div>

			<footer className={s.footer}>
				<MessageInput
					value={inputValue}
					onChange={onInputChange}
					onSend={onSend}
					onReload={onReload}
					isSending={isSending}
					theme={theme}
				/>
			</footer>
		</section>
	);
}
