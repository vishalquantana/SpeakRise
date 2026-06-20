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

export interface EmployeeProgress {
  /** Headline skill plotted over time, ordered oldest -> newest. */
  skill: string;
  series: { score: number; created_at: string }[];
  /** Most-discussed topics across this user's assessments, most frequent first. */
  topics: { topic: string; count: number }[];
}

/**
 * Returns a progress-over-time view for one employee:
 *  - a time series of a single headline skill (default "fluency") from
 *    skill_history, ordered chronologically so a sparkline trends left->right
 *  - the user's most-discussed topics, aggregated across their work entries
 *
 * Degrades gracefully: an employee with no skill_history yields an empty
 * series (the caller renders an empty state rather than crashing).
 */
export async function getEmployeeProgress(
  orgId: string,
  userId: string,
  headlineSkill = "fluency"
): Promise<EmployeeProgress> {
  // Guard the user actually belongs to this org before exposing their history.
  const member = await db.execute({
    sql: `SELECT 1 FROM org_members WHERE org_id = ? AND user_id = ? AND joined_at IS NOT NULL LIMIT 1`,
    args: [orgId, userId],
  });
  if (member.rows.length === 0) {
    return { skill: headlineSkill, series: [], topics: [] };
  }

  const history = await db.execute({
    sql: `SELECT score, created_at
          FROM skill_history
          WHERE user_id = ? AND skill = ?
          ORDER BY created_at ASC`,
    args: [userId, headlineSkill],
  });

  const series = history.rows.map((r) => ({
    score: Number(r.score),
    created_at: r.created_at as string,
  }));

  // Aggregate topics across all of this user's work entries (topics_json is a
  // JSON string[] per CONTRACT). Counted in JS since they're packed per row.
  const topicRows = await db.execute({
    sql: `SELECT topics_json FROM work_entries WHERE user_id = ?`,
    args: [userId],
  });

  const counts = new Map<string, number>();
  for (const row of topicRows.rows) {
    let topics: unknown;
    try {
      topics = JSON.parse((row.topics_json as string) || "[]");
    } catch {
      continue;
    }
    if (!Array.isArray(topics)) continue;
    for (const t of topics) {
      if (typeof t !== "string") continue;
      const topic = t.trim();
      if (!topic) continue;
      counts.set(topic, (counts.get(topic) || 0) + 1);
    }
  }

  const topics = Array.from(counts.entries())
    .map(([topic, count]) => ({ topic, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 6);

  return { skill: headlineSkill, series, topics };
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
