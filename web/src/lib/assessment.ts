import { db } from "./db";
import { v4 as uuid } from "uuid";

const AI_URL = process.env.AI_SERVICE_URL || "http://localhost:8770";

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
  ]
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

  return baseSkills + advancedSkills + levelDescriptions;
}

export async function assessSession(
  sessionId: string,
  userId: string,
  userLevel: number
): Promise<{ assessmentId: string; overallLevel: number }> {
  const messagesResult = await db.execute({
    sql: "SELECT role, content FROM messages WHERE session_id = ? ORDER BY created_at",
    args: [sessionId],
  });

  const transcript = messagesResult.rows
    .map((r) => `${(r.role as string).toUpperCase()}: ${r.content}`)
    .join("\n");

  const gradingPrompt = buildGradingPrompt(userLevel);

  const res = await fetch(`${AI_URL}/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      text: `Here is the conversation transcript to assess:\n\n${transcript}`,
      session_id: `assess-${sessionId}`,
      system_prompt: gradingPrompt,
    }),
  });

  const data = await res.json();
  let feedbackJson: string;
  let overallLevel: number;

  try {
    const parsed = JSON.parse(data.text);
    overallLevel = parsed.overall_level;
    feedbackJson = JSON.stringify(parsed);
  } catch {
    overallLevel = userLevel;
    feedbackJson = JSON.stringify({
      overall_level: userLevel,
      skills: {},
      feedback: { went_well: ["Session completed"], improve: ["Keep practicing"] },
      exercises: [],
      raw_response: data.text,
    });
  }

  const assessmentId = uuid();
  await db.execute({
    sql: "INSERT INTO assessments (id, session_id, user_id, overall_level, feedback_json) VALUES (?, ?, ?, ?, ?)",
    args: [assessmentId, sessionId, userId, overallLevel, feedbackJson],
  });

  await db.execute({
    sql: "UPDATE users SET current_level = ? WHERE id = ?",
    args: [overallLevel, userId],
  });

  const feedback = JSON.parse(feedbackJson);
  if (feedback.skills) {
    for (const [skill, score] of Object.entries(feedback.skills)) {
      await db.execute({
        sql: `INSERT INTO progress (id, user_id, skill, score, level, updated_at)
              VALUES (?, ?, ?, ?, ?, datetime('now'))
              ON CONFLICT(user_id, skill) DO UPDATE SET score = ?, level = ?, updated_at = datetime('now')`,
        args: [uuid(), userId, skill, score as number, overallLevel, score as number, overallLevel],
      });
    }
  }

  return { assessmentId, overallLevel };
}
