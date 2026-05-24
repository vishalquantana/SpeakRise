import { db } from "./db";
import { v4 as uuid } from "uuid";

export interface PointsBreakdown {
  participation: number;
  quality: number;
  streakBonus: number;
  total: number;
}

export function calculateQualityPoints(skills: Record<string, number>): number {
  const values = Object.values(skills);
  if (values.length === 0) return 0;
  const avg = values.reduce((a, b) => a + b, 0) / values.length;
  return Math.round((avg / 100) * 40);
}

export function calculateStreakMultiplier(currentStreak: number): number {
  if (currentStreak >= 30) return 2.0;
  if (currentStreak >= 7) return 1.5;
  return 1.0;
}

export async function updateStreak(userId: string): Promise<number> {
  const today = new Date().toISOString().split("T")[0];

  const existing = await db.execute({
    sql: "SELECT current_streak, longest_streak, last_session_date FROM streaks WHERE user_id = ?",
    args: [userId],
  });

  if (existing.rows.length === 0) {
    await db.execute({
      sql: "INSERT INTO streaks (user_id, current_streak, longest_streak, last_session_date) VALUES (?, 1, 1, ?)",
      args: [userId, today],
    });
    return 1;
  }

  const row = existing.rows[0];
  const lastDate = row.last_session_date as string | null;
  let currentStreak = row.current_streak as number;
  let longestStreak = row.longest_streak as number;

  if (lastDate === today) {
    return currentStreak;
  }

  const yesterday = new Date(Date.now() - 86400000).toISOString().split("T")[0];
  if (lastDate === yesterday) {
    currentStreak += 1;
  } else {
    currentStreak = 1;
  }

  if (currentStreak > longestStreak) longestStreak = currentStreak;

  await db.execute({
    sql: "UPDATE streaks SET current_streak = ?, longest_streak = ?, last_session_date = ? WHERE user_id = ?",
    args: [currentStreak, longestStreak, today, userId],
  });

  return currentStreak;
}

export async function awardPoints(userId: string, sessionId: string, skills: Record<string, number>): Promise<PointsBreakdown> {
  const streak = await updateStreak(userId);
  const participation = 10;
  const quality = calculateQualityPoints(skills);
  const multiplier = calculateStreakMultiplier(streak);
  const streakBonus = Math.round(participation * (multiplier - 1));
  const total = participation + quality + streakBonus;

  await db.execute({
    sql: "INSERT INTO points (id, user_id, session_id, participation_points, quality_points, streak_bonus, total) VALUES (?, ?, ?, ?, ?, ?, ?)",
    args: [uuid(), userId, sessionId, participation, quality, streakBonus, total],
  });

  await checkAndAwardBadges(userId, streak);

  return { participation, quality, streakBonus, total };
}

async function checkAndAwardBadges(userId: string, currentStreak: number): Promise<void> {
  const countResult = await db.execute({
    sql: "SELECT COUNT(*) as c FROM points WHERE user_id = ?",
    args: [userId],
  });
  const sessionCount = countResult.rows[0].c as number;

  const badges: string[] = [];
  if (sessionCount === 1) badges.push("first_session");
  if (sessionCount >= 100) badges.push("centurion");
  if (currentStreak >= 7) badges.push("streak_7");
  if (currentStreak >= 30) badges.push("streak_30");
  if (currentStreak >= 90) badges.push("streak_90");

  for (const badge of badges) {
    await db.execute({
      sql: "INSERT INTO badges (id, user_id, badge_type) VALUES (?, ?, ?) ON CONFLICT(user_id, badge_type) DO NOTHING",
      args: [uuid(), userId, badge],
    });
  }
}

export async function getLeaderboard(orgId: string, period: "week" | "alltime") {
  const dateFilter = period === "week"
    ? "AND p.created_at >= date('now', '-7 days')"
    : "";

  const result = await db.execute({
    sql: `SELECT u.id, u.email, u.name, u.current_level, SUM(p.total) as total_points,
            (SELECT current_streak FROM streaks WHERE user_id = u.id) as streak
          FROM points p
          JOIN users u ON u.id = p.user_id
          WHERE u.org_id = ? ${dateFilter}
          GROUP BY u.id
          ORDER BY total_points DESC
          LIMIT 20`,
    args: [orgId],
  });
  return result.rows;
}

export async function getUserStats(userId: string) {
  const pointsResult = await db.execute({
    sql: "SELECT SUM(total) as total_points FROM points WHERE user_id = ?",
    args: [userId],
  });
  const streakResult = await db.execute({
    sql: "SELECT current_streak, longest_streak FROM streaks WHERE user_id = ?",
    args: [userId],
  });
  const badgesResult = await db.execute({
    sql: "SELECT badge_type, earned_at FROM badges WHERE user_id = ? ORDER BY earned_at DESC",
    args: [userId],
  });

  return {
    totalPoints: (pointsResult.rows[0]?.total_points as number) || 0,
    currentStreak: (streakResult.rows[0]?.current_streak as number) || 0,
    longestStreak: (streakResult.rows[0]?.longest_streak as number) || 0,
    badges: badgesResult.rows,
  };
}
