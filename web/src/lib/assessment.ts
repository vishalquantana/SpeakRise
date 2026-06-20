import { db } from "./db";
import { v4 as uuid } from "uuid";
import { awardPoints } from "./gamification";
import { parseAssessmentResponse, buildFallbackAssessment } from "./assessment-core";

const AI_URL = process.env.AI_SERVICE_URL || "http://localhost:8770";
const GRADING_TIMEOUT_MS = Number(process.env.GRADING_TIMEOUT_MS) || 30000;

function buildGradingPrompt(userLevel: number): string {
  const baseSkills = `
Evaluate the user's English speaking ability based on this conversation transcript.
Return ONLY valid JSON (no markdown, no code fences) with this exact structure:
{
  "overall_level": <1-5>,
  "skills": {
    "grammar": <0-100>,
    "vocabulary": <0-100>,
    "sentence_length": <0-100>,
    "sentence_variety": <0-100>,
    "fluency": <0-100>,
    "clarity": <0-100>
  },
  "feedback": {
    "went_well": ["<specific positive observation>", "<another>"],
    "improve": ["<specific actionable suggestion>", "<another>"]
  },
  "exercises": [
    {"type": "repeat_after_me", "sentence": "<corrected/improved version of something they said>", "explanation": "<why this is better>"},
    {"type": "vocabulary", "word": "<word they could have used>", "definition": "<meaning>", "example": "<example sentence>"}
  ],
  "topics": ["<short phrase for each subject the user actually talked about, e.g. 'weekend plans', 'cooking'>"]
}`;

  const advancedSkills = userLevel >= 3 ? `
Also evaluate these advanced skills (add to the skills object):
- "rhetoric": <0-100> (use of ethos, pathos, logos)
- "narrative": <0-100> (storytelling, analogies, humor)
- "delivery": <0-100> (pacing, hooks, persuasion)` : "";

  const levelDescriptions = `
The 5 levels are:
1: Learning - Understanding words and sentences
2: Speaking - Using words to speak basic facts
3: Communicating - Conveying complex ideas
4: Persuading - Convincing logically
5: Inspiring - Expert-level communication

The user's current level is ${userLevel}. Be calibrated - most learners are L1-L2. Only rate L4-L5 for genuinely exceptional speakers.`;

  const workNoteInstruction = `
Also extract a short work note from what the user said about their job. Add this top-level field to the JSON:
"work_note": {
  "worked_on": "<1-2 sentence summary of what they worked on>",
  "blockers": "<any blockers or struggles they mentioned, else empty string>",
  "highlights": "<any wins or notable progress, else empty string>",
  "sentiment": "<positive | neutral | negative based on their tone about work>"
}`;
  return baseSkills + advancedSkills + workNoteInstruction + levelDescriptions;
}

export async function assessSession(
  sessionId: string,
  userId: string,
  userLevel: number
): Promise<{ assessmentId: string; overallLevel: number; points: import("./gamification").PointsBreakdown }> {
  const messagesResult = await db.execute({
    sql: "SELECT role, content FROM messages WHERE session_id = ? ORDER BY created_at",
    args: [sessionId],
  });

  const transcript = messagesResult.rows
    .map((r) => `${(r.role as string).toUpperCase()}: ${r.content}`)
    .join("\n");

  const gradingPrompt = buildGradingPrompt(userLevel);

  // Grade with a hard timeout and graceful fallback: a slow, unreachable, or
  // malformed grade must still resolve to a valid assessment, never a crash.
  let parsed = buildFallbackAssessment(userLevel);
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), GRADING_TIMEOUT_MS);
    try {
      const res = await fetch(`${AI_URL}/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          text: `Here is the conversation transcript to assess:\n\n${transcript}`,
          session_id: `assess-${sessionId}`,
          system_prompt: gradingPrompt,
        }),
        signal: controller.signal,
      });
      if (res.ok) {
        const data = await res.json();
        if (typeof data?.text === "string" && data.text.trim().length > 0) {
          parsed = parseAssessmentResponse(data.text, userLevel);
        }
      }
    } finally {
      clearTimeout(timer);
    }
  } catch {
    // Network error, abort/timeout, or bad JSON: keep the valid fallback.
    parsed = buildFallbackAssessment(userLevel);
  }

  const overallLevel = parsed.overallLevel;
  const feedbackJson = parsed.feedbackJson;

  const assessmentId = uuid();
  await db.execute({
    sql: "INSERT INTO assessments (id, session_id, user_id, overall_level, feedback_json) VALUES (?, ?, ?, ?, ?)",
    args: [assessmentId, sessionId, userId, overallLevel, feedbackJson],
  });

  await db.execute({
    sql: "UPDATE users SET current_level = ? WHERE id = ?",
    args: [overallLevel, userId],
  });

  for (const [skill, score] of Object.entries(parsed.skills)) {
    await db.execute({
      sql: `INSERT INTO progress (id, user_id, skill, score, level, updated_at)
            VALUES (?, ?, ?, ?, ?, datetime('now'))
            ON CONFLICT(user_id, skill) DO UPDATE SET score = ?, level = ?, updated_at = datetime('now')`,
      args: [uuid(), userId, skill, score as number, overallLevel, score as number, overallLevel],
    });

    // Record one skill_history row per skill for progress sparklines.
    await db.execute({
      sql: `INSERT INTO skill_history (id, user_id, session_id, skill, score)
            VALUES (?, ?, ?, ?, ?)`,
      args: [uuid(), userId, sessionId, skill, score as number],
    });
  }

  const points = await awardPoints(userId, sessionId, parsed.skills);

  const wn = parsed.workNote;
  if (wn.worked_on || wn.highlights || wn.blockers) {
    await db.execute({
      sql: `INSERT INTO work_entries (id, user_id, session_id, summary_text, topics_json, blockers_text, sentiment)
            VALUES (?, ?, ?, ?, ?, ?, ?)`,
      args: [
        uuid(),
        userId,
        sessionId,
        wn.worked_on || wn.highlights || "",
        JSON.stringify(parsed.topics),
        wn.blockers || null,
        wn.sentiment,
      ],
    });
  }

  return { assessmentId, overallLevel, points };
}
