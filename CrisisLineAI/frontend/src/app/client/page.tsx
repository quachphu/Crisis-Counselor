import Link from "next/link";

export default function ClientLandingPage() {
  return (
    <main className="mx-auto flex min-h-screen w-full max-w-3xl items-center px-6 py-12">
      <section className="w-full rounded-xl border border-black/10 p-6 dark:border-white/10">
        <h1 className="text-3xl font-semibold">Client Page</h1>
        <p className="mt-2 text-sm text-foreground/70">
          Client channel entry point for testing.
        </p>

        <div className="mt-5 flex gap-2">
          <Link href="/chat" className="rounded-md border px-3 py-2 text-sm">
            Open Client Chat (/chat)
          </Link>
          <Link href="/counselor" className="rounded-md border px-3 py-2 text-sm">
            Open Counselor (/counselor)
          </Link>
        </div>
      </section>
    </main>
  );
}
