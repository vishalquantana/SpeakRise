import { db } from "./db";
import { v4 as uuid } from "uuid";
import sgMail from "@sendgrid/mail";
import { generateLesson } from "./lessons";

if (process.env.SENDGRID_API_KEY) sgMail.setApiKey(process.env.SENDGRID_API_KEY);

export interface PendingNudge {
  id: string;
  message: string | null;
  targetSkill: string | null;
  lessonId: string | null;
  lessonTopic: string | null;
}

export async function createNudge(opts: {
  orgId: string;
  fromAdminId: string;
  toUserId: string;
  targetSkill?: string;
  message?: string;
  sendEmail?: boolean;
}): Promise<void> {
  const userRes = await db.execute({
    sql: "SELECT email, current_level FROM users WHERE id = ? AND org_id = ?",
    args: [opts.toUserId, opts.orgId],
  });
  if (userRes.rows.length === 0) throw new Error("User not found in this organization");
  const email = userRes.rows[0].email as string;
  const level = (userRes.rows[0].current_level as number) || 1;

  const lesson = await generateLesson(opts.toUserId, {
    userLevel: level,
    targetSkill: opts.targetSkill,
    source: "nudge",
  });

  await db.execute({
    sql: `INSERT INTO nudges (id, org_id, from_admin_id, to_user_id, lesson_id, target_skill, message, status)
          VALUES (?, ?, ?, ?, ?, ?, ?, 'pending')`,
    args: [
      uuid(),
      opts.orgId,
      opts.fromAdminId,
      opts.toUserId,
      lesson.id,
      opts.targetSkill || null,
      opts.message || null,
    ],
  });

  if (opts.sendEmail && process.env.SENDGRID_API_KEY && process.env.SENDGRID_FROM_EMAIL) {
    const appUrl =
      process.env.NODE_ENV === "production"
        ? "https://speakrise.quantana.top"
        : "http://localhost:3000";
    await sgMail.send({
      to: email,
      from: process.env.SENDGRID_FROM_EMAIL,
      subject: "Your SpeakRise coach has a suggestion",
      html: `<h2>A new practice suggestion for you</h2>
             <p>${opts.message ? opts.message : "Your coach picked a lesson to help you improve."}</p>
             <p>Today's focus: <strong>${lesson.topic}</strong></p>
             <p><a href="${appUrl}/session?lesson=${lesson.id}" style="display:inline-block;padding:12px 24px;background:#C75B39;color:white;border-radius:8px;text-decoration:none;font-weight:bold;">Start this lesson</a></p>`,
    });
  }
}

export async function getPendingNudges(userId: string): Promise<PendingNudge[]> {
  const res = await db.execute({
    sql: `SELECT n.id, n.message, n.target_skill, n.lesson_id, g.topic AS lesson_topic
          FROM nudges n
          LEFT JOIN generated_lessons g ON g.id = n.lesson_id
          WHERE n.to_user_id = ? AND n.status IN ('pending', 'seen')
          ORDER BY n.created_at DESC`,
    args: [userId],
  });
  return res.rows.map((r) => ({
    id: r.id as string,
    message: (r.message as string) ?? null,
    targetSkill: (r.target_skill as string) ?? null,
    lessonId: (r.lesson_id as string) ?? null,
    lessonTopic: (r.lesson_topic as string) ?? null,
  }));
}

export async function markNudgesSeen(userId: string): Promise<void> {
  await db.execute({
    sql: "UPDATE nudges SET status = 'seen', seen_at = datetime('now') WHERE to_user_id = ? AND status = 'pending'",
    args: [userId],
  });
}

export async function completeNudgeByLesson(lessonId: string): Promise<void> {
  await db.execute({
    sql: "UPDATE nudges SET status = 'completed' WHERE lesson_id = ? AND status IN ('pending','seen')",
    args: [lessonId],
  });
}
