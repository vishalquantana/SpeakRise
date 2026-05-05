import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { db } from "@/lib/db";
import { assessSession } from "@/lib/assessment";

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session.userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { sessionId } = await req.json();

  const userResult = await db.execute({
    sql: "SELECT current_level FROM users WHERE id = ?",
    args: [session.userId],
  });

  const currentLevel = (userResult.rows[0]?.current_level as number) || 1;

  const { assessmentId, overallLevel } = await assessSession(
    sessionId,
    session.userId,
    currentLevel
  );

  return NextResponse.json({ assessmentId, overallLevel });
}
