import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { db } from "@/lib/db";
import { v4 as uuid } from "uuid";

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session.userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { sessionId, role, content, audioDurationMs } = await req.json();

  const id = uuid();
  await db.execute({
    sql: "INSERT INTO messages (id, session_id, role, content, audio_duration_ms) VALUES (?, ?, ?, ?, ?)",
    args: [id, sessionId, role, content, audioDurationMs || null],
  });

  return NextResponse.json({ id });
}
