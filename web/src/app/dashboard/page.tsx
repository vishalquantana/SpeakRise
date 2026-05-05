import { redirect } from "next/navigation";
import { getSession } from "@/lib/session";
import { db } from "@/lib/db";
import Link from "next/link";
import ProgressBar from "@/components/progress-bar";
import Nav from "@/components/nav";

const LEVEL_NAMES = ["", "Learning", "Speaking", "Communicating", "Persuading", "Inspiring"];

export default async function DashboardPage() {
  const session = await getSession();
  if (!session.userId) redirect("/login");

  const userResult = await db.execute({
    sql: "SELECT * FROM users WHERE id = ?",
    args: [session.userId],
  });
  if (userResult.rows.length === 0) redirect("/login");
  const user = userResult.rows[0];

  if (!user.onboarding_complete) redirect("/onboarding");

  const progressResult = await db.execute({
    sql: "SELECT skill, score FROM progress WHERE user_id = ? ORDER BY skill",
    args: [session.userId],
  });

  const todayResult = await db.execute({
    sql: `SELECT id FROM sessions WHERE user_id = ? AND session_type = 'daily'
          AND date(started_at) = date('now') AND ended_at IS NOT NULL`,
    args: [session.userId],
  });
  const completedToday = todayResult.rows.length > 0;

  const recentResult = await db.execute({
    sql: `SELECT s.id, s.started_at, s.duration_seconds, a.overall_level
          FROM sessions s LEFT JOIN assessments a ON a.session_id = s.id
          WHERE s.user_id = ? AND s.ended_at IS NOT NULL
          ORDER BY s.started_at DESC LIMIT 5`,
    args: [session.userId],
  });

  const level = user.current_level as number;

  return (
    <div className="min-h-screen pb-20">
      <header className="px-6 pt-6 pb-4">
        <h1 className="text-2xl font-bold">
          Speak<span className="text-indigo-500">Rise</span>
        </h1>
        <p className="text-gray-400 text-sm mt-1">{user.email as string}</p>
      </header>

      <div className="mx-6 p-5 bg-gray-900 rounded-2xl border border-gray-800">
        <div className="flex items-center justify-between mb-3">
          <div>
            <p className="text-gray-400 text-xs uppercase tracking-wide">Current Level</p>
            <p className="text-2xl font-bold mt-1">
              L{level} — {LEVEL_NAMES[level]}
            </p>
          </div>
          <div className="w-14 h-14 rounded-full bg-indigo-600/20 flex items-center justify-center text-2xl font-bold text-indigo-400">
            {level}
          </div>
        </div>
      </div>

      <div className="mx-6 mt-4">
        {completedToday ? (
          <div className="p-4 bg-green-900/20 border border-green-800 rounded-xl text-center">
            <p className="text-green-400 font-medium">Today's session complete</p>
            <Link href="/session" className="text-sm text-indigo-400 mt-1 inline-block">
              Practice more
            </Link>
          </div>
        ) : (
          <Link
            href="/session"
            className="block w-full py-4 bg-indigo-600 hover:bg-indigo-700 rounded-xl text-center font-semibold text-lg transition"
          >
            Start Today's Session
          </Link>
        )}
      </div>

      {progressResult.rows.length > 0 && (
        <div className="mx-6 mt-6">
          <h2 className="text-lg font-semibold mb-3">Skills</h2>
          <div className="space-y-3">
            {progressResult.rows.map((r) => (
              <ProgressBar key={r.skill as string} label={r.skill as string} score={r.score as number} />
            ))}
          </div>
        </div>
      )}

      {recentResult.rows.length > 0 && (
        <div className="mx-6 mt-6">
          <h2 className="text-lg font-semibold mb-3">Recent Sessions</h2>
          <div className="space-y-2">
            {recentResult.rows.map((r) => (
              <Link
                key={r.id as string}
                href={`/report/${r.id}`}
                className="block p-3 bg-gray-900 rounded-xl border border-gray-800 hover:border-gray-700 transition"
              >
                <div className="flex justify-between items-center">
                  <span className="text-sm text-gray-300">
                    {new Date(r.started_at as string).toLocaleDateString()}
                  </span>
                  <span className="text-xs text-gray-500">
                    {Math.round((r.duration_seconds as number) / 60)}m · L{r.overall_level as number}
                  </span>
                </div>
              </Link>
            ))}
          </div>
        </div>
      )}

      <Nav />
    </div>
  );
}
