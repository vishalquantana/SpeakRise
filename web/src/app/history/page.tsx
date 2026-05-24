import { redirect } from "next/navigation";
import { getSession } from "@/lib/session";
import { db } from "@/lib/db";
import Link from "next/link";
import Nav from "@/components/nav";

const LEVEL_NAMES = ["", "Learning", "Speaking", "Communicating", "Persuading", "Inspiring"];

export default async function HistoryPage() {
  const session = await getSession();
  if (!session.userId) redirect("/login");

  const sessionsResult = await db.execute({
    sql: `SELECT s.id, s.started_at, s.duration_seconds, s.session_type, a.overall_level
          FROM sessions s LEFT JOIN assessments a ON a.session_id = s.id
          WHERE s.user_id = ? AND s.ended_at IS NOT NULL
          ORDER BY s.started_at DESC LIMIT 50`,
    args: [session.userId],
  });

  return (
    <div className="min-h-screen bg-[var(--background)] pb-20">
      <header className="px-6 pt-6 pb-4">
        <h1 className="text-xl font-bold text-[var(--foreground)]">Session History</h1>
      </header>

      <div className="px-6 space-y-2">
        {sessionsResult.rows.length === 0 ? (
          <p className="text-[var(--muted)] text-center py-8">No sessions yet</p>
        ) : (
          sessionsResult.rows.map((r) => (
            <Link
              key={r.id as string}
              href={`/report/${r.id}`}
              className="block p-4 bg-white rounded-xl border border-[var(--card-border)] hover:border-[var(--accent)] transition"
            >
              <div className="flex justify-between items-center">
                <div>
                  <p className="text-sm font-medium text-[var(--foreground)]">
                    {new Date(r.started_at as string).toLocaleDateString("en-US", {
                      weekday: "short", month: "short", day: "numeric",
                    })}
                  </p>
                  <p className="text-xs text-[var(--muted)] mt-0.5">
                    {r.session_type === "baseline" ? "Baseline Assessment" : "Daily Practice"}
                    {" · "}
                    {Math.round((r.duration_seconds as number) / 60)} min
                  </p>
                </div>
                {r.overall_level && (
                  <div className="text-right">
                    <p className="text-sm font-semibold text-[var(--accent)]">L{r.overall_level as number}</p>
                    <p className="text-xs text-[var(--muted)]">{LEVEL_NAMES[r.overall_level as number]}</p>
                  </div>
                )}
              </div>
            </Link>
          ))
        )}
      </div>

      <Nav />
    </div>
  );
}
