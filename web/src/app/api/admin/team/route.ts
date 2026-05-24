import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { createOrg, getOrgMembers } from "@/lib/org";

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session.userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { action, name } = await req.json();

  if (action === "create-org") {
    const orgId = await createOrg(name, session.userId);
    session.orgId = orgId;
    session.role = "admin";
    await session.save();
    return NextResponse.json({ ok: true, orgId });
  }

  return NextResponse.json({ error: "Unknown action" }, { status: 400 });
}

export async function GET() {
  const session = await getSession();
  if (!session.userId || session.role !== "admin") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const members = await getOrgMembers(session.orgId!);
  return NextResponse.json({ members });
}
