import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { db } from "@/lib/db";
import { v4 as uuid } from "uuid";

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session.userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { sessionType } = await req.json();
  const id = uuid();

  await db.execute({
    sql: "INSERT INTO sessions (id, user_id, session_type) VALUES (?, ?, ?)",
    args: [id, session.userId, sessionType || "daily"],
  });

  return NextResponse.json({ sessionId: id });
}
