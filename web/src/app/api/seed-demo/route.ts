import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { migrateDatabase } from "@/lib/schema";
import { DEFAULT_SCENARIOS } from "@/lib/tracks";

/**
 * Demo safety-net seed endpoint.
 *
 * Makes every screen look alive and reproduces the rank-up + badge moment on
 * every run. Idempotent: deletes all demo rows for the fixed demo org/users and
 * re-inserts a fresh, deterministic dataset.
 *
 * GUARDED: only runs when test/demo mode is on. Mirrors the test-mode pattern
 * used elsewhere (login uses ?test_mode=true). Hit:
 *   /api/seed-demo?test_mode=true
 */

// Fixed, deterministic identifiers so re-runs target the same rows.
const ORG_ID = "demo-org-speakrise";
const TRACK_ID = "demo-track-speakrise";

const SAM_ID = "demo-user-sam";
const SAM_EMAIL = "sam@speakrise.demo";

// Skills tracked per the skill_history contract.
const SKILLS = ["fluency", "vocabulary", "grammar", "clarity", "delivery"];

interface DemoUser {
  id: string;
  email: string;
  name: string;
  level: number;
  streak: number;
  // Total weekly points the user currently sits at on the leaderboard.
  points: number;
  topics: string[];
}

/**
 * Leaderboard math (see lib/gamification.awardPoints):
 *   one completed session ~= participation(10) + quality(<=40) + streakBonus.
 *   At streak 6 -> 7, multiplier becomes 1.5, so streakBonus = ~5.
 *   With strong skills, one more session is worth ~50 points.
 *
 * Sam sits 40 points behind the current #1 (Priya at 240). Finishing ONE more
 * session (~50 pts) takes Sam from 200 -> ~250 and vaults Sam to rank #1.
 */
const DEMO_USERS: DemoUser[] = [
  {
    id: SAM_ID,
    email: SAM_EMAIL,
    name: "Sam",
    level: 3,
    streak: 6,
    points: 200,
    topics: ["weekend plans", "cooking", "team standup"],
  },
  {
    id: "demo-user-priya",
    email: "priya@speakrise.demo",
    name: "Priya",
    level: 4,
    streak: 9,
    points: 240,
    topics: ["product launch", "customer calls"],
  },
  {
    id: "demo-user-diego",
    email: "diego@speakrise.demo",
    name: "Diego",
    level: 3,
    streak: 4,
    points: 175,
    topics: ["sprint planning", "code review"],
  },
  {
    id: "demo-user-mei",
    email: "mei@speakrise.demo",
    name: "Mei",
    level: 2,
    streak: 3,
    points: 150,
    topics: ["onboarding", "documentation"],
  },
  {
    id: "demo-user-omar",
    email: "omar@speakrise.demo",
    name: "Omar",
    level: 2,
    streak: 2,
    points: 120,
    topics: ["bug triage", "support tickets"],
  },
];

// Ascending per-skill score baselines so sparklines trend UP over time.
// Each user gets 5 historical points per skill, oldest -> newest.
function ascendingScores(base: number): number[] {
  return [base, base + 4, base + 7, base + 11, base + 15].map((s) =>
    Math.min(100, s)
  );
}

type Stmt = { sql: string; args: (string | number)[] };

export async function GET(req: NextRequest) {
  return run(req);
}

export async function POST(req: NextRequest) {
  return run(req);
}

