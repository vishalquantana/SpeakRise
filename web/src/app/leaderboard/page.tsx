import { redirect } from "next/navigation";
import { getSession } from "@/lib/session";
import { db } from "@/lib/db";
import Link from "next/link";
import Nav from "@/components/nav";
import Leaderboard from "@/components/leaderboard";
import { getLeaderboard } from "@/lib/gamification";

export default async function LeaderboardPage() {
  const session = await getSession();
  if (!session.userId) redirect("/login");

  const weekly = session.orgId ? await getLeaderboard(session.orgId, "week") : [];
  const allTime = session.orgId ? await getLeaderboard(session.orgId, "alltime") : [];

  const weekPointsRes = await db.execute({
    sql: "SELECT SUM(total) as pts FROM points WHERE user_id = ? AND created_at >= date('now', '-7 days')",
    args: [session.userId],
  });
  const myWeekPoints = (weekPointsRes.rows[0]?.pts as number) || 0;

  const streakRes = await db.execute({
    sql: "SELECT current_streak FROM streaks WHERE user_id = ?",
    args: [session.userId],
  });
  const myStreak = (streakRes.rows[0]?.current_streak as number) || 0;

  return (
    <div className="min-h-screen pb-20 bg-[var(--background)]">
      <header className="px-6 pt-6 pb-4">
        <Link href="/dashboard" className="text-[var(--muted)] text-sm hover:text-[var(--foreground)] transition">
          &larr; Back to dashboard
        </Link>
        <h1 className="text-xl font-bold mt-2 text-[var(--foreground)]">Leaderboard</h1>
      </header>

      <div className="mx-6 grid grid-cols-2 gap-3">
        <div className="p-4 bg-white rounded-2xl border border-[var(--card-border)] shadow-sm">
          <p className="text-[var(--muted)] text-xs uppercase tracking-wide">This Week</p>
          <p className="text-3xl font-bold text-[var(--accent)] mt-1">{myWeekPoints}</p>
          <p className="text-xs text-[var(--muted)]">points</p>
        </div>
        <div className="p-4 bg-white rounded-2xl border border-[var(--card-border)] shadow-sm">
          <p className="text-[var(--muted)] text-xs uppercase tracking-wide">Streak</p>
          <p className="text-3xl font-bold text-[var(--gold)] mt-1">{myStreak}</p>
          <p className="text-xs text-[var(--muted)]">day{myStreak === 1 ? "" : "s"}</p>
        </div>
      </div>

      {!session.orgId ? (
        <div className="mx-6 mt-6 p-5 bg-white rounded-2xl border border-[var(--card-border)] text-center">
          <p className="text-sm text-[var(--foreground)] font-medium">Join a team to compete</p>
          <p className="text-sm text-[var(--muted)] mt-1">
            Leaderboards rank everyone in your organization. Once you are part of a team, you will see how you stack up each week.
          </p>
        </div>
      ) : (
        <>
          <div className="mx-6 mt-6">
            <h2 className="text-lg font-semibold mb-3 text-[var(--foreground)]">This Week</h2>
            {weekly.length > 0 ? (
              <Leaderboard entries={weekly as any} currentUserId={session.userId} />
            ) : (
              <p className="text-sm text-[var(--muted)]">No points yet this week. Be the first — start a session!</p>
            )}
          </div>

          {allTime.length > 0 && (
            <div className="mx-6 mt-6">
              <h2 className="text-lg font-semibold mb-3 text-[var(--foreground)]">All Time</h2>
              <Leaderboard entries={allTime as any} currentUserId={session.userId} />
            </div>
          )}
        </>
      )}

      <Nav />
    </div>
  );
}
