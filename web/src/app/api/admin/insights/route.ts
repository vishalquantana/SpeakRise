import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { db } from "@/lib/db";
import {
  getEmployeeInsights,
  getEmployeeWorkEntries,
  getOrgInsights,
  generateWeeklyDigest,
} from "@/lib/insights";

export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session.userId || session.role !== "admin") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const orgId = session.orgId!;
  const employeeId = req.nextUrl.searchParams.get("employeeId");

  if (employeeId) {
    const entries = await getEmployeeWorkEntries(orgId, employeeId);
    return NextResponse.json({ entries });
  }

  const employees = await getEmployeeInsights(orgId);
  const org = await getOrgInsights(orgId);
  const digestRow = await db.execute({
    sql: "SELECT digest_json, week_start FROM weekly_digests WHERE org_id = ? ORDER BY created_at DESC LIMIT 1",
    args: [orgId],
  });

  return NextResponse.json({
    employees,
    orgSentiment: org.sentiment,
    blocked: org.blocked,
    latestDigest: digestRow.rows[0] || null,
  });
}

export async function POST() {
  const session = await getSession();
  if (!session.userId || session.role !== "admin") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const summary = await generateWeeklyDigest(session.orgId!);
  return NextResponse.json({ summary });
}