async function run(req: NextRequest) {
  const testMode = req.nextUrl.searchParams.get("test_mode") === "true";
  if (!testMode) {
    return NextResponse.json(
      { error: "Forbidden. Demo seed only runs in test mode (?test_mode=true)." },
      { status: 403 }
    );
  }

  // Make sure the schema (incl. skill_history) exists before seeding.
  await migrateDatabase();

  const userIds = DEMO_USERS.map((u) => u.id);
  const placeholders = userIds.map(() => "?").join(", ");

  // ---- 1. Wipe prior demo rows (idempotent re-seed) -----------------------
  const cleanup: Stmt[] = [
    { sql: `DELETE FROM points WHERE user_id IN (${placeholders})`, args: userIds },
    { sql: `DELETE FROM skill_history WHERE user_id IN (${placeholders})`, args: userIds },
    { sql: `DELETE FROM assessments WHERE user_id IN (${placeholders})`, args: userIds },
    { sql: `DELETE FROM work_entries WHERE user_id IN (${placeholders})`, args: userIds },
    { sql: `DELETE FROM messages WHERE session_id LIKE ?`, args: ["demo-sess-%"] },
    { sql: `DELETE FROM sessions WHERE user_id IN (${placeholders})`, args: userIds },
    { sql: `DELETE FROM streaks WHERE user_id IN (${placeholders})`, args: userIds },
    { sql: `DELETE FROM badges WHERE user_id IN (${placeholders})`, args: userIds },
    { sql: `DELETE FROM user_tracks WHERE user_id IN (${placeholders})`, args: userIds },
    { sql: `DELETE FROM org_members WHERE org_id = ?`, args: [ORG_ID] },
    { sql: `DELETE FROM tracks WHERE id = ?`, args: [TRACK_ID] },
    { sql: `DELETE FROM organizations WHERE id = ?`, args: [ORG_ID] },
  ];
  await db.batch(cleanup);

  // ---- 2. Org + demo track ------------------------------------------------
  const setup: Stmt[] = [
    {
      sql: `INSERT INTO organizations (id, name, created_by) VALUES (?, ?, ?)`,
      args: [ORG_ID, "SpeakRise Demo", SAM_ID],
    },
    {
      sql: `INSERT INTO tracks (id, org_id, name, duration_seconds, scenarios_json) VALUES (?, ?, ?, ?, ?)`,
      args: [
        TRACK_ID,
        ORG_ID,
        "Work-Oriented English",
        300,
        JSON.stringify(DEFAULT_SCENARIOS.map((s) => s.id)),
      ],
    },
  ];

  // ---- 3. Users, membership, streaks, points, history, sessions ----------
  const seed: Stmt[] = [];
  // Backdate skill_history so the 5 points span recent days and trend up.
  // index 0 = oldest. created_at = now - (4 - index) days.
  const dayOffset = (idx: number) => `-${4 - idx} days`;

  for (const u of DEMO_USERS) {
    const isSam = u.id === SAM_ID;

    // User row (idempotent via REPLACE on the fixed id).
    seed.push({
      sql: `INSERT OR REPLACE INTO users (id, email, name, current_level, onboarding_complete, org_id)
            VALUES (?, ?, ?, ?, 1, ?)`,
      args: [u.id, u.email, u.name, u.level, ORG_ID],
    });

    // Org membership — joined_at must be non-null for admin/insights queries.
    seed.push({
      sql: `INSERT INTO org_members (id, org_id, user_id, role, joined_at)
            VALUES (?, ?, ?, ?, datetime('now'))`,
      args: [
        `demo-member-${u.id}`,
        ORG_ID,
        u.id,
        isSam ? "admin" : "employee",
      ],
    });

    // Assign user to the demo track.
    seed.push({
      sql: `INSERT INTO user_tracks (user_id, track_id) VALUES (?, ?)`,
      args: [u.id, TRACK_ID],
    });

    // Streak. Sam = 6 per the contract.
    seed.push({
      sql: `INSERT INTO streaks (user_id, current_streak, longest_streak, last_session_date)
            VALUES (?, ?, ?, date('now'))`,
      args: [u.id, u.streak, Math.max(u.streak, u.streak + 2)],
    });

    // Weekly points: spread the user's total across a few recent sessions so
    // both the per-session reports and the weekly leaderboard look populated.
    const sessionCount = 3;
    const per = Math.floor(u.points / sessionCount);
    let remaining = u.points;
    for (let s = 0; s < sessionCount; s++) {
      const sessionId = `demo-sess-${u.id}-${s}`;
      const total = s === sessionCount - 1 ? remaining : per;
      remaining -= per;
      const quality = Math.min(40, Math.max(0, total - 12));
      const participation = 10;
      const streakBonus = Math.max(0, total - participation - quality);

      // Session row (completed).
      seed.push({
        sql: `INSERT INTO sessions (id, user_id, started_at, ended_at, duration_seconds, session_type, track_id, target_duration_seconds)
              VALUES (?, ?, datetime('now', ?), datetime('now', ?), 300, 'daily', ?, 300)`,
        args: [sessionId, u.id, dayOffset(s + 2), dayOffset(s + 2), TRACK_ID],
      });

      // Points row, backdated so it falls inside the 7-day weekly window.
      seed.push({
        sql: `INSERT INTO points (id, user_id, session_id, participation_points, quality_points, streak_bonus, total, created_at)
              VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now', ?))`,
        args: [
          `demo-pts-${u.id}-${s}`,
          u.id,
          sessionId,
          participation,
          quality,
          streakBonus,
          total,
          dayOffset(s + 2),
        ],
      });
    }

    // A couple of transcript messages on the most recent session so the report
    // transcript view renders.
    const lastSession = `demo-sess-${u.id}-${sessionCount - 1}`;
    seed.push({
      sql: `INSERT INTO messages (id, session_id, role, content, created_at)
            VALUES (?, ?, 'assistant', ?, datetime('now', '-1 days'))`,
      args: [
        `demo-msg-${u.id}-a`,
        lastSession,
        "Hey! How was your day at work? What did you work on today?",
      ],
    });
    seed.push({
      sql: `INSERT INTO messages (id, session_id, role, content, created_at)
            VALUES (?, ?, 'user', ?, datetime('now', '-1 days'))`,
      args: [
        `demo-msg-${u.id}-u`,
        lastSession,
        `Today I worked on ${u.topics[0]} and talked with the team about it.`,
      ],
    });

    // skill_history: 5 ascending scores per skill so sparklines trend UP.
    SKILLS.forEach((skill, skillIdx) => {
      const base = 55 + skillIdx * 3 + (isSam ? 5 : 0);
      const scores = ascendingScores(base);
      scores.forEach((score, idx) => {
        seed.push({
          sql: `INSERT INTO skill_history (id, user_id, session_id, skill, score, created_at)
                VALUES (?, ?, ?, ?, ?, datetime('now', ?))`,
          args: [
            `demo-sh-${u.id}-${skill}-${idx}`,
            u.id,
            `demo-sess-${u.id}-${Math.min(idx, sessionCount - 1)}`,
            skill,
            score,
            dayOffset(idx),
          ],
        });
      });
    });

    // A completed assessment carrying feedback_json.topics (per CONTRACT) so the
    // report renders went_well / improve / exercises / skills, and admin topic
    // aggregation has data.
    const latestSkillScores: Record<string, number> = {};
    SKILLS.forEach((skill, skillIdx) => {
      const base = 55 + skillIdx * 3 + (isSam ? 5 : 0);
      latestSkillScores[skill] = ascendingScores(base).at(-1)!;
    });
    const feedback = {
      overall_level: u.level,
      skills: latestSkillScores,
      feedback: {
        went_well: [
          `You spoke clearly about ${u.topics[0]} and kept the conversation going.`,
          "Good use of full sentences and follow-up detail.",
        ],
        improve: [
          "Try varying sentence length to sound more natural.",
          "Add a few connecting words to link your ideas.",
        ],
      },
      exercises: [
        {
          prompt: `Describe ${u.topics[0]} in three sentences using past tense.`,
          skill: "grammar",
        },
        {
          prompt: "Explain a decision you made and why, in under a minute.",
          skill: "fluency",
        },
      ],
      topics: u.topics,
    };
    seed.push({
      sql: `INSERT INTO assessments (id, session_id, user_id, overall_level, feedback_json, created_at)
            VALUES (?, ?, ?, ?, ?, datetime('now', '-1 days'))`,
      args: [
        `demo-assess-${u.id}`,
        lastSession,
        u.id,
        u.level,
        JSON.stringify(feedback),
      ],
    });

    // work_entries carry topics_json (the admin topic aggregation source) plus
    // sentiment/blockers so org insights render.
    seed.push({
      sql: `INSERT INTO work_entries (id, user_id, session_id, summary_text, topics_json, blockers_text, sentiment, created_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now', '-1 days'))`,
      args: [
        `demo-work-${u.id}`,
        u.id,
        lastSession,
        `Worked on ${u.topics.join(", ")}.`,
        JSON.stringify(u.topics),
        isSam ? "" : "Waiting on review feedback to ship.",
        isSam ? "positive" : "neutral",
      ],
    });

    // Badges so the profile looks earned. Streak >= 7 unlocks streak_7 for the
    // higher-streak teammates; everyone has first_session.
    seed.push({
      sql: `INSERT INTO badges (id, user_id, badge_type) VALUES (?, ?, 'first_session')`,
      args: [`demo-badge-${u.id}-first`, u.id],
    });
    if (u.streak >= 7) {
      seed.push({
        sql: `INSERT INTO badges (id, user_id, badge_type) VALUES (?, ?, 'streak_7')`,
        args: [`demo-badge-${u.id}-streak7`, u.id],
      });
    }
  }

  await db.batch([...setup, ...seed]);

  // ---- 4. Summary ---------------------------------------------------------
  const leaderboard = [...DEMO_USERS]
    .sort((a, b) => b.points - a.points)
    .map((u, i) => ({ rank: i + 1, name: u.name, points: u.points }));
  const samRank = leaderboard.find((r) => r.name === "Sam")!.rank;
  const top = leaderboard[0];
  const gapToFirst = top.points - 200;

  return NextResponse.json({
    ok: true,
    org: { id: ORG_ID, name: "SpeakRise Demo" },
    track: { id: TRACK_ID, scenarios: DEFAULT_SCENARIOS.length },
    primaryUser: { id: SAM_ID, email: SAM_EMAIL, name: "Sam", streak: 6 },
    usersSeeded: DEMO_USERS.length,
    skillHistoryRowsPerUser: SKILLS.length * 5,
    leaderboard,
    rankUpMoment: {
      samCurrentRank: samRank,
      gapToFirst,
      note: `Sam sits ${gapToFirst} pts behind #1 (${top.name}). One more completed session (~50 pts at the streak-7 multiplier) makes Sam rank #1.`,
    },
  });
}
