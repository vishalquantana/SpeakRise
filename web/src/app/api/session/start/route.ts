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

  const { sessionType, lessonId } = await req.json();
  const id = uuid();

  const track = await getTrackForUser(session.userId);
  const userResult = await db.execute({
    sql: "SELECT current_level FROM users WHERE id = ?",
    args: [session.userId],
  });
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
    scenario: {
      openingMessage: lesson.openingMessage,
      systemPromptAddition: lesson.systemPromptAddition,
    },
  });
}
