"use client";

import { useState } from "react";
import type { HandlerMode } from "@/lib/chat-types";

type AgentchoicesProps = {
	mode: HandlerMode;
	disabled?: boolean;
	onSelectCounselor: () => void;
	statusText?: string;
};

export default function Agentchoices({
	mode,
	disabled = false,
	onSelectCounselor,
	statusText,
}: AgentchoicesProps) {
	const [isConfirmingCounselorTakeover, setIsConfirmingCounselorTakeover] = useState(false);

	return (
		<section className="border-b border-black/15 bg-white px-4 py-3 text-black">
			<p className="text-xs font-semibold uppercase tracking-wide text-black">Reply Handler</p>
			<div className="mt-2">
				<button
					type="button"
					onClick={() => setIsConfirmingCounselorTakeover(true)}
					disabled={disabled || mode === "counselor"}
					className={`w-full rounded-md border px-3 py-2 text-xs font-semibold transition-all duration-200 ${
						mode === "counselor"
							? "border-transparent bg-linear-to-b from-[#7c67ff] to-[#5b38f5] text-white"
							: "border-black/20 hover:-translate-y-0.5 hover:scale-[1.01] hover:bg-black/5 active:translate-y-0 active:scale-100"
					} disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:translate-y-0 disabled:hover:scale-100 disabled:hover:bg-transparent`}
				>
					I will answer the chat
				</button>
			</div>
			{isConfirmingCounselorTakeover ? (
				<div className="mt-2 flex items-center gap-2">
					<p className="text-xs text-black/85">Are you sure?</p>
					<button
						type="button"
						onClick={() => {
							onSelectCounselor();
							setIsConfirmingCounselorTakeover(false);
						}}
						disabled={disabled}
						className="rounded-md border border-transparent bg-linear-to-b from-[#7c67ff] to-[#5b38f5] px-2 py-1 text-xs font-semibold text-white disabled:cursor-not-allowed disabled:opacity-60"
					>
						Yes
					</button>
					<button
						type="button"
						onClick={() => setIsConfirmingCounselorTakeover(false)}
						disabled={disabled}
						className="rounded-md border border-black/20 px-2 py-1 text-xs font-semibold disabled:cursor-not-allowed disabled:opacity-60"
					>
						No
					</button>
				</div>
			) : null}
			{statusText ? <p className="mt-2 text-xs text-black/80">{statusText}</p> : null}
		</section>
	);
}
