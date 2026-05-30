"use client";

import type { ReactNode } from "react";

export type InfoBannerVariant = "ai" | "counselor";

type InfoBannerProps = {
	/** Banner text */
	text: string;
	/** Visual variant */
	variant?: InfoBannerVariant;
	/** Optional leading icon */
	icon?: ReactNode;
	/** Action button label (omit to hide button) */
	actionLabel?: string;
	/** Action button handler */
	onAction?: () => void;
	/** Whether the action button is disabled */
	actionDisabled?: boolean;
};

const VARIANT_STYLES: Record<InfoBannerVariant, string> = {
	ai: "bg-[#1e3a5f]/60 border-[#2a4a6f]",
	counselor: "bg-[#22c55e]/10 border-[#22c55e]/20",
};

export default function InfoBanner({
	text,
	variant = "ai",
	icon,
	actionLabel,
	onAction,
	actionDisabled = false,
}: InfoBannerProps) {
	return (
		<div
			className={`flex items-center justify-between gap-3 rounded-lg border px-4 py-2.5 ${VARIANT_STYLES[variant]}`}
		>
			<div className="flex items-center gap-2 text-sm text-[#c4cad8]">
				{icon ?? <span className="text-base">🤖</span>}
				<span>{text}</span>
			</div>
			{actionLabel ? (
				<button
					type="button"
					onClick={onAction}
					disabled={actionDisabled}
					className="shrink-0 rounded-lg border border-[#5b6fff]/60 px-3 py-1.5 text-xs font-semibold text-[#93a3ff] transition-colors hover:bg-[#5b6fff]/20 disabled:cursor-not-allowed disabled:opacity-50"
				>
					↪ {actionLabel}
				</button>
			) : null}
		</div>
	);
}
