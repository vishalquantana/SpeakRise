import { db } from "./db";
import { v4 as uuid } from "uuid";
import { chat } from "./ai-client";

export async function getEmployeeInsights(orgId: string) {
  const res = await db.execute({
    sql: `SELECT u.id, u.email, u.name,
            COUNT(w.id) AS entry_count,
            SUM(CASE WHEN w.sentiment = 'negative' THEN 1 ELSE 0 END) AS negative_count,
            SUM(CASE WHEN w.sentiment = 'positive' THEN 1 ELSE 0 END) AS positive_count
          FROM users u
          JOIN org_members om ON om.user_id = u.id AND om.org_id = ?
          LEFT JOIN work_entries w ON w.user_id = u.id
          WHERE om.joined_at IS NOT NULL
          GROUP BY u.id
          ORDER BY u.name`,
    args: [orgId],
  });
  return res.rows;
}

export async function getEmployeeWorkEntries(orgId: string, userId: string) {
  const res = await db.execute({
    sql: `SELECT w.summary_text, w.blockers_text, w.sentiment, w.created_at
          FROM work_entries w
          JOIN users u ON u.id = w.user_id
          WHERE u.org_id = ? AND w.user_id = ?
          ORDER BY w.created_at DESC LIMIT 30`,
    args: [orgId, userId],
  });
  return res.rows;
}

export async function getOrgInsights(orgId: string) {
  const sentiment = await db.execute({
    sql: `SELECT w.sentiment, COUNT(*) AS c
          FROM work_entries w JOIN users u ON u.id = w.user_id
          WHERE u.org_id = ? AND w.created_at >= datetime('now', '-7 days')
          GROUP BY w.sentiment`,
    args: [orgId],
  });
  const blocked = await db.execute({
    sql: `SELECT u.name, u.email, w.blockers_text, w.created_at
          FROM work_entries w JOIN users u ON u.id = w.user_id
          WHERE u.org_id = ? AND w.blockers_text IS NOT NULL AND w.blockers_text != ''
          ORDER BY w.created_at DESC LIMIT 10`,
    args: [orgId],
  });
  return { sentiment: sentiment.rows, blocked: blocked.rows };
}

export async function generateWeeklyDigest(orgId: string): Promise<string> {
  const entries = await db.execute({
    sql: `SELECT u.name, u.email, w.summary_text, w.blockers_text, w.sentiment
          FROM work_entries w JOIN users u ON u.id = w.user_id
          WHERE u.org_id = ? AND w.created_at >= datetime('now', '-7 days')
          ORDER BY w.created_at DESC`,
    args: [orgId],
  });

  if (entries.rows.length === 0) {
    return "No work activity recorded in the last 7 days.";
  }

  const corpus = entries.rows
    .map(
      (r) =>
        `- ${(r.name as string) || (r.email as string)} [${r.sentiment}]: ${r.summary_text}${r.blockers_text ? ` (blocker: ${r.blockers_text})` : ""}`
    )
    .join("\n");

  const prompt = `You are a management assistant. Summarize this team's week of work notes into a concise digest for a manager.
Cover: (1) main themes the team worked on, (2) overall morale, (3) any blockers to address. Keep it under 200 words. Plain prose, no emojis.

Work notes:
${corpus}`;

  let summary = "";
  try {
    const res = await chat(prompt, `digest-${uuid()}`);
    summary = res.text.trim();
  } catch {
    summary = "Could not generate digest at this time.";
  }

  const weekStart = new Date(Date.now() - 6 * 86400000).toISOString().split("T")[0];
  await db.execute({
    sql: "INSERT INTO weekly_digests (id, org_id, week_start, digest_json) VALUES (?, ?, ?, ?)",
    args: [uuid(), orgId, weekStart, JSON.stringify({ summary })],
  });
  return summary;
}
