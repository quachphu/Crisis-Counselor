"use client";

export type ConversationRow = {
	uid: string;
	label: string;
	lastMessage: string;
	lastTimestampMs: number;
	timeLabel: string;
};

type ChatlogProps = {
	rows: ConversationRow[];
	unreadCounts: Record<string, number>;
	status: string;
	isLoading: boolean;
	onRefresh: () => void;
	onSelect: (clientUid: string) => void;
	selectedClientUid: string;
};

export default function Chatlog({
	rows,
	unreadCounts,
	status,
	isLoading,
	onRefresh,
	onSelect,
	selectedClientUid,
}: ChatlogProps) {

	return (
		<section className="rounded-b-xl border border-black/20 bg-white text-black">
			<header className="flex items-center justify-between border-b border-black/15 bg-white px-3 py-2">
				<h2 className="text-[42px] font-semibold leading-none">All Messages</h2>
			</header>

			<div className="max-h-[64vh] overflow-y-auto p-2">
				{rows.length === 0 ? (
					<p className="rounded border border-black/10 p-3 text-sm text-black/70">
						No client messages found.
					</p>
				) : (
					<ul className="space-y-2">
						{rows.map((row) => (
							<li key={row.uid}>
								{(() => {
									const unreadCount = unreadCounts[row.uid] ?? 0;
									return (
								<button
									type="button"
									onClick={() => onSelect(row.uid)}
									className={`flex w-full items-center gap-3 rounded-lg border px-3 py-3 text-left transition-transform duration-200 hover:-translate-y-1 hover:scale-[1.01] active:translate-y-0 active:scale-100 ${
										selectedClientUid === row.uid
											? "border-transparent bg-linear-to-b from-[#6b4dff] to-[#5a33f0] text-white"
											: "border-black/15 bg-white text-black"
									}`}
								>
									<div className="h-12 w-12 rounded-full border border-black/20 bg-black/5" />
									<div className="min-w-0 flex-1">
										<p className="truncate text-2xl font-semibold leading-tight">{row.label}</p>
										<p className="truncate text-sm opacity-80">{row.lastMessage}</p>
									</div>
									<div className="flex shrink-0 items-center gap-2">
										<p className="text-xs opacity-80">{row.timeLabel || ""}</p>
										{unreadCount > 0 ? (
											<span className="inline-flex h-6 min-w-6 items-center justify-center rounded-full bg-[#ff4d4f] px-2 text-xs font-semibold text-white">
												{unreadCount > 99 ? "99+" : unreadCount}
											</span>
										) : null}
									</div>
								</button>
									);
								})()}
							</li>
						))}
					</ul>
				)}
			</div>

			<p className="border-t border-black/10 px-3 py-2 text-xs text-black/65">
				{status}
			</p>
		</section>
	);
}
