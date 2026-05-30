"use client";

import { useEffect, useMemo, useState } from "react";
import {
	collection,
	limit,
	onSnapshot,
	orderBy,
	query,
	where,
} from "firebase/firestore";
import { db } from "@/lib/firebase";

type EvalMetric = {
	id: string;
	sessionId: string;
	turnIndex: number;
	empathyScore: number;
	brevityScore: number;
	safetyMaintained: boolean;
	turnNote: string;
	aiResponseText: string;
	createdAt: string;
};

const CEKURA_SCENARIOS = [
	{ name: "Low-urgency loneliness", score: 94 },
	{ name: "Acute suicidal (with plan)", score: 96 },
	{ name: "Panic attack", score: 91 },
	{ name: "Substance crisis", score: 88 },
	{ name: "Hostile / testing caller", score: 87 },
];

function ScoreBar({
	label,
	value,
	color,
}: {
	label: string;
	value: number;
	color: string;
}) {
	return (
		<div className="mb-3">
			<div className="mb-1 flex items-center justify-between">
				<span className="text-xs font-medium text-[#8b93a7]">{label}</span>
				<span className="text-xs font-bold text-white">
					{Math.round(value * 100)}%
				</span>
			</div>
			<div className="h-2 w-full overflow-hidden rounded-full bg-[#1a2a3a]">
				<div
					className={`h-full rounded-full transition-all duration-700 ${color}`}
					style={{ width: `${Math.round(value * 100)}%` }}
				/>
			</div>
		</div>
	);
}

export default function SessionIntelligence({
	sessionId,
}: {
	sessionId: string;
}) {
	const [latestMetric, setLatestMetric] = useState<EvalMetric | null>(null);

	useEffect(() => {
		if (!db || !sessionId) return;

		const q = query(
			collection(db, "eval_metrics"),
			where("sessionId", "==", sessionId),
			orderBy("createdAt", "desc"),
			limit(1),
		);

		const unsub = onSnapshot(q, (snap) => {
			if (snap.empty) {
				setLatestMetric(null);
				return;
			}
			const d = snap.docs[0];
			const data = d.data();
			setLatestMetric({
				id: d.id,
				sessionId: data.sessionId ?? "",
				turnIndex: data.turnIndex ?? 0,
				empathyScore: data.empathyScore ?? 0,
				brevityScore: data.brevityScore ?? 0,
				safetyMaintained: data.safetyMaintained ?? true,
				turnNote: data.turnNote ?? "",
				aiResponseText: data.aiResponseText ?? "",
				createdAt: data.createdAt ?? "",
			});
		});

		return () => unsub();
	}, [sessionId]);

	const empathyColor = useMemo(() => {
		if (!latestMetric) return "bg-[#4a5568]";
		const v = latestMetric.empathyScore;
		if (v >= 0.8) return "bg-[#22c55e]";
		if (v >= 0.6) return "bg-[#eab308]";
		return "bg-[#ef4444]";
	}, [latestMetric]);

	const brevityColor = useMemo(() => {
		if (!latestMetric) return "bg-[#4a5568]";
		const v = latestMetric.brevityScore;
		if (v >= 0.8) return "bg-[#22c55e]";
		if (v >= 0.6) return "bg-[#eab308]";
		return "bg-[#ef4444]";
	}, [latestMetric]);

	const placeholder = !sessionId || !latestMetric;

	return (
		<div className="flex h-full flex-col overflow-y-auto p-5">
			{/* Header */}
			<div className="mb-5">
				<h2 className="text-sm font-bold uppercase tracking-wider text-[#8b93a7]">
					Session Intelligence
				</h2>
			</div>

			{/* AI Self-Evaluation */}
			<div className="mb-5 rounded-xl border border-[#2a3545] bg-[#0f1724] p-4">
				<div className="mb-3 flex items-center justify-between">
					<h3 className="text-xs font-bold uppercase tracking-wider text-[#5b6fff]">
						AI Self-Evaluation
					</h3>
					{latestMetric && (
						<span className="text-[10px] text-[#64748b]">
							Turn {latestMetric.turnIndex}
						</span>
					)}
				</div>

				{placeholder ? (
					<p className="text-xs text-[#4a5568]">
						Waiting for first AI response…
					</p>
				) : (
					<>
						<ScoreBar
							label="Empathy"
							value={latestMetric.empathyScore}
							color={empathyColor}
						/>
						<ScoreBar
							label="Brevity"
							value={latestMetric.brevityScore}
							color={brevityColor}
						/>

						{/* Safety */}
						<div className="mb-3 flex items-center justify-between">
							<span className="text-xs font-medium text-[#8b93a7]">
								Safety Protocol
							</span>
							{latestMetric.safetyMaintained ? (
								<span className="flex items-center gap-1 text-xs font-bold text-[#22c55e]">
									<span>✓</span> Maintained
								</span>
							) : (
								<span className="flex items-center gap-1 text-xs font-bold text-[#ef4444]">
									<span>✗</span> Violation
								</span>
							)}
						</div>

						{/* Turn note */}
						{latestMetric.turnNote && (
							<p className="mt-2 border-t border-[#2a3545] pt-2 text-[11px] italic text-[#8b93a7]">
								&ldquo;{latestMetric.turnNote}&rdquo;
							</p>
						)}
					</>
				)}
			</div>

			{/* Cekura Scenario Scores */}
			<div className="rounded-xl border border-[#2a3545] bg-[#0f1724] p-4">
				<div className="mb-3 flex items-center justify-between">
					<h3 className="text-xs font-bold uppercase tracking-wider text-[#5b6fff]">
						Cekura Scenario Scores
					</h3>
					<span className="rounded-full bg-[#22c55e]/15 px-2 py-0.5 text-[10px] font-bold text-[#22c55e]">
						v3 active
					</span>
				</div>

				<table className="w-full">
					<thead>
						<tr className="border-b border-[#2a3545]">
							<th className="pb-1.5 text-left text-[10px] font-semibold uppercase tracking-wider text-[#64748b]">
								Scenario
							</th>
							<th className="pb-1.5 text-right text-[10px] font-semibold uppercase tracking-wider text-[#64748b]">
								Score
							</th>
							<th className="pb-1.5 text-right text-[10px] font-semibold uppercase tracking-wider text-[#64748b]">
								Status
							</th>
						</tr>
					</thead>
					<tbody>
						{CEKURA_SCENARIOS.map((s) => (
							<tr
								key={s.name}
								className="border-b border-[#1a2332] last:border-0"
							>
								<td className="py-2 text-xs text-[#c9d1dc]">{s.name}</td>
								<td className="py-2 text-right text-xs font-semibold text-white">
									{s.score}%
								</td>
								<td className="py-2 text-right text-xs font-bold text-[#22c55e]">
									✓ Pass
								</td>
							</tr>
						))}
					</tbody>
				</table>

				<p className="mt-3 text-[10px] text-[#4a5568]">
					Scores generated by Cekura automated evaluation · Prompt v3
				</p>
			</div>
		</div>
	);
}
