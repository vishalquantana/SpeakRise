import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { inviteEmployee } from "@/lib/org";

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session.userId || session.role !== "admin") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { email } = await req.json();
  if (!email || !email.includes("@")) {
    return NextResponse.json({ error: "Valid email required" }, { status: 400 });
  }

  await inviteEmployee(session.orgId!, email);
  return NextResponse.json({ ok: true });
}
