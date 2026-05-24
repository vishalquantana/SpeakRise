import { db } from "./db";
import { v4 as uuid } from "uuid";
import sgMail from "@sendgrid/mail";

sgMail.setApiKey(process.env.SENDGRID_API_KEY!);

export async function createOrg(name: string, adminUserId: string): Promise<string> {
  const orgId = uuid();
  await db.execute({
    sql: "INSERT INTO organizations (id, name, created_by) VALUES (?, ?, ?)",
    args: [orgId, name, adminUserId],
  });
  await db.execute({
    sql: "UPDATE users SET org_id = ? WHERE id = ?",
    args: [orgId, adminUserId],
  });
  await db.execute({
    sql: "INSERT INTO org_members (id, org_id, user_id, role, joined_at) VALUES (?, ?, ?, 'admin', datetime('now'))",
    args: [uuid(), orgId, adminUserId],
  });
  return orgId;
}

export async function inviteEmployee(orgId: string, email: string): Promise<void> {
  const token = uuid();
  const normalized = email.toLowerCase();

  const existing = await db.execute({
    sql: "SELECT id FROM users WHERE email = ?",
    args: [normalized],
  });

  if (existing.rows.length > 0) {
    const userId = existing.rows[0].id as string;
    await db.execute({
      sql: `INSERT INTO org_members (id, org_id, user_id, role, joined_at)
            VALUES (?, ?, ?, 'employee', datetime('now'))
            ON CONFLICT(org_id, user_id) DO NOTHING`,
      args: [uuid(), orgId, userId],
    });
    await db.execute({
      sql: "UPDATE users SET org_id = ? WHERE id = ?",
      args: [orgId, userId],
    });
  } else {
    await db.execute({
      sql: "INSERT INTO org_members (id, org_id, user_id, role, invite_token) VALUES (?, ?, ?, 'employee', ?)",
      args: [uuid(), orgId, normalized, token],
    });
  }

  const appUrl = process.env.NODE_ENV === "production"
    ? "https://speakrise.quantana.top"
    : "http://localhost:3000";

  await sgMail.send({
    to: normalized,
    from: process.env.SENDGRID_FROM_EMAIL!,
    subject: "You're invited to SpeakRise",
    html: `<h2>You've been invited to practice English on SpeakRise</h2>
           <p>Your team is using SpeakRise for daily English practice. Click below to join:</p>
           <p><a href="${appUrl}/invite?token=${token}&email=${encodeURIComponent(normalized)}" style="display:inline-block;padding:12px 24px;background:#C75B39;color:white;border-radius:8px;text-decoration:none;font-weight:bold;">Join SpeakRise</a></p>`,
  });
}

export async function getOrgForUser(userId: string): Promise<{ orgId: string; role: string } | null> {
  const result = await db.execute({
    sql: "SELECT org_id, role FROM org_members WHERE user_id = ? LIMIT 1",
    args: [userId],
  });
  if (result.rows.length === 0) return null;
  return { orgId: result.rows[0].org_id as string, role: result.rows[0].role as string };
}

export async function getOrgMembers(orgId: string) {
  const result = await db.execute({
    sql: `SELECT u.id, u.email, u.name, u.current_level, om.role, om.joined_at
          FROM org_members om
          JOIN users u ON u.id = om.user_id
          WHERE om.org_id = ? AND om.joined_at IS NOT NULL
          ORDER BY om.joined_at`,
    args: [orgId],
  });
  return result.rows;
}
