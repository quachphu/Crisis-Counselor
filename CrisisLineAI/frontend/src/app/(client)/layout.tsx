export default function ClientLayout({ children }: { children: React.ReactNode }) {
	return (
		<div className="h-screen overflow-hidden bg-[#0f1724]" style={{ background: "#0f1724" }}>
			{children}
		</div>
	);
}
