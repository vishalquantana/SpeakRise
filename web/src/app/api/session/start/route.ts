import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { db } from "@/lib/db";
import { v4 as uuid } from "uuid";
import { getTrackForUser, pickScenario } from "@/lib/tracks";

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session.userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { sessionType } = await req.json();
  const id = uuid();

  // Get user's track and level
  const track = await getTrackForUser(session.userId);
  const userResult = await db.execute({
    sql: "SELECT current_level FROM users WHERE id = ?",
    args: [session.userId],
  });
  const userLevel = (userResult.rows[0]?.current_level as number) || 1;

  const duration = track?.duration || 300;
  const trackId = track?.trackId || null;

  // Pick a scenario for this session
  let scenario = null;
  if (track) {
    scenario = pickScenario(userLevel, track.scenarios);
  }

  await db.execute({
    sql: "INSERT INTO sessions (id, user_id, session_type, track_id, target_duration_seconds) VALUES (?, ?, ?, ?, ?)",
    args: [id, session.userId, sessionType || "daily", trackId, duration],
  });

  return NextResponse.json({
    sessionId: id,
    duration,
    scenario: scenario ? {
      openingMessage: scenario.openingMessage,
      systemPromptAddition: scenario.systemPromptAddition,
    } : null,
  });
}
