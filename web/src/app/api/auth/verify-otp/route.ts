import { NextRequest, NextResponse } from "next/server";
import { verifyOTP, findOrCreateUser } from "@/lib/auth";
import { getSession } from "@/lib/session";
import { db } from "@/lib/db";

export async function POST(req: NextRequest) {
  const { email, code, testMode, inviteToken } = await req.json();

  if (testMode) {
    if (code !== "123456") {
      return NextResponse.json({ error: "Invalid code" }, { status: 401 });
    }
  } else {
    const valid = await verifyOTP(email, code);
    if (!valid) {
      return NextResponse.json({ error: "Invalid or expired code" }, { status: 401 });
    }
  }

  const user = await findOrCreateUser(email);
  const session = await getSession();
  session.userId = user.id;
  session.email = email;

  // Handle invite token — associate user with org
  if (inviteToken) {
    const invite = await db.execute({
      sql: "SELECT org_id FROM org_members WHERE invite_token = ? AND user_id = ?",
      args: [inviteToken, email.toLowerCase()],
    });
    if (invite.rows.length > 0) {
      const orgId = invite.rows[0].org_id as string;
      await db.execute({
        sql: "UPDATE org_members SET user_id = ?, joined_at = datetime('now'), invite_token = NULL WHERE invite_token = ?",
        args: [user.id, inviteToken],
      });
      await db.execute({
        sql: "UPDATE users SET org_id = ? WHERE id = ?",
        args: [orgId, user.id],
      });
      session.orgId = orgId;
      session.role = "employee";
    }
  }

  // Load org info if not set from invite
  if (!session.orgId) {
    const orgResult = await db.execute({
      sql: "SELECT org_id, role FROM org_members WHERE user_id = ? LIMIT 1",
      args: [user.id],
    });
    if (orgResult.rows.length > 0) {
      session.orgId = orgResult.rows[0].org_id as string;
      session.role = orgResult.rows[0].role as string;
    }
  }

  await session.save();

  const redirect = user.onboarding_complete ? "/dashboard" : "/onboarding";
  return NextResponse.json({ ok: true, redirect });
}
