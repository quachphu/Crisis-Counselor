"use client";

import type { ReactNode } from "react";

export type StatusBannerVariant = "success" | "info" | "warning" | "danger";

type StatusBannerProps = {
	/** Banner text */
	text: string;
	/** Visual variant controlling colors */
	variant?: StatusBannerVariant;
	/** Optional leading icon/element */
	icon?: ReactNode;
};

const VARIANT_STYLES: Record<StatusBannerVariant, string> = {
	success: "bg-[#22c55e]/15 text-[#22c55e] border-[#22c55e]/20",
	info: "bg-[#5b6fff]/15 text-[#93a3ff] border-[#5b6fff]/20",
	warning: "bg-[#f59e0b]/15 text-[#f59e0b] border-[#f59e0b]/20",
	danger: "bg-[#ef4444]/15 text-[#ef4444] border-[#ef4444]/20",
};

export default function StatusBanner({ text, variant = "success", icon }: StatusBannerProps) {
	return (
		<div
			className={`flex items-center gap-2 rounded-lg border px-3 py-2 text-xs font-medium ${VARIANT_STYLES[variant]}`}
		>
			{icon ?? <span className="h-2 w-2 rounded-full bg-current" />}
			<span>{text}</span>
		</div>
	);
}
