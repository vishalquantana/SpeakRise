import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { db } from "@/lib/db";

export async function GET() {
  const session = await getSession();
  if (!session.userId || session.role !== "admin") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const orgId = session.orgId!;

  const workResult = await db.execute({
    sql: `SELECT w.summary_text, w.created_at, u.email, u.name
          FROM work_entries w JOIN users u ON u.id = w.user_id
          WHERE u.org_id = ?
          ORDER BY w.created_at DESC LIMIT 50`,
    args: [orgId],
  });

  const digestResult = await db.execute({
    sql: `SELECT digest_json, week_start FROM weekly_digests
          WHERE org_id = ? ORDER BY created_at DESC LIMIT 1`,
    args: [orgId],
  });

  return NextResponse.json({
    recentWork: workResult.rows,
    latestDigest: digestResult.rows[0] || null,
  });
}
