import { redirect } from "next/navigation";
import { getSession } from "@/lib/session";
import { db } from "@/lib/db";
import Link from "next/link";
import Nav from "@/components/nav";

const LEVELS = [
  {
    n: 1,
    name: "Learning",
    tagline: "Building your foundation",
    description:
      "You are getting comfortable speaking out loud. You can share short answers and simple ideas, even if you pause to find words.",
    canDo: ["Answer simple questions", "Use everyday vocabulary", "Speak in short sentences"],
  },
  {
    n: 2,
    name: "Speaking",
    tagline: "Finding your flow",
    description:
      "You can hold a basic conversation and keep it going. You make some mistakes, but you express your main ideas clearly.",
    canDo: ["Describe your day and routine", "Ask and answer follow-up questions", "Talk about familiar topics"],
  },
  {
    n: 3,
    name: "Communicating",
    tagline: "Getting your point across",
    description:
      "You speak with more confidence and detail. You can explain your thinking, give opinions, and handle most everyday work conversations.",
    canDo: ["Explain ideas with detail", "Share and support opinions", "Handle meetings and small talk"],
  },
  {
    n: 4,
    name: "Persuading",
    tagline: "Influencing with words",
    description:
      "You use language to convince and negotiate. You structure your arguments well and adapt your tone to your audience.",
    canDo: ["Make a clear argument", "Negotiate and handle pushback", "Present ideas convincingly"],
  },
  {
    n: 5,
    name: "Inspiring",
    tagline: "Speaking with impact",
    description:
      "You speak fluently and naturally. You can lead discussions, tell compelling stories, and move people to action.",
    canDo: ["Lead and facilitate discussions", "Tell stories that land", "Speak with nuance and impact"],
  },
];

export default async function LevelsPage() {
  const session = await getSession();
  if (!session.userId) redirect("/login");

  const userResult = await db.execute({
    sql: "SELECT current_level FROM users WHERE id = ?",
    args: [session.userId],
  });
  const currentLevel = (userResult.rows[0]?.current_level as number) || 1;

  return (
    <div className="min-h-screen pb-20 bg-[var(--background)]">
      <header className="px-6 pt-6 pb-4">
        <Link href="/dashboard" className="text-[var(--muted)] text-sm hover:text-[var(--foreground)] transition">
          &larr; Back to dashboard
        </Link>
        <h1 className="text-xl font-bold mt-2 text-[var(--foreground)]">The 5 Levels</h1>
        <p className="text-sm text-[var(--muted)] mt-1">
          Everyone progresses through five levels of spoken English. Practice daily to move up.
        </p>
      </header>

      <div className="mx-6 space-y-3">
        {LEVELS.map((lvl) => {
          const isCurrent = lvl.n === currentLevel;
          return (
            <div
              key={lvl.n}
              className={`p-5 rounded-2xl border shadow-sm ${
                isCurrent
                  ? "bg-[var(--accent-light)] border-[var(--accent)]"
                  : "bg-white border-[var(--card-border)]"
              }`}
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <span
                    className={`flex items-center justify-center w-9 h-9 rounded-full font-bold text-sm ${
                      isCurrent ? "bg-[var(--accent)] text-white" : "bg-[var(--card-border)] text-[var(--muted)]"
                    }`}
                  >
                    {lvl.n}
                  </span>
                  <div>
                    <p className="font-bold text-[var(--foreground)]">{lvl.name}</p>
                    <p className="text-xs text-[var(--muted)]">{lvl.tagline}</p>
                  </div>
                </div>
                {isCurrent && (
                  <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-[var(--accent)] text-white">
                    You are here
                  </span>
                )}
              </div>
              <p className="text-sm text-[var(--foreground)] mt-3 leading-relaxed">{lvl.description}</p>
              <ul className="mt-3 space-y-1">
                {lvl.canDo.map((item, i) => (
                  <li key={i} className="text-sm text-[var(--muted)] flex items-start gap-2">
                    <span className="text-[var(--success)] mt-0.5">&#10003;</span>
                    {item}
                  </li>
                ))}
              </ul>
            </div>
          );
        })}
      </div>

      <Nav />
    </div>
  );
}
