export type MessageInputTheme = "light" | "dark";

type MessageInputProps = {
	value: string;
	onChange: (value: string) => void;
	onSend: () => void;
	onReload?: () => void;
	isSending?: boolean;
	isDisabled?: boolean;
	placeholder?: string;
	/** Color theme — "light" (default) for client view, "dark" for counselor view */
	theme?: MessageInputTheme;
};

const THEME_STYLES = {
	light: {
		wrapper: "rounded-2xl border border-[#bfc3d1] bg-white px-3 py-2",
		icons: "flex items-center gap-2 pb-2 text-lg text-[#444a5d]",
		textarea:
			"h-10 max-h-28 flex-1 resize-y bg-transparent px-2 py-2 text-sm text-[#232632] placeholder:text-[#7b8092] outline-none",
		reload:
			"rounded-md border border-[#b7bbcb] px-3 py-2 text-xs font-medium text-[#3d4254] hover:bg-[#eceefe]",
		send: "rounded-md border border-transparent bg-linear-to-b from-[#7c67ff] to-[#5b38f5] px-4 py-2 text-sm font-semibold text-white hover:from-[#725cff] hover:to-[#4f2ef0] disabled:cursor-not-allowed disabled:opacity-50",
	},
	dark: {
		wrapper: "rounded-2xl border border-[#2a3545] bg-[#1a2332] px-3 py-2",
		icons: "flex items-center gap-2 pb-2 text-lg text-[#8b93a7]",
		textarea:
			"h-10 max-h-28 flex-1 resize-y bg-transparent px-2 py-2 text-sm text-white placeholder:text-[#64748b] outline-none",
		reload:
			"rounded-md border border-[#2a3545] px-3 py-2 text-xs font-medium text-[#8b93a7] hover:bg-[#243044]",
		send: "rounded-md border border-transparent bg-linear-to-b from-[#5b6fff] to-[#4f5dff] px-4 py-2 text-sm font-semibold text-white hover:from-[#6b7fff] hover:to-[#5b6fff] disabled:cursor-not-allowed disabled:opacity-50",
	},
} as const;

export default function MessageInput({
	value,
	onChange,
	onSend,
	onReload,
	isSending = false,
	isDisabled = false,
	placeholder = "Send messages...",
	theme = "light",
}: MessageInputProps) {
	const s = THEME_STYLES[theme];

	return (
		<div className={s.wrapper}>
			<div className="flex items-end gap-2">
				<textarea
					className={s.textarea}
					rows={1}
					disabled={isDisabled}
					value={value}
					onChange={(event) => onChange(event.target.value)}
					onKeyDown={(event) => {
						if (event.key === "Enter" && !event.shiftKey) {
							event.preventDefault();
							onSend();
						}
					}}
					placeholder={placeholder}
				/>

				{onReload ? (
					<button type="button" onClick={onReload} className={s.reload}>
						Reload
					</button>
				) : null}

				<button
					type="button"
					onClick={onSend}
					disabled={isDisabled || isSending || value.trim().length === 0}
					className={s.send}
				>
					{isSending ? "Sending..." : "Send ↑"}
				</button>
			</div>
		</div>
	);
}
