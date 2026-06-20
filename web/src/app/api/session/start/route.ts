import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { db } from "@/lib/db";
import { v4 as uuid } from "uuid";
import { getTrackForUser } from "@/lib/tracks";
import { generateLesson, getLessonById, consumeLesson } from "@/lib/lessons";
import { completeNudgeByLesson } from "@/lib/nudges";

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session.userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { sessionType, lessonId, startLevel } = await req.json();
  const id = uuid();

  // Optionally seed the user's starting level (e.g. from onboarding warm-up).
  // Clamp to the supported 1-5 range so a bad client value can't corrupt state.
  if (startLevel != null) {
    const level = Math.max(1, Math.min(5, Math.round(Number(startLevel))));
    if (Number.isFinite(level)) {
      await db.execute({
        sql: "UPDATE users SET current_level = ? WHERE id = ?",
        args: [level, session.userId],
      });
    }
  }

  const track = await getTrackForUser(session.userId);
  const userResult = await db.execute({
    sql: "SELECT name, current_level FROM users WHERE id = ?",
    args: [session.userId],
  });
  const userName = (userResult.rows[0]?.name as string) || null;
  const userLevel = (userResult.rows[0]?.current_level as number) || 1;
  const duration = track?.duration || 300;
  const trackId = track?.trackId || null;

  let lesson = lessonId ? await getLessonById(lessonId, session.userId) : null;
  if (!lesson) {
    lesson = await generateLesson(session.userId, { userLevel, source: "auto" });
  }

  await db.execute({
    sql: "INSERT INTO sessions (id, user_id, session_type, track_id, target_duration_seconds) VALUES (?, ?, ?, ?, ?)",
    args: [id, session.userId, sessionType || "daily", trackId, duration],
  });

  await consumeLesson(lesson.id, id);
  if (lesson.source === "nudge") {
    await completeNudgeByLesson(lesson.id);
  }

  return NextResponse.json({
    sessionId: id,
    duration,
    userName,
    scenario: {
      openingMessage: lesson.openingMessage,
      systemPromptAddition: lesson.systemPromptAddition,
    },
  });
}
