"use client";

export type RiskLevel = "low" | "medium" | "high" | "critical";

type RiskBadgeProps = {
	level: RiskLevel;
};

const RISK_STYLES: Record<RiskLevel, { bg: string; dot: string; label: string }> = {
	low: { bg: "bg-[#22c55e]/15 text-[#22c55e]", dot: "bg-[#22c55e]", label: "LOW RISK" },
	medium: { bg: "bg-[#f59e0b]/15 text-[#f59e0b]", dot: "bg-[#f59e0b]", label: "MEDIUM RISK" },
	high: { bg: "bg-[#ef4444]/15 text-[#ef4444]", dot: "bg-[#ef4444]", label: "HIGH RISK" },
	critical: { bg: "bg-[#dc2626]/15 text-[#dc2626]", dot: "bg-[#dc2626]", label: "CRITICAL RISK" },
};

export default function RiskBadge({ level }: RiskBadgeProps) {
	const { bg, dot, label } = RISK_STYLES[level];

	return (
		<span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[11px] font-bold uppercase tracking-wide ${bg}`}>
			<span className={`h-1.5 w-1.5 rounded-full ${dot}`} />
			{label}
		</span>
	);
}
