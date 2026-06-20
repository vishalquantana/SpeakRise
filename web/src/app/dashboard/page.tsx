import { redirect } from "next/navigation";
import { getSession } from "@/lib/session";
import { db } from "@/lib/db";
import Link from "next/link";
import Nav from "@/components/nav";
import StreakBadge from "@/components/streak-badge";
import Leaderboard from "@/components/leaderboard";
import { getUserStats, getLeaderboard } from "@/lib/gamification";
import { getRecommendedLesson } from "@/lib/lessons";
import { getPendingNudges } from "@/lib/nudges";

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

  const stats = await getUserStats(session.userId);

  const todayResult = await db.execute({
    sql: `SELECT id FROM sessions WHERE user_id = ? AND session_type = 'daily'
          AND date(started_at) = date('now') AND ended_at IS NOT NULL`,
    args: [session.userId],
  });
  const completedToday = todayResult.rows.length > 0;

  const leaderboard = session.orgId
    ? await getLeaderboard(session.orgId, "week")
    : [];
  const leaderboardAllTime = session.orgId
    ? await getLeaderboard(session.orgId, "alltime")
    : [];

  const level = user.current_level as number;

  const recommendation = completedToday
    ? null
    : await getRecommendedLesson(session.userId, level);
  const recommended = recommendation?.lesson ?? null;
  const weakestSkill = recommendation?.weakestSkill ?? null;
  const pendingNudges = await getPendingNudges(session.userId);
  const topNudge = pendingNudges[0] || null;

  return (
    <div className="min-h-screen pb-20 bg-[var(--background)]">
      <header className="px-6 pt-6 pb-4">
        <h1 className="text-2xl font-bold text-[var(--foreground)]">
          Speak<span className="text-[var(--accent)]">Rise</span>
        </h1>
        <p className="text-[var(--muted)] text-sm mt-1">{user.email as string}</p>
      </header>

      <div className="mx-6 p-5 bg-white rounded-2xl border border-[var(--card-border)] shadow-sm">
        <div className="flex items-center justify-between mb-3">
          <div>
            <p className="text-[var(--muted)] text-xs uppercase tracking-wide">Level {level}</p>
            <p className="text-xl font-bold mt-1 text-[var(--foreground)]">{LEVEL_NAMES[level]}</p>
          </div>
          <div className="text-right">
            <p className="text-2xl font-bold text-[var(--accent)]">{stats.totalPoints}</p>
            <p className="text-xs text-[var(--muted)]">total points</p>
          </div>
        </div>
        <div className="flex items-center gap-4 mt-3 pt-3 border-t border-[var(--card-border)]">
          <div className="flex items-center gap-1">
            <span className="text-sm font-medium text-[var(--foreground)]">{stats.currentStreak} day streak</span>
          </div>
          <div className="flex items-center gap-1">
            <span className="text-sm font-medium text-[var(--foreground)]">{stats.longestStreak} best</span>
          </div>
        </div>
      </div>

      {topNudge && (
        <div className="mx-6 mt-4 p-4 bg-[var(--accent)]/10 border border-[var(--accent)] rounded-xl">
          <p className="text-xs uppercase tracking-wide text-[var(--accent)] font-semibold">Your coach suggests</p>
          {topNudge.message && (
            <p className="text-sm text-[var(--foreground)] mt-1">{topNudge.message}</p>
          )}
          <p className="text-sm font-medium text-[var(--foreground)] mt-1">
            {topNudge.lessonTopic || "A focused practice lesson"}
          </p>
          <Link
            href={topNudge.lessonId ? `/session?lesson=${topNudge.lessonId}` : "/session"}
            className="mt-3 inline-block px-4 py-2 bg-[var(--accent)] text-white rounded-lg text-sm font-semibold"
          >
            Start this lesson
          </Link>
        </div>
      )}

      {!completedToday && stats.currentStreak > 0 && (
        <div className="mx-6 mt-4 p-4 bg-[var(--gold)]/10 border border-[var(--gold)] rounded-xl flex items-center justify-between gap-3">
          <div>
            <p className="text-xs uppercase tracking-wide text-[var(--gold)] font-semibold">
              Streak saver
            </p>
            <p className="text-sm text-[var(--foreground)] mt-1">
              Keep your {stats.currentStreak}-day streak alive — finish today's challenge before midnight.
            </p>
          </div>
          <span className="text-2xl font-bold text-[var(--gold)] shrink-0">{stats.currentStreak}d</span>
        </div>
      )}

      <div className="mx-6 mt-4">
        {completedToday ? (
          <div className="p-4 bg-[var(--success-light)] border border-[var(--success)] rounded-xl text-center">
            <p className="text-[var(--success)] font-medium">Today's session complete</p>
            <Link href="/session" className="text-sm text-[var(--accent)] mt-1 inline-block">
              Practice more
            </Link>
          </div>
        ) : (
          <div className="p-4 bg-white rounded-2xl border border-[var(--card-border)] shadow-sm">
            <div className="flex items-center justify-between gap-2">
              <p className="text-xs uppercase tracking-wide text-[var(--muted)]">Today's Challenge</p>
              <span className="px-2 py-0.5 rounded-full bg-[var(--gold)]/15 text-[var(--gold)] text-[11px] font-bold uppercase tracking-wide">
                +20 bonus XP
              </span>
            </div>
            <p className="text-lg font-semibold text-[var(--foreground)] mt-1">{recommended?.topic}</p>
            {weakestSkill && (
              <p className="text-sm text-[var(--muted)] mt-0.5">
                Sharpen your {weakestSkill.replace("_", " ")}
              </p>
            )}
            <Link
              href={recommended ? `/session?lesson=${recommended.id}` : "/session"}
              className="block w-full mt-3 py-3 bg-[var(--accent)] hover:bg-[#B5502F] rounded-xl text-center font-semibold text-white transition"
            >
              Take today's challenge
            </Link>
            <Link
              href="/session"
              className="block w-full mt-2 py-2 text-center text-sm text-[var(--accent)]"
            >
              Surprise me
            </Link>
          </div>
        )}
      </div>

      {stats.badges.length > 0 && (
        <div className="mx-6 mt-6">
          <h2 className="text-lg font-semibold mb-3 text-[var(--foreground)]">Badges</h2>
          <div className="flex flex-wrap gap-2">
            {stats.badges.map((b: any) => (
              <StreakBadge key={b.badge_type} type={b.badge_type as string} />
            ))}
          </div>
        </div>
      )}

      {leaderboard.length > 0 && (
        <div className="mx-6 mt-6">
          <h2 className="text-lg font-semibold mb-3 text-[var(--foreground)]">This Week's Leaderboard</h2>
          <Leaderboard entries={leaderboard as any} currentUserId={session.userId} />
        </div>
      )}

      {leaderboardAllTime.length > 0 && (
        <div className="mx-6 mt-6">
          <h2 className="text-lg font-semibold mb-3 text-[var(--foreground)]">All-Time Leaderboard</h2>
          <Leaderboard entries={leaderboardAllTime as any} currentUserId={session.userId} />
        </div>
      )}

      <Nav isAdmin={session.role === "admin"} />
    </div>
  );
}
