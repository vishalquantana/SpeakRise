import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { db } from "@/lib/db";

export async function POST() {
  const session = await getSession();
  if (!session.userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  await db.execute({
    sql: "UPDATE users SET onboarding_complete = 1 WHERE id = ?",
    args: [session.userId],
  });

  return NextResponse.json({ ok: true });
}
