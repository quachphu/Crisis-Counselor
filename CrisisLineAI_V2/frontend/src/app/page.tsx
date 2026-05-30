import Link from "next/link";

export default function Home() {
	return (
		<div className="mx-auto flex min-h-screen w-full max-w-4xl items-center justify-center px-6 py-16">
			<main className="w-full max-w-md rounded-2xl border border-black/10 bg-background p-8 text-center dark:border-white/10">
				<h1 className="text-3xl font-semibold tracking-tight">UCI Hackathon Frontend</h1>
				<p className="mt-3 text-sm text-foreground/70">Start chat as a guest client.</p>
				<Link
					href="/chat"
					className="mt-6 inline-flex rounded-md border border-black bg-black px-5 py-3 text-sm font-semibold text-white dark:border-white dark:bg-white dark:text-black"
				>
					Go to Chat
				</Link>
			</main>
		</div>
	);
}
