import Link from "next/link";

export default function Home() {
  return (
    <main className="flex min-h-dvh flex-col">
      <div className="candy-stripe" />
      <div className="flex flex-1 flex-col items-center justify-center gap-4 bg-evergreen px-6 py-16 text-center text-cream">
        <p className="text-[13px] uppercase tracking-[0.12em] text-gold">Private family site</p>
        <h1 className="font-display text-4xl font-bold sm:text-5xl">Family Christmas Draw</h1>
        <p className="max-w-sm text-base leading-relaxed text-sage">
          If you got a link in a text, open that link to see your gift tag. It&apos;s just for you.
        </p>
        <Link href="/admin" className="mt-6 inline-flex min-h-11 items-center px-3 text-sm text-sage underline">
          Admin
        </Link>
      </div>
    </main>
  );
}
