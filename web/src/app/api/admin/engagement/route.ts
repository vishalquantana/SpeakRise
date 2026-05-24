import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { db } from "@/lib/db";

export async function GET() {
  const session = await getSession();
  if (!session.userId || session.role !== "admin") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const orgId = session.orgId!;

  const membersResult = await db.execute({
    sql: "SELECT COUNT(*) as total FROM org_members WHERE org_id = ? AND joined_at IS NOT NULL",
    args: [orgId],
  });
  const totalMembers = membersResult.rows[0].total as number;

  const todayResult = await db.execute({
    sql: `SELECT COUNT(DISTINCT s.user_id) as count
          FROM sessions s JOIN users u ON u.id = s.user_id
          WHERE u.org_id = ? AND s.ended_at IS NOT NULL AND date(s.started_at) = date('now')`,
    args: [orgId],
  });
  const completedToday = todayResult.rows[0].count as number;

  const inactiveResult = await db.execute({
    sql: `SELECT u.id, u.email, u.name
          FROM users u
          JOIN org_members om ON om.user_id = u.id AND om.org_id = ?
          WHERE u.id NOT IN (
            SELECT DISTINCT user_id FROM sessions
            WHERE ended_at IS NOT NULL AND started_at >= datetime('now', '-3 days')
          )
          AND om.joined_at IS NOT NULL`,
    args: [orgId],
  });

  const streaksResult = await db.execute({
    sql: `SELECT s.current_streak, u.email, u.name
          FROM streaks s JOIN users u ON u.id = s.user_id
          WHERE u.org_id = ?
          ORDER BY s.current_streak DESC`,
    args: [orgId],
  });

  const trendResult = await db.execute({
    sql: `SELECT date(started_at) as day, COUNT(DISTINCT user_id) as active_users
          FROM sessions s JOIN users u ON u.id = s.user_id
          WHERE u.org_id = ? AND s.ended_at IS NOT NULL AND s.started_at >= datetime('now', '-30 days')
          GROUP BY date(started_at)
          ORDER BY day`,
    args: [orgId],
  });

  return NextResponse.json({
    totalMembers,
    completedToday,
    completionRate: totalMembers > 0 ? Math.round((completedToday / totalMembers) * 100) : 0,
    inactive: inactiveResult.rows,
    streaks: streaksResult.rows,
    trend: trendResult.rows,
  });
}
