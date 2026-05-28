import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { createNudge } from "@/lib/nudges";

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session.userId || session.role !== "admin") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { toUserId, targetSkill, message, sendEmail } = await req.json();
  if (!toUserId) {
    return NextResponse.json({ error: "toUserId required" }, { status: 400 });
  }
  await createNudge({
    orgId: session.orgId!,
    fromAdminId: session.userId,
    toUserId,
    targetSkill,
    message,
    sendEmail,
  });
  return NextResponse.json({ ok: true });
}
