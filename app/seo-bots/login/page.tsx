import { signInBot } from "@/lib/seoBots/botActions";

export const dynamic = "force-dynamic";

export default async function SeoBotLogin({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const { error } = await searchParams;
  return <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center px-5 py-8">
    <p className="text-sm text-accent-400">Freelance HQ</p>
    <h1 className="mt-2 text-3xl font-semibold text-neutral-100">SEO Bot sign in</h1>
    <p className="mt-2 text-sm text-neutral-400">Use your bot access key to open today’s SEO tasks.</p>
    <form action={signInBot} className="mt-6 space-y-4 rounded-xl border border-base-700 bg-base-850 p-5">
      <label className="block text-sm">Bot access key<input name="key" type="password" required maxLength={47} autoComplete="off" className="mt-2 w-full rounded-md border border-base-600 bg-base-950 p-3" /></label>
      {error && <p role="alert" className="text-sm text-amber-300">{error === "unavailable" ? "Sign-in is unavailable. Try again shortly." : "That bot access key is invalid or disabled."}</p>}
      <button className="rounded-md bg-accent-500 px-4 py-2 font-semibold text-base-950">Open daily tasks</button>
    </form>
  </main>;
}
