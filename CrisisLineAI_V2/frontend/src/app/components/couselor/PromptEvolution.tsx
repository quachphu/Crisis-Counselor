"use client";

import { useEffect, useState } from "react";
import { collection, onSnapshot, orderBy, query } from "firebase/firestore";
import { db } from "@/lib/firebase";

type PromptVersion = {
	version: string;
	createdAt: string;
	scores: {
		empathyScore: number;
		brevityScore: number;
		escalationAccuracy: number;
		safetyRate: number;
		avgTtfbMs: number;
	};
	changes: string;
	failedScenarios: string[];
};

function ScoreBadge({
	label,
	value,
	isRate = true,
}: {
	label: string;
	value: number;
	isRate?: boolean;
}) {
	const pct = isRate ? Math.round(value * 100) : value;
	const color =
		pct >= 90
			? "bg-[#22c55e]/15 text-[#22c55e]"
			: pct >= 75
				? "bg-[#eab308]/15 text-[#eab308]"
				: "bg-[#ef4444]/15 text-[#ef4444]";
	return (
		<div className={`rounded-md px-2 py-1 text-center ${color}`}>
			<div className="text-[10px] font-semibold uppercase tracking-wide opacity-70">
				{label}
			</div>
			<div className="text-xs font-bold">{isRate ? `${pct}%` : `${pct}ms`}</div>
		</div>
	);
}

const AUTO_IMPROVE_STEPS = [
	"Live Call",
	"AI Self-Eval",
	"Cekura Report",
	"GPT-4.1 Optimizer",
	"New Prompt",
	"Deploy",
];

export default function PromptEvolution() {
	const [versions, setVersions] = useState<PromptVersion[]>([]);
	const [activeVersion, setActiveVersion] = useState<string>("v3");

	useEffect(() => {
		if (!db) return;

		// Listen for active pointer
		const activeUnsub = onSnapshot(
			collection(db, "prompt_versions"),
			(snap) => {
				const docs: PromptVersion[] = [];
				let active = "v3";
				snap.forEach((d) => {
					if (d.id === "active") {
						active = d.data().version ?? "v3";
						return;
					}
					const data = d.data();
					if (data.version && data.scores) {
						docs.push({
							version: data.version,
							createdAt: data.createdAt ?? "",
							scores: data.scores,
							changes: data.changes ?? "",
							failedScenarios: data.failedScenarios ?? [],
						});
					}
				});
				// Sort by version string (v1 < v2 < v3)
				docs.sort((a, b) => a.version.localeCompare(b.version));
				setVersions(docs);
				setActiveVersion(active);
			},
		);

		return () => activeUnsub();
	}, []);

	return (
		<div className="flex h-full flex-col overflow-y-auto p-5">
			{/* Header */}
			<div className="mb-1">
				<h2 className="text-sm font-bold uppercase tracking-wider text-[#8b93a7]">
					Prompt Evolution
				</h2>
				<p className="text-[11px] text-[#4a5568]">
					Agent improves with every session
				</p>
			</div>

			{/* Active badge */}
			<div className="mb-5 mt-2 flex items-center gap-2">
				<span className="inline-flex items-center gap-1.5 rounded-full bg-[#22c55e]/15 px-3 py-1 text-xs font-bold text-[#22c55e]">
					<span className="h-1.5 w-1.5 rounded-full bg-[#22c55e]" />
					Active: {activeVersion}
				</span>
			</div>

			{/* Version timeline */}
			<div className="relative flex flex-col gap-0">
				{versions.length === 0 ? (
					<p className="text-xs text-[#4a5568]">No prompt versions found.</p>
				) : (
					versions.map((v, idx) => {
						const isActive = v.version === activeVersion;
						const isLast = idx === versions.length - 1;
						const dateLabel = v.createdAt
							? new Date(v.createdAt).toLocaleTimeString([], {
									hour: "2-digit",
									minute: "2-digit",
								})
							: "";

						return (
							<div key={v.version} className="relative">
								{/* Connector line */}
								{!isLast && (
									<div className="absolute left-[18px] top-full z-0 h-4 w-px bg-[#2a3545]" />
								)}

								<div
									className={`relative z-10 mb-1 rounded-xl border p-4 transition-colors ${
										isActive
											? "border-[#22c55e]/40 bg-[#0f1f14]"
											: "border-[#2a3545] bg-[#0f1724]"
									}`}
								>
									{/* Version header */}
									<div className="mb-2 flex items-center justify-between">
										<div className="flex items-center gap-2">
											<span
												className={`rounded-full px-2.5 py-0.5 text-xs font-bold ${
													isActive
														? "bg-[#22c55e] text-[#0a1a0a]"
														: "bg-[#2a3545] text-[#8b93a7]"
												}`}
											>
												{v.version.toUpperCase()}
											</span>
											{isActive && (
												<span className="flex items-center gap-1 text-[10px] font-semibold text-[#22c55e]">
													<span className="inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-[#22c55e]" />
													ACTIVE
												</span>
											)}
										</div>
										<span className="text-[10px] text-[#4a5568]">
											{dateLabel}
										</span>
									</div>

									{/* Score badges */}
									<div className="mb-3 grid grid-cols-4 gap-1.5">
										<ScoreBadge
											label="Emp"
											value={v.scores.empathyScore}
										/>
										<ScoreBadge
											label="Brev"
											value={v.scores.brevityScore}
										/>
										<ScoreBadge
											label="Esc"
											value={v.scores.escalationAccuracy}
										/>
										<ScoreBadge
											label="Safe"
											value={v.scores.safetyRate}
										/>
									</div>

									{/* Changes */}
									<p className="mb-2 text-[11px] italic text-[#8b93a7]">
										{v.changes}
									</p>

									{/* Failed scenarios */}
									{v.failedScenarios.length > 0 ? (
										<div className="flex flex-wrap gap-1">
											{v.failedScenarios.map((s) => (
												<span
													key={s}
													className="rounded-full bg-[#ef4444]/15 px-2 py-0.5 text-[10px] font-semibold text-[#ef4444]"
												>
													✗ {s.replace(/_/g, " ")}
												</span>
											))}
										</div>
									) : (
										<span className="rounded-full bg-[#22c55e]/10 px-2 py-0.5 text-[10px] font-semibold text-[#22c55e]">
											✓ All scenarios passing
										</span>
									)}
								</div>

								{/* Arrow between versions */}
								{!isLast && (
									<div className="flex justify-center py-1 text-[#2a3545]">
										↓
									</div>
								)}
							</div>
						);
					})
				)}
			</div>

			{/* Auto-Improve Loop diagram */}
			<div className="mt-5 rounded-xl border border-[#2a3545] bg-[#0c1420] p-4">
				<h3 className="mb-3 text-xs font-bold uppercase tracking-wider text-[#5b6fff]">
					Auto-Improve Loop
				</h3>
				<div className="flex flex-wrap items-center gap-1">
					{AUTO_IMPROVE_STEPS.map((step, idx) => (
						<div key={step} className="flex items-center gap-1">
							<span className="rounded-md bg-[#1a2a3a] px-2 py-1 text-[10px] font-semibold text-[#8b93a7]">
								{step}
							</span>
							{idx < AUTO_IMPROVE_STEPS.length - 1 && (
								<span className="text-[10px] text-[#2a3545]">→</span>
							)}
						</div>
					))}
				</div>
				<p className="mt-2 text-[10px] text-[#4a5568]">
					Every session makes the agent safer and more empathetic
				</p>
			</div>
		</div>
	);
}
