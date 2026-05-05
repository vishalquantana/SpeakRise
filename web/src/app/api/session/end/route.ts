import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { db } from "@/lib/db";

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session.userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { sessionId } = await req.json();

  const sessionRow = await db.execute({
    sql: "SELECT started_at FROM sessions WHERE id = ? AND user_id = ?",
    args: [sessionId, session.userId],
  });

  if (sessionRow.rows.length === 0) {
    return NextResponse.json({ error: "Session not found" }, { status: 404 });
  }

  const startedAt = new Date(sessionRow.rows[0].started_at as string);
  const durationSeconds = Math.round((Date.now() - startedAt.getTime()) / 1000);

  await db.execute({
    sql: "UPDATE sessions SET ended_at = datetime('now'), duration_seconds = ? WHERE id = ?",
    args: [durationSeconds, sessionId],
  });

  return NextResponse.json({ ok: true, durationSeconds });
}
