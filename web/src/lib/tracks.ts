import { db } from "./db";
import { v4 as uuid } from "uuid";

export interface ScenarioTemplate {
  id: string;
  name: string;
  level: number;
  systemPromptAddition: string;
  openingMessage: string;
}

export const DEFAULT_SCENARIOS: ScenarioTemplate[] = [
  {
    id: "daily-update-l1",
    name: "Daily Update",
    level: 1,
    systemPromptAddition: "Start by asking what the user worked on today. Keep questions simple. Use short sentences. If they struggle, offer vocabulary help naturally.",
    openingMessage: "Hey! How was your day at work? What did you work on today?",
  },
  {
    id: "daily-update-l2",
    name: "Daily Update (Intermediate)",
    level: 2,
    systemPromptAddition: "Start by asking what the user worked on today. Ask follow-up questions about details. Encourage them to describe processes and outcomes.",
    openingMessage: "Good to see you! Tell me about your day — what was the most interesting thing you worked on?",
  },
  {
    id: "problem-solving-l3",
    name: "Problem Solving",
    level: 3,
    systemPromptAddition: "Start by asking what the user worked on today. Then ask them to explain a challenge or problem they faced. Push them to use cause-and-effect language, technical vocabulary, and structured explanations.",
    openingMessage: "Hi there! What have you been working on today? Did you run into any interesting challenges?",
  },
  {
    id: "process-explanation-l3",
    name: "Process Explanation",
    level: 3,
    systemPromptAddition: "Start by asking what the user worked on today. Then ask them to explain a process or workflow step-by-step. Encourage sequential language (first, then, after that) and precise vocabulary.",
    openingMessage: "Hey! What did you work on today? I'd love to hear about your process — walk me through it.",
  },
  {
    id: "decision-defense-l4",
    name: "Decision Defense",
    level: 4,
    systemPromptAddition: "Start by asking what the user worked on today. Then challenge a decision they made — play devil's advocate respectfully. Push them to articulate reasoning, weigh tradeoffs, and persuade you their choice was right.",
    openingMessage: "Welcome back! What did you work on today? Tell me about a decision you had to make.",
  },
  {
    id: "proposal-pitch-l4",
    name: "Proposal Pitch",
    level: 4,
    systemPromptAddition: "Start by asking what the user worked on today. Then ask them to pitch an idea or improvement. Challenge them with questions a skeptical stakeholder might ask. Push for clarity and conviction.",
    openingMessage: "Hi! What's been on your plate today? Is there anything you think could be done differently or better?",
  },
  {
    id: "executive-brief-l5",
    name: "Executive Briefing",
    level: 5,
    systemPromptAddition: "Start by asking what the user worked on today. Then ask them to summarize their week/project as if briefing a CEO in 60 seconds. Push for conciseness, impact-first framing, and confident delivery.",
    openingMessage: "Hello! Imagine I'm your CEO and I have 60 seconds. What's the most important thing I should know about what you've been working on?",
  },
  {
    id: "team-motivation-l5",
    name: "Team Motivation",
    level: 5,
    systemPromptAddition: "Start by asking what the user worked on today. Then ask them to motivate a hypothetical team through a difficult situation. Push for empathy, vision, and inspiring language.",
    openingMessage: "Hey! What did you work on today? Now imagine your team is frustrated with a setback — how would you rally them?",
  },
];

export async function createDefaultTrack(orgId: string): Promise<string> {
  const trackId = uuid();
  await db.execute({
    sql: "INSERT INTO tracks (id, org_id, name, duration_seconds, scenarios_json) VALUES (?, ?, ?, ?, ?)",
    args: [trackId, orgId, "Work-Oriented English", 300, JSON.stringify(DEFAULT_SCENARIOS.map(s => s.id))],
  });
  return trackId;
}

export async function getTrackForUser(userId: string): Promise<{ trackId: string; duration: number; scenarios: string[] } | null> {
  const result = await db.execute({
    sql: `SELECT t.id, t.duration_seconds, t.scenarios_json
          FROM user_tracks ut JOIN tracks t ON t.id = ut.track_id
          WHERE ut.user_id = ?
          LIMIT 1`,
    args: [userId],
  });
  if (result.rows.length === 0) return null;
  return {
    trackId: result.rows[0].id as string,
    duration: result.rows[0].duration_seconds as number,
    scenarios: JSON.parse(result.rows[0].scenarios_json as string),
  };
}

export function pickScenario(userLevel: number, enabledScenarioIds: string[]): ScenarioTemplate {
  const eligible = DEFAULT_SCENARIOS.filter(
    s => enabledScenarioIds.includes(s.id) && s.level <= userLevel
  );
  const atLevel = eligible.filter(s => s.level === userLevel);
  const pool = atLevel.length > 0 ? atLevel : eligible;
  return pool[Math.floor(Math.random() * pool.length)] || DEFAULT_SCENARIOS[0];
}

export async function assignUserToTrack(userId: string, trackId: string): Promise<void> {
  await db.execute({
    sql: `INSERT INTO user_tracks (user_id, track_id) VALUES (?, ?)
          ON CONFLICT(user_id, track_id) DO NOTHING`,
    args: [userId, trackId],
  });
}

export async function updateTrack(trackId: string, updates: { name?: string; duration_seconds?: number; scenarios_json?: string }): Promise<void> {
  const sets: string[] = [];
  const args: any[] = [];
  if (updates.name) { sets.push("name = ?"); args.push(updates.name); }
  if (updates.duration_seconds) { sets.push("duration_seconds = ?"); args.push(updates.duration_seconds); }
  if (updates.scenarios_json) { sets.push("scenarios_json = ?"); args.push(updates.scenarios_json); }
  args.push(trackId);
  await db.execute({ sql: `UPDATE tracks SET ${sets.join(", ")} WHERE id = ?`, args });
}
