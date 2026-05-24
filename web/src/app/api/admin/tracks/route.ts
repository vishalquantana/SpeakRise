import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { db } from "@/lib/db";
import { createDefaultTrack, updateTrack, assignUserToTrack, DEFAULT_SCENARIOS } from "@/lib/tracks";

export async function GET() {
  const session = await getSession();
  if (!session.userId || session.role !== "admin") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const tracks = await db.execute({
    sql: "SELECT * FROM tracks WHERE org_id = ?",
    args: [session.orgId!],
  });

  return NextResponse.json({ tracks: tracks.rows, availableScenarios: DEFAULT_SCENARIOS });
}

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session.userId || session.role !== "admin") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { action, trackId, userId, ...data } = await req.json();

  if (action === "create-default") {
    const id = await createDefaultTrack(session.orgId!);
    return NextResponse.json({ ok: true, trackId: id });
  }

  if (action === "update" && trackId) {
    await updateTrack(trackId, data);
    return NextResponse.json({ ok: true });
  }

  if (action === "assign" && trackId && userId) {
    await assignUserToTrack(userId, trackId);
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ error: "Unknown action" }, { status: 400 });
}
