import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { getPendingNudges, markNudgesSeen } from "@/lib/nudges";

export async function GET() {
  const session = await getSession();
  if (!session.userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const nudges = await getPendingNudges(session.userId);
  await markNudgesSeen(session.userId);
  return NextResponse.json({ nudges });
}
