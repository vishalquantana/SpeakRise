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
    sql: `SELECT u.id, u.email, u.name, u.current_level,
            (SELECT SUM(total) FROM points WHERE user_id = u.id) as total_points,
            (SELECT current_streak FROM streaks WHERE user_id = u.id) as streak
          FROM users u
          JOIN org_members om ON om.user_id = u.id AND om.org_id = ?
          WHERE om.joined_at IS NOT NULL
          ORDER BY u.current_level DESC, total_points DESC`,
    args: [orgId],
  });

  const levelDist = await db.execute({
    sql: `SELECT current_level, COUNT(*) as count
          FROM users u JOIN org_members om ON om.user_id = u.id AND om.org_id = ?
          WHERE om.joined_at IS NOT NULL
          GROUP BY current_level ORDER BY current_level`,
    args: [orgId],
  });

  return NextResponse.json({
    members: membersResult.rows,
    levelDistribution: levelDist.rows,
  });
}
