"use client";

type DateSeparatorProps = {
	/** The text to display in the separator (e.g. "Today · 11:02 PM") */
	text: string;
};

export default function DateSeparator({ text }: DateSeparatorProps) {
	return (
		<div className="flex items-center gap-3 py-4">
			<div className="h-px flex-1 bg-[#2a3545]" />
			<span className="shrink-0 text-[11px] font-medium text-[#8b93a7]">{text}</span>
			<div className="h-px flex-1 bg-[#2a3545]" />
		</div>
	);
}
