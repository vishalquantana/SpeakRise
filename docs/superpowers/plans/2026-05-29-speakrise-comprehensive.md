# SpeakRise Comprehensive Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a hybrid lesson generator, per-employee lesson recommendations, targeted admin nudges, and richer work-insight capture to SpeakRise, with engagement polish — turning the MVP into a comprehensive product that stays fresh over time.

**Architecture:** Pure logic (lesson-skeleton selection, weakest-skill ranking, response parsing) lives in dependency-free `*-core.ts` modules that are unit-tested with vitest. DB/LLM-bound code wraps the core in `lib/*.ts`. Next.js API routes and server components follow the existing patterns (iron-session auth, `@libsql/client` `db`, `uuid`). The session loop stays unchanged; lessons feed it via the existing `scenario` shape (`openingMessage` + `systemPromptAddition`).

**Tech Stack:** Next.js 16 / React 19 / TypeScript, `@libsql/client` (Turso), iron-session, SendGrid, FastAPI + DeepSeek (AI service), vitest (new, for unit tests).

> **IMPORTANT — customized Next.js:** `web/AGENTS.md` warns this Next.js differs from defaults. Before editing any `app/**/route.ts` or `page.tsx`, read the relevant guide under `web/node_modules/next/dist/docs/`. The route/page snippets below mirror patterns already working in this repo, so follow them closely.

> **TTS rule (project memory):** Any LLM output that can reach Kokoro TTS (lesson `opening_message`, conversation turns) MUST be emoji-free. The generator prompt enforces this.

---

## File Structure

**New files:**
- `web/vitest.config.ts` — vitest config with `@/` alias.
- `web/src/lib/lessons-core.ts` — pure: skeleton catalog, `pickSkeleton`, `rankWeakestSkills`, `validateGeneratedLesson`, `buildGeneratorPrompt`. No db import.
- `web/src/lib/lessons-core.test.ts` — unit tests for the above.
- `web/src/lib/lessons.ts` — db/LLM-bound: `generateLesson`, `getRecommendedLesson`, `getWeakestSkillsForUser`, `getRecentTemplateIds`, `consumeLesson`.
- `web/src/lib/nudges.ts` — db-bound: `createNudge`, `getPendingNudges`, `markNudgesSeen`, `completeNudgeByLesson`.
- `web/src/lib/assessment-core.ts` — pure: `parseAssessmentResponse`.
- `web/src/lib/assessment-core.test.ts` — unit tests.
- `web/src/lib/insights.ts` — db/LLM-bound: `getEmployeeInsights`, `getOrgInsights`, `generateWeeklyDigest`.
- `web/src/app/api/admin/nudge/route.ts` — POST create nudge.
- `web/src/app/api/nudges/route.ts` — GET pending nudges.
- `web/src/components/nudge-button.tsx` — admin nudge modal/button.

**Modified files:**
- `web/package.json` — add vitest + `test` script.
- `web/src/lib/schema.ts` — new tables + ALTERs.
- `web/src/app/api/session/start/route.ts` — accept `lessonId`, auto-generate fallback.
- `web/src/app/session/page.tsx` — read `?lesson=` query param.
- `web/src/app/dashboard/page.tsx` — recommended-lesson card + pending-nudge card + leaderboard polish.
- `web/src/lib/assessment.ts` — use `assessment-core` parsing + enriched work-note persistence.
- `web/src/app/api/admin/insights/route.ts` — per-employee + digest support.
- `web/src/components/insights-tab.tsx` — drill-down + digest button.
- `web/src/components/engagement-tab.tsx` — working nudge buttons.
- `web/src/components/progress-tab.tsx` — nudge buttons.
- `web/src/components/leaderboard.tsx` — week/all-time framing (read first).

---

## Task 0: Test harness (vitest)

**Files:**
- Modify: `web/package.json`
- Create: `web/vitest.config.ts`

- [ ] **Step 1: Install vitest**

Run (from `web/`): `npm install -D vitest`
Expected: vitest added to devDependencies, no errors.

- [ ] **Step 2: Add test script to `web/package.json`**

In the `"scripts"` block, add:

```json
    "test": "vitest run"
```

- [ ] **Step 3: Create `web/vitest.config.ts`**

```ts
import { defineConfig } from "vitest/config";
import path from "path";

export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src"),
    },
  },
});
```

- [ ] **Step 4: Verify the runner works with no tests yet**

Run (from `web/`): `npm test`
Expected: vitest runs and reports "No test files found" (exit 0 or a clear no-tests message). This confirms config loads.

- [ ] **Step 5: Commit**

```bash
git add web/package.json web/package-lock.json web/vitest.config.ts
git commit -m "chore: add vitest test harness"
```

---

## Task 1: Schema — new tables and enriched work_entries

**Files:**
- Modify: `web/src/lib/schema.ts`

- [ ] **Step 1: Add `generated_lessons` and `nudges` table creates**

In `web/src/lib/schema.ts`, inside the `db.batch([...])` array, after the `weekly_digests` block (before the closing `]);`), add two entries:

```ts
    {
      sql: `CREATE TABLE IF NOT EXISTS generated_lessons (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        template_id TEXT NOT NULL,
        level INTEGER NOT NULL,
        target_skill TEXT,
        topic TEXT NOT NULL,
        opening_message TEXT NOT NULL,
        system_prompt_addition TEXT NOT NULL,
        source TEXT NOT NULL DEFAULT 'auto',
        status TEXT NOT NULL DEFAULT 'suggested',
        session_id TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      )`,
      args: [],
    },
    {
      sql: `CREATE TABLE IF NOT EXISTS nudges (
        id TEXT PRIMARY KEY,
        org_id TEXT NOT NULL,
        from_admin_id TEXT NOT NULL,
        to_user_id TEXT NOT NULL,
        lesson_id TEXT,
        target_skill TEXT,
        message TEXT,
        status TEXT NOT NULL DEFAULT 'pending',
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        seen_at TEXT
      )`,
      args: [],
    },
```

- [ ] **Step 2: Enrich `work_entries` via additive ALTERs**

In the same file, extend the `alterStatements` array with three new entries:

```ts
    "ALTER TABLE work_entries ADD COLUMN topics_json TEXT DEFAULT '[]'",
    "ALTER TABLE work_entries ADD COLUMN blockers_text TEXT",
    "ALTER TABLE work_entries ADD COLUMN sentiment TEXT DEFAULT 'neutral'",
```

(The existing try/catch loop already ignores "duplicate column" errors, so this is safe to re-run.)

- [ ] **Step 3: Run the migration via the existing setup endpoint**

Ensure dev servers run (see Task 4 Step for how). Then run:
`curl -X POST http://localhost:3000/api/setup-db`
Expected: JSON success response, no SQL errors in the Next.js console.

- [ ] **Step 4: Verify tables exist**

Run (from `web/`):
```bash
node -e "const{createClient}=require('@libsql/client');require('dotenv').config({path:'.env.local'});const db=createClient({url:process.env.TURSO_DATABASE_URL,authToken:process.env.TURSO_AUTH_TOKEN});db.execute(\"SELECT name FROM sqlite_master WHERE type='table' AND name IN ('generated_lessons','nudges')\").then(r=>{console.log(r.rows);process.exit(0)})"
```
Expected: both `generated_lessons` and `nudges` listed. (If `.env.local` path differs, point `dotenv` at the file holding `TURSO_*`.)

- [ ] **Step 5: Commit**

```bash
git add web/src/lib/schema.ts
git commit -m "feat: add generated_lessons and nudges tables, enrich work_entries"
```

---

## Task 2: Lesson skeletons + pure selection logic (TDD)

**Files:**
- Create: `web/src/lib/lessons-core.ts`
- Test: `web/src/lib/lessons-core.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `web/src/lib/lessons-core.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import {
  SKELETONS,
  pickSkeleton,
  rankWeakestSkills,
  validateGeneratedLesson,
} from "./lessons-core";

describe("SKELETONS catalog", () => {
  it("has at least 15 skeletons each with required fields", () => {
    expect(SKELETONS.length).toBeGreaterThanOrEqual(15);
    for (const s of SKELETONS) {
      expect(s.id).toBeTruthy();
      expect(s.theme).toBeTruthy();
      expect(s.level).toBeGreaterThanOrEqual(1);
      expect(s.level).toBeLessThanOrEqual(5);
      expect(s.targetSkills.length).toBeGreaterThan(0);
      expect(s.promptSkeleton).toBeTruthy();
    }
  });
});

describe("pickSkeleton", () => {
  it("only returns skeletons at or below the user level", () => {
    const s = pickSkeleton(1, undefined, [], SKELETONS);
    expect(s.level).toBeLessThanOrEqual(1);
  });

  it("prefers a skeleton targeting the requested skill when available", () => {
    const s = pickSkeleton(5, "rhetoric", [], SKELETONS);
    expect(s.targetSkills).toContain("rhetoric");
  });

  it("avoids recently used template ids when alternatives exist", () => {
    const all = pickSkeleton(3, undefined, [], SKELETONS);
    const next = pickSkeleton(3, undefined, [all.id], SKELETONS);
    expect(next.id).not.toBe(all.id);
  });

  it("falls back to any eligible skeleton if all are recently used", () => {
    const eligibleIds = SKELETONS.filter((s) => s.level <= 1).map((s) => s.id);
    const s = pickSkeleton(1, undefined, eligibleIds, SKELETONS);
    expect(s).toBeTruthy();
    expect(s.level).toBeLessThanOrEqual(1);
  });
});

describe("rankWeakestSkills", () => {
  it("returns skills sorted ascending by score", () => {
    const ranked = rankWeakestSkills([
      { skill: "grammar", score: 80 },
      { skill: "fluency", score: 40 },
      { skill: "clarity", score: 60 },
    ]);
    expect(ranked[0]).toBe("fluency");
    expect(ranked[2]).toBe("grammar");
  });

  it("returns empty array when no progress", () => {
    expect(rankWeakestSkills([])).toEqual([]);
  });
});

describe("validateGeneratedLesson", () => {
  it("accepts a well-formed lesson and strips emojis from opening", () => {
    const v = validateGeneratedLesson({
      topic: "Quarterly planning",
      opening_message: "Hey! What did you plan today? 😊",
      system_prompt_addition: "Push for structured thinking.",
    });
    expect(v).not.toBeNull();
    expect(v!.openingMessage).not.toMatch(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u);
    expect(v!.topic).toBe("Quarterly planning");
  });

  it("returns null when required fields are missing", () => {
    expect(validateGeneratedLesson({ topic: "x" })).toBeNull();
    expect(validateGeneratedLesson(null)).toBeNull();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run (from `web/`): `npm test`
Expected: FAIL — `Cannot find module './lessons-core'`.

- [ ] **Step 3: Implement `web/src/lib/lessons-core.ts`**

```ts
export type Skill =
  | "grammar"
  | "vocabulary"
  | "sentence_length"
  | "sentence_variety"
  | "fluency"
  | "clarity"
  | "rhetoric"
  | "narrative"
  | "delivery";

export interface Skeleton {
  id: string;
  theme: string;
  level: number;
  targetSkills: Skill[];
  promptSkeleton: string;
}

export interface GeneratedLessonContent {
  topic: string;
  openingMessage: string;
  systemPromptAddition: string;
}

export const SKELETONS: Skeleton[] = [
  { id: "daily-update-l1", theme: "daily-update", level: 1, targetSkills: ["vocabulary", "grammar"], promptSkeleton: "Ask what the user worked on today using simple, short questions. Offer vocabulary help naturally when they struggle." },
  { id: "daily-update-l2", theme: "daily-update", level: 2, targetSkills: ["grammar", "fluency"], promptSkeleton: "Ask what the user worked on today and follow up on details. Encourage them to describe processes and outcomes in full sentences." },
  { id: "small-talk-l1", theme: "small-talk", level: 1, targetSkills: ["fluency", "vocabulary"], promptSkeleton: "Make friendly small talk about everyday life. Keep it light and use simple sentences to build the user's confidence." },
  { id: "describe-routine-l2", theme: "routine", level: 2, targetSkills: ["sentence_length", "grammar"], promptSkeleton: "Ask the user to describe a routine or a typical day at work. Encourage sequencing words and complete sentences." },
  { id: "opinion-l2", theme: "opinions", level: 2, targetSkills: ["vocabulary", "clarity"], promptSkeleton: "Ask the user for a simple opinion and why. Encourage them to give one clear reason." },
  { id: "problem-solving-l3", theme: "problem-solving", level: 3, targetSkills: ["clarity", "sentence_variety"], promptSkeleton: "Ask the user to explain a challenge they faced and how they approached it. Push for cause-and-effect language and structured explanation." },
  { id: "process-explanation-l3", theme: "process-explanation", level: 3, targetSkills: ["clarity", "sentence_length"], promptSkeleton: "Ask the user to explain a process step-by-step. Encourage sequential language and precise vocabulary." },
  { id: "storytelling-l3", theme: "storytelling", level: 3, targetSkills: ["narrative", "sentence_variety"], promptSkeleton: "Ask the user to tell a short story about something that happened at work. Encourage a clear beginning, middle, and end." },
  { id: "customer-call-l3", theme: "customer-call", level: 3, targetSkills: ["clarity", "fluency"], promptSkeleton: "Role-play a customer with a question or mild complaint. Push the user to respond clearly and helpfully." },
  { id: "decision-defense-l4", theme: "decision-defense", level: 4, targetSkills: ["rhetoric", "clarity"], promptSkeleton: "Ask about a recent decision, then respectfully play devil's advocate. Push the user to articulate reasoning and weigh tradeoffs." },
  { id: "proposal-pitch-l4", theme: "proposal-pitch", level: 4, targetSkills: ["rhetoric", "delivery"], promptSkeleton: "Ask the user to pitch an idea or improvement, then challenge them with a skeptical stakeholder's questions. Push for clarity and conviction." },
  { id: "negotiation-l4", theme: "negotiation", level: 4, targetSkills: ["rhetoric", "delivery"], promptSkeleton: "Role-play a negotiation (deadline, scope, or budget). Push the user to make and defend a position while staying collaborative." },
  { id: "interview-l4", theme: "interview", level: 4, targetSkills: ["narrative", "clarity"], promptSkeleton: "Conduct a mock job interview. Ask behavioral questions and push for structured, evidence-backed answers (situation, action, result)." },
  { id: "conflict-resolution-l4", theme: "conflict-resolution", level: 4, targetSkills: ["clarity", "delivery"], promptSkeleton: "Role-play a disagreement with a teammate. Push the user to de-escalate, acknowledge the other side, and propose a path forward." },
  { id: "executive-brief-l5", theme: "executive-brief", level: 5, targetSkills: ["delivery", "clarity"], promptSkeleton: "Ask the user to brief you as if you were the CEO with 60 seconds. Push for conciseness, impact-first framing, and confident delivery." },
  { id: "team-motivation-l5", theme: "team-motivation", level: 5, targetSkills: ["narrative", "delivery"], promptSkeleton: "Ask the user to motivate a hypothetical team through a setback. Push for empathy, vision, and inspiring language." },
  { id: "vision-pitch-l5", theme: "vision-pitch", level: 5, targetSkills: ["rhetoric", "narrative"], promptSkeleton: "Ask the user to pitch a bold vision for their team or product. Push for a compelling narrative that blends logic and emotion." },
  { id: "handle-objections-l5", theme: "objection-handling", level: 5, targetSkills: ["rhetoric", "delivery"], promptSkeleton: "Pitch back hard objections to the user's idea. Push them to anticipate concerns, stay composed, and respond persuasively." },
];

export function pickSkeleton(
  userLevel: number,
  targetSkill: Skill | string | undefined,
  recentTemplateIds: string[],
  skeletons: Skeleton[] = SKELETONS
): Skeleton {
  const eligible = skeletons.filter((s) => s.level <= userLevel);
  const pool = eligible.length > 0 ? eligible : skeletons;

  let candidates = pool;
  if (targetSkill) {
    const targeted = pool.filter((s) =>
      s.targetSkills.includes(targetSkill as Skill)
    );
    if (targeted.length > 0) candidates = targeted;
  }

  const notRecent = candidates.filter((s) => !recentTemplateIds.includes(s.id));
  const finalPool = notRecent.length > 0 ? notRecent : candidates;

  return finalPool[Math.floor(Math.random() * finalPool.length)];
}

export function rankWeakestSkills(
  progress: { skill: string; score: number }[]
): string[] {
  return [...progress]
    .sort((a, b) => a.score - b.score)
    .map((p) => p.skill);
}

const EMOJI_RE =
  /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{2190}-\u{21FF}\u{2B00}-\u{2BFF}️]/gu;

function stripEmoji(s: string): string {
  return s.replace(EMOJI_RE, "").replace(/\s{2,}/g, " ").trim();
}

export function validateGeneratedLesson(
  raw: unknown
): GeneratedLessonContent | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  const topic = r.topic;
  const opening = r.opening_message;
  const sys = r.system_prompt_addition;
  if (typeof topic !== "string" || !topic.trim()) return null;
  if (typeof opening !== "string" || !opening.trim()) return null;
  if (typeof sys !== "string" || !sys.trim()) return null;
  return {
    topic: topic.trim(),
    openingMessage: stripEmoji(opening),
    systemPromptAddition: sys.trim(),
  };
}

export function buildGeneratorPrompt(
  skeleton: Skeleton,
  userLevel: number,
  recentWorkTopics: string[]
): string {
  const context =
    recentWorkTopics.length > 0
      ? `Recent things this user mentioned working on: ${recentWorkTopics.join("; ")}.`
      : "No prior work context available.";
  return `You design a single short English-practice conversation lesson for a workplace learner.
The learner's level is ${userLevel} (1=beginner ... 5=expert).
Lesson theme: "${skeleton.theme}". Coaching scaffold: ${skeleton.promptSkeleton}
${context}

Produce ONE fresh, specific lesson. Return ONLY valid JSON (no markdown, no code fences) with this exact shape:
{
  "topic": "<a short, fresh, specific topic for today's conversation>",
  "opening_message": "<the first thing the AI partner says out loud to open the conversation, 1-2 sentences, warm and natural>",
  "system_prompt_addition": "<instructions for the AI partner on how to steer this conversation toward the coaching scaffold>"
}

CRITICAL: opening_message will be read aloud by a text-to-speech engine. NEVER use emojis, emoticons, or special symbols anywhere in your output. Keep the topic different from the recent topics listed above.`;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run (from `web/`): `npm test`
Expected: PASS — all `lessons-core` tests green.

- [ ] **Step 5: Commit**

```bash
git add web/src/lib/lessons-core.ts web/src/lib/lessons-core.test.ts
git commit -m "feat: lesson skeleton catalog and pure selection logic"
```

---

## Task 3: Lesson generator (DB + LLM)

**Files:**
- Create: `web/src/lib/lessons.ts`

- [ ] **Step 1: Implement `web/src/lib/lessons.ts`**

```ts
import { db } from "./db";
import { v4 as uuid } from "uuid";
import { chat } from "./ai-client";
import {
  SKELETONS,
  pickSkeleton,
  rankWeakestSkills,
  validateGeneratedLesson,
  buildGeneratorPrompt,
  type Skeleton,
  type GeneratedLessonContent,
} from "./lessons-core";

export interface GeneratedLesson {
  id: string;
  templateId: string;
  level: number;
  targetSkill: string | null;
  topic: string;
  openingMessage: string;
  systemPromptAddition: string;
  source: "auto" | "recommendation" | "nudge";
}

export async function getWeakestSkillsForUser(userId: string): Promise<string[]> {
  const res = await db.execute({
    sql: "SELECT skill, score FROM progress WHERE user_id = ?",
    args: [userId],
  });
  return rankWeakestSkills(
    res.rows.map((r) => ({ skill: r.skill as string, score: r.score as number }))
  );
}

export async function getRecentTemplateIds(
  userId: string,
  limit = 4
): Promise<string[]> {
  const res = await db.execute({
    sql: "SELECT template_id FROM generated_lessons WHERE user_id = ? ORDER BY created_at DESC LIMIT ?",
    args: [userId, limit],
  });
  return res.rows.map((r) => r.template_id as string);
}

async function getRecentWorkTopics(userId: string, limit = 3): Promise<string[]> {
  const res = await db.execute({
    sql: "SELECT summary_text FROM work_entries WHERE user_id = ? ORDER BY created_at DESC LIMIT ?",
    args: [userId, limit],
  });
  return res.rows.map((r) => (r.summary_text as string).slice(0, 120));
}

function skeletonContentFallback(s: Skeleton): GeneratedLessonContent {
  return {
    topic: s.theme,
    openingMessage:
      "Hi there. Let's practice together. To start, what did you work on today?",
    systemPromptAddition: s.promptSkeleton,
  };
}

export async function generateLesson(
  userId: string,
  opts: {
    userLevel: number;
    targetSkill?: string;
    source?: "auto" | "recommendation" | "nudge";
  }
): Promise<GeneratedLesson> {
  const source = opts.source || "auto";
  const recent = await getRecentTemplateIds(userId);
  const skeleton = pickSkeleton(opts.userLevel, opts.targetSkill, recent, SKELETONS);
  const workTopics = await getRecentWorkTopics(userId);
  const prompt = buildGeneratorPrompt(skeleton, opts.userLevel, workTopics);

  let content: GeneratedLessonContent | null = null;
  try {
    const res = await chat(prompt, `lessongen-${uuid()}`);
    const cleaned = res.text.replace(/```json\s*|\s*```/g, "").trim();
    content = validateGeneratedLesson(JSON.parse(cleaned));
  } catch {
    content = null;
  }
  if (!content) content = skeletonContentFallback(skeleton);

  const id = uuid();
  const targetSkill = opts.targetSkill || skeleton.targetSkills[0] || null;
  await db.execute({
    sql: `INSERT INTO generated_lessons
            (id, user_id, template_id, level, target_skill, topic, opening_message, system_prompt_addition, source, status)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'suggested')`,
    args: [
      id,
      userId,
      skeleton.id,
      opts.userLevel,
      targetSkill,
      content.topic,
      content.openingMessage,
      content.systemPromptAddition,
      source,
    ],
  });

  return {
    id,
    templateId: skeleton.id,
    level: opts.userLevel,
    targetSkill,
    topic: content.topic,
    openingMessage: content.openingMessage,
    systemPromptAddition: content.systemPromptAddition,
    source,
  };
}

export async function getLessonById(
  lessonId: string,
  userId: string
): Promise<GeneratedLesson | null> {
  const res = await db.execute({
    sql: "SELECT * FROM generated_lessons WHERE id = ? AND user_id = ?",
    args: [lessonId, userId],
  });
  if (res.rows.length === 0) return null;
  const r = res.rows[0];
  return {
    id: r.id as string,
    templateId: r.template_id as string,
    level: r.level as number,
    targetSkill: (r.target_skill as string) || null,
    topic: r.topic as string,
    openingMessage: r.opening_message as string,
    systemPromptAddition: r.system_prompt_addition as string,
    source: r.source as "auto" | "recommendation" | "nudge",
  };
}

export async function getRecommendedLesson(
  userId: string,
  userLevel: number
): Promise<{ lesson: GeneratedLesson; weakestSkill: string | null }> {
  const existing = await db.execute({
    sql: `SELECT * FROM generated_lessons
          WHERE user_id = ? AND source = 'recommendation' AND status = 'suggested'
          ORDER BY created_at DESC LIMIT 1`,
    args: [userId],
  });
  const weakest = (await getWeakestSkillsForUser(userId))[0] || null;

  if (existing.rows.length > 0) {
    const r = existing.rows[0];
    return {
      weakestSkill: (r.target_skill as string) || weakest,
      lesson: {
        id: r.id as string,
        templateId: r.template_id as string,
        level: r.level as number,
        targetSkill: (r.target_skill as string) || null,
        topic: r.topic as string,
        openingMessage: r.opening_message as string,
        systemPromptAddition: r.system_prompt_addition as string,
        source: "recommendation",
      },
    };
  }

  const lesson = await generateLesson(userId, {
    userLevel,
    targetSkill: weakest || undefined,
    source: "recommendation",
  });
  return { lesson, weakestSkill: weakest };
}

export async function consumeLesson(
  lessonId: string,
  sessionId: string
): Promise<void> {
  await db.execute({
    sql: "UPDATE generated_lessons SET status = 'completed', session_id = ? WHERE id = ?",
    args: [sessionId, lessonId],
  });
}
```

- [ ] **Step 2: Type-check the new module**

Run (from `web/`): `npx tsc --noEmit`
Expected: no errors referencing `lessons.ts` or `lessons-core.ts`.

- [ ] **Step 3: Commit**

```bash
git add web/src/lib/lessons.ts
git commit -m "feat: DB/LLM lesson generator with recommendation and consume helpers"
```

---

## Task 4: Lesson-aware session start

**Files:**
- Modify: `web/src/app/api/session/start/route.ts`
- Modify: `web/src/app/session/page.tsx`

- [ ] **Step 1: Rewrite `web/src/app/api/session/start/route.ts`**

```ts
import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { db } from "@/lib/db";
import { v4 as uuid } from "uuid";
import { getTrackForUser } from "@/lib/tracks";
import { generateLesson, getLessonById, consumeLesson } from "@/lib/lessons";
import { completeNudgeByLesson } from "@/lib/nudges";

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session.userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { sessionType, lessonId } = await req.json();
  const id = uuid();

  const track = await getTrackForUser(session.userId);
  const userResult = await db.execute({
    sql: "SELECT current_level FROM users WHERE id = ?",
    args: [session.userId],
  });
  const userLevel = (userResult.rows[0]?.current_level as number) || 1;
  const duration = track?.duration || 300;
  const trackId = track?.trackId || null;

  let lesson = lessonId ? await getLessonById(lessonId, session.userId) : null;
  if (!lesson) {
    lesson = await generateLesson(session.userId, { userLevel, source: "auto" });
  }

  await db.execute({
    sql: "INSERT INTO sessions (id, user_id, session_type, track_id, target_duration_seconds) VALUES (?, ?, ?, ?, ?)",
    args: [id, session.userId, sessionType || "daily", trackId, duration],
  });

  await consumeLesson(lesson.id, id);
  if (lesson.source === "nudge") {
    await completeNudgeByLesson(lesson.id);
  }

  return NextResponse.json({
    sessionId: id,
    duration,
    scenario: {
      openingMessage: lesson.openingMessage,
      systemPromptAddition: lesson.systemPromptAddition,
    },
  });
}
```

> Note: this imports `completeNudgeByLesson` from `@/lib/nudges`, created in Task 6. If executing strictly in order, do Task 6 before running this route, or temporarily stub the import. Recommended: implement Task 6 immediately after this step's file edit and before Step 3 verification.

- [ ] **Step 2: Update `web/src/app/session/page.tsx` to pass `?lesson=`**

Replace the `useEffect` body so it reads the `lesson` query param and forwards it:

```tsx
  useEffect(() => {
    const lessonId = new URLSearchParams(window.location.search).get("lesson");
    fetch("/api/session/start", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sessionType: "daily", lessonId }),
    })
      .then((r) => r.json())
      .then((data) => {
        setSessionId(data.sessionId);
        setDuration(data.duration || 300);
        setScenario(data.scenario || null);
      });
  }, []);
```

- [ ] **Step 3: Verify in the browser (after Task 6 exists)**

Start AI service: `cd ai-service && uvicorn app:app --port 8770` (or use existing process).
Start web: `cd web && npm run dev`.
Log in via `http://localhost:3000/login?test_mode=true` (any email, OTP `123456`), complete onboarding if needed, then open `http://localhost:3000/session`.
Expected: session loads, AI speaks a generated opening line (no emojis), conversation works. Check the Next.js console for no errors.

- [ ] **Step 4: Commit**

```bash
git add web/src/app/api/session/start/route.ts web/src/app/session/page.tsx
git commit -m "feat: lesson-aware session start with auto-generation fallback"
```

---

## Task 5: Nudge backend

**Files:**
- Create: `web/src/lib/nudges.ts`
- Create: `web/src/app/api/admin/nudge/route.ts`
- Create: `web/src/app/api/nudges/route.ts`

- [ ] **Step 1: Implement `web/src/lib/nudges.ts`**

```ts
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
    sql: "SELECT email, current_level FROM users WHERE id = ?",
    args: [opts.toUserId],
  });
  if (userRes.rows.length === 0) throw new Error("User not found");
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
```

- [ ] **Step 2: Create `web/src/app/api/admin/nudge/route.ts`**

```ts
import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { createNudge } from "@/lib/nudges";

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session.userId || session.role !== "admin") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { toUserId, targetSkill, message, sendEmail } = await req.json();
  if (!toUserId) {
    return NextResponse.json({ error: "toUserId required" }, { status: 400 });
  }
  await createNudge({
    orgId: session.orgId!,
    fromAdminId: session.userId,
    toUserId,
    targetSkill,
    message,
    sendEmail,
  });
  return NextResponse.json({ ok: true });
}
```

- [ ] **Step 3: Create `web/src/app/api/nudges/route.ts`**

```ts
import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { getPendingNudges, markNudgesSeen } from "@/lib/nudges";

export async function GET() {
  const session = await getSession();
  if (!session.userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const nudges = await getPendingNudges(session.userId);
  await markNudgesSeen(session.userId);
  return NextResponse.json({ nudges });
}
```

- [ ] **Step 4: Type-check**

Run (from `web/`): `npx tsc --noEmit`
Expected: no errors. (`session/start` from Task 4 now resolves `completeNudgeByLesson`.)

- [ ] **Step 5: Commit**

```bash
git add web/src/lib/nudges.ts web/src/app/api/admin/nudge/route.ts web/src/app/api/nudges/route.ts
git commit -m "feat: nudge backend (create, list, complete) with optional email"
```

---

## Task 6: Nudge UI (admin + employee)

**Files:**
- Create: `web/src/components/nudge-button.tsx`
- Modify: `web/src/components/progress-tab.tsx`
- Modify: `web/src/components/engagement-tab.tsx`

- [ ] **Step 1: Create `web/src/components/nudge-button.tsx`**

```tsx
"use client";

import { useState } from "react";

const SKILLS = [
  "grammar",
  "vocabulary",
  "fluency",
  "clarity",
  "sentence_variety",
  "rhetoric",
  "narrative",
  "delivery",
];

export default function NudgeButton({
  userId,
  name,
}: {
  userId: string;
  name: string;
}) {
  const [open, setOpen] = useState(false);
  const [skill, setSkill] = useState("");
  const [message, setMessage] = useState("");
  const [sendEmail, setSendEmail] = useState(false);
  const [sending, setSending] = useState(false);
  const [done, setDone] = useState(false);

  async function submit() {
    setSending(true);
    await fetch("/api/admin/nudge", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        toUserId: userId,
        targetSkill: skill || undefined,
        message: message || undefined,
        sendEmail,
      }),
    });
    setSending(false);
    setDone(true);
    setOpen(false);
  }

  if (done) {
    return <span className="text-xs text-[var(--success)]">Nudge sent</span>;
  }

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="text-xs px-3 py-1.5 rounded-lg bg-[var(--accent)] text-white hover:bg-[#B5502F] transition"
      >
        Nudge
      </button>
      {open && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl p-5 w-full max-w-sm space-y-3">
            <h3 className="font-semibold text-[var(--foreground)]">Nudge {name}</h3>
            <label className="block text-sm text-[var(--muted)]">Focus skill</label>
            <select
              value={skill}
              onChange={(e) => setSkill(e.target.value)}
              className="w-full border border-[var(--card-border)] rounded-lg px-3 py-2 text-sm"
            >
              <option value="">Let the app choose</option>
              {SKILLS.map((s) => (
                <option key={s} value={s}>
                  {s.replace("_", " ")}
                </option>
              ))}
            </select>
            <label className="block text-sm text-[var(--muted)]">Message (optional)</label>
            <textarea
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              rows={3}
              className="w-full border border-[var(--card-border)] rounded-lg px-3 py-2 text-sm"
              placeholder="Keep it up - try this one next."
            />
            <label className="flex items-center gap-2 text-sm text-[var(--foreground)]">
              <input
                type="checkbox"
                checked={sendEmail}
                onChange={(e) => setSendEmail(e.target.checked)}
              />
              Also send an email
            </label>
            <div className="flex gap-2 justify-end pt-2">
              <button
                onClick={() => setOpen(false)}
                className="text-sm px-3 py-1.5 rounded-lg border border-[var(--card-border)] text-[var(--muted)]"
              >
                Cancel
              </button>
              <button
                disabled={sending}
                onClick={submit}
                className="text-sm px-3 py-1.5 rounded-lg bg-[var(--accent)] text-white disabled:opacity-50"
              >
                {sending ? "Sending..." : "Send nudge"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
```

- [ ] **Step 2: Add nudge buttons to `web/src/components/progress-tab.tsx`**

Add the import at the top (after the existing imports):

```tsx
import NudgeButton from "./nudge-button";
```

Replace the member row's right-hand cell so it shows points and a nudge button. Change the member `.map` block to:

```tsx
          {data.members.map((m: any, i: number) => (
            <div key={i} className="px-4 py-3 flex justify-between items-center">
              <div>
                <p className="text-sm font-medium text-[var(--foreground)]">{m.name || m.email}</p>
                <p className="text-xs text-[var(--muted)]">L{m.current_level} — {LEVEL_NAMES[m.current_level]}</p>
              </div>
              <div className="flex items-center gap-3">
                <span className="text-sm text-[var(--accent)] font-medium">{m.total_points || 0}pts</span>
                <NudgeButton userId={m.id} name={m.name || m.email} />
              </div>
            </div>
          ))}
```

- [ ] **Step 3: Add nudge buttons to the inactive list in `web/src/components/engagement-tab.tsx`**

Add the import after the React import:

```tsx
import NudgeButton from "./nudge-button";
```

Replace the inactive `.map` block with:

```tsx
            {data.inactive.slice(0, 10).map((u: any, i: number) => (
              <div key={i} className="px-4 py-3 flex justify-between items-center text-sm text-[var(--foreground)]">
                <span>{u.name || u.email}</span>
                <NudgeButton userId={u.id} name={u.name || u.email} />
              </div>
            ))}
```

- [ ] **Step 4: Verify in the browser**

With dev servers running, log in as an admin account (the account that created the org), open `http://localhost:3000/admin`, go to Progress and Engagement tabs.
Expected: each member shows a "Nudge" button; clicking opens the modal; sending shows "Nudge sent" and no console errors. (Email checkbox only sends if SendGrid env is set.)

- [ ] **Step 5: Commit**

```bash
git add web/src/components/nudge-button.tsx web/src/components/progress-tab.tsx web/src/components/engagement-tab.tsx
git commit -m "feat: admin nudge UI in progress and engagement tabs"
```

---

## Task 7: Dashboard — recommended lesson + pending nudge cards

**Files:**
- Modify: `web/src/app/dashboard/page.tsx`

- [ ] **Step 1: Add imports and data fetching**

In `web/src/app/dashboard/page.tsx`, add these imports after the existing ones:

```tsx
import { getRecommendedLesson } from "@/lib/lessons";
import { getPendingNudges } from "@/lib/nudges";
```

After the `const level = user.current_level as number;` line, add:

```tsx
  const { lesson: recommended, weakestSkill } = await getRecommendedLesson(
    session.userId,
    level
  );
  const pendingNudges = await getPendingNudges(session.userId);
  const topNudge = pendingNudges[0] || null;
```

- [ ] **Step 2: Render the nudge + recommended cards**

Replace the existing "Start Today's Session" block (the `<div className="mx-6 mt-4">...</div>`) with:

```tsx
      {topNudge && (
        <div className="mx-6 mt-4 p-4 bg-[var(--accent)]/10 border border-[var(--accent)] rounded-xl">
          <p className="text-xs uppercase tracking-wide text-[var(--accent)] font-semibold">Your coach suggests</p>
          {topNudge.message && (
            <p className="text-sm text-[var(--foreground)] mt-1">{topNudge.message}</p>
          )}
          <p className="text-sm font-medium text-[var(--foreground)] mt-1">
            {topNudge.lessonTopic || "A focused practice lesson"}
          </p>
          <Link
            href={topNudge.lessonId ? `/session?lesson=${topNudge.lessonId}` : "/session"}
            className="mt-3 inline-block px-4 py-2 bg-[var(--accent)] text-white rounded-lg text-sm font-semibold"
          >
            Start this lesson
          </Link>
        </div>
      )}

      <div className="mx-6 mt-4">
        {completedToday ? (
          <div className="p-4 bg-[var(--success-light)] border border-[var(--success)] rounded-xl text-center">
            <p className="text-[var(--success)] font-medium">Today's session complete</p>
            <Link href="/session" className="text-sm text-[var(--accent)] mt-1 inline-block">
              Practice more
            </Link>
          </div>
        ) : (
          <div className="p-4 bg-white rounded-2xl border border-[var(--card-border)] shadow-sm">
            <p className="text-xs uppercase tracking-wide text-[var(--muted)]">Recommended for you</p>
            <p className="text-lg font-semibold text-[var(--foreground)] mt-1">{recommended.topic}</p>
            {weakestSkill && (
              <p className="text-sm text-[var(--muted)] mt-0.5">
                Sharpen your {weakestSkill.replace("_", " ")}
              </p>
            )}
            <Link
              href={`/session?lesson=${recommended.id}`}
              className="block w-full mt-3 py-3 bg-[var(--accent)] hover:bg-[#B5502F] rounded-xl text-center font-semibold text-white transition"
            >
              Start recommended session
            </Link>
            <Link
              href="/session"
              className="block w-full mt-2 py-2 text-center text-sm text-[var(--accent)]"
            >
              Surprise me
            </Link>
          </div>
        )}
      </div>
```

- [ ] **Step 3: Verify in the browser**

With dev servers running, log in as an employee, open `http://localhost:3000/dashboard`.
Expected: a "Recommended for you" card with a topic and "Sharpen your <skill>" appears (when not completed today). If a nudge was sent to this user in Task 6, the coach card appears above it. Clicking "Start recommended session" opens `/session?lesson=...` and runs that lesson.

- [ ] **Step 4: Commit**

```bash
git add web/src/app/dashboard/page.tsx
git commit -m "feat: dashboard recommended-lesson and pending-nudge cards"
```

---

## Task 8: Work-note extraction (TDD parsing + assessment wiring)

**Files:**
- Create: `web/src/lib/assessment-core.ts`
- Test: `web/src/lib/assessment-core.test.ts`
- Modify: `web/src/lib/assessment.ts`

- [ ] **Step 1: Write failing tests for `assessment-core`**

Create `web/src/lib/assessment-core.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { parseAssessmentResponse } from "./assessment-core";

describe("parseAssessmentResponse", () => {
  it("parses valid JSON with skills, feedback, and work_note", () => {
    const raw = JSON.stringify({
      overall_level: 3,
      skills: { grammar: 70, fluency: 55 },
      feedback: { went_well: ["clear"], improve: ["vary sentences"] },
      exercises: [],
      work_note: {
        worked_on: "Refactored the billing module",
        blockers: "Waiting on API keys",
        highlights: "Shipped the migration",
        sentiment: "positive",
      },
    });
    const r = parseAssessmentResponse(raw, 2);
    expect(r.overallLevel).toBe(3);
    expect(r.skills.grammar).toBe(70);
    expect(r.workNote.worked_on).toBe("Refactored the billing module");
    expect(r.workNote.sentiment).toBe("positive");
  });

  it("strips code fences before parsing", () => {
    const raw = "```json\n" + JSON.stringify({ overall_level: 1, skills: {}, feedback: { went_well: [], improve: [] }, exercises: [] }) + "\n```";
    const r = parseAssessmentResponse(raw, 1);
    expect(r.overallLevel).toBe(1);
  });

  it("falls back to user level and neutral sentiment on invalid JSON", () => {
    const r = parseAssessmentResponse("not json at all", 4);
    expect(r.overallLevel).toBe(4);
    expect(r.workNote.sentiment).toBe("neutral");
    expect(r.skills).toEqual({});
  });

  it("normalizes an out-of-range sentiment to neutral", () => {
    const raw = JSON.stringify({ overall_level: 2, skills: {}, feedback: { went_well: [], improve: [] }, exercises: [], work_note: { worked_on: "x", sentiment: "ecstatic" } });
    const r = parseAssessmentResponse(raw, 2);
    expect(r.workNote.sentiment).toBe("neutral");
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run (from `web/`): `npm test`
Expected: FAIL — `Cannot find module './assessment-core'`.

- [ ] **Step 3: Implement `web/src/lib/assessment-core.ts`**

```ts
export type Sentiment = "positive" | "neutral" | "negative";

export interface WorkNote {
  worked_on: string;
  blockers: string;
  highlights: string;
  sentiment: Sentiment;
}

export interface ParsedAssessment {
  overallLevel: number;
  skills: Record<string, number>;
  feedbackJson: string;
  workNote: WorkNote;
}

function normalizeSentiment(s: unknown): Sentiment {
  if (s === "positive" || s === "negative") return s;
  return "neutral";
}

function emptyWorkNote(): WorkNote {
  return { worked_on: "", blockers: "", highlights: "", sentiment: "neutral" };
}

export function parseAssessmentResponse(
  rawText: string,
  userLevel: number
): ParsedAssessment {
  const cleaned = rawText.replace(/```json\s*|\s*```/g, "").trim();
  try {
    const parsed = JSON.parse(cleaned);
    const wn = parsed.work_note || {};
    const workNote: WorkNote = {
      worked_on: typeof wn.worked_on === "string" ? wn.worked_on : "",
      blockers: typeof wn.blockers === "string" ? wn.blockers : "",
      highlights: typeof wn.highlights === "string" ? wn.highlights : "",
      sentiment: normalizeSentiment(wn.sentiment),
    };
    return {
      overallLevel: typeof parsed.overall_level === "number" ? parsed.overall_level : userLevel,
      skills: parsed.skills && typeof parsed.skills === "object" ? parsed.skills : {},
      feedbackJson: JSON.stringify(parsed),
      workNote,
    };
  } catch {
    return {
      overallLevel: userLevel,
      skills: {},
      feedbackJson: JSON.stringify({
        overall_level: userLevel,
        skills: {},
        feedback: { went_well: ["Session completed"], improve: ["Keep practicing"] },
        exercises: [],
        raw_response: rawText,
      }),
      workNote: emptyWorkNote(),
    };
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run (from `web/`): `npm test`
Expected: PASS — all `assessment-core` tests green (plus the Task 2 tests).

- [ ] **Step 5: Extend the grading prompt in `web/src/lib/assessment.ts`**

In `buildGradingPrompt`, add a work-note instruction to the returned string. Change the final `return` line from:

```ts
  return baseSkills + advancedSkills + levelDescriptions;
```

to:

```ts
  const workNoteInstruction = `
Also extract a short work note from what the user said about their job. Add this top-level field to the JSON:
"work_note": {
  "worked_on": "<1-2 sentence summary of what they worked on>",
  "blockers": "<any blockers or struggles they mentioned, else empty string>",
  "highlights": "<any wins or notable progress, else empty string>",
  "sentiment": "<positive | neutral | negative based on their tone about work>"
}`;
  return baseSkills + advancedSkills + workNoteInstruction + levelDescriptions;
```

Also extend the JSON shape comment in `baseSkills` is optional; the explicit instruction above is sufficient.

- [ ] **Step 6: Rewrite the parse + persistence section of `assessSession`**

In `web/src/lib/assessment.ts`, add the import at top:

```ts
import { parseAssessmentResponse } from "./assessment-core";
```

Replace the block from `const data = await res.json();` down to the end of the work-entry insertion (the block that currently does manual `JSON.parse(data.text)` with try/catch, inserts the assessment, updates progress, awards points, and inserts the truncated work entry) with:

```ts
  const data = await res.json();
  const parsed = parseAssessmentResponse(data.text, userLevel);
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
        JSON.stringify([]),
        wn.blockers || null,
        wn.sentiment,
      ],
    });
  }

  return { assessmentId, overallLevel, points };
```

> This removes the old `feedback`/`workMessages` truncation logic entirely. Ensure no dangling references to the removed `feedback` variable remain.

- [ ] **Step 7: Type-check**

Run (from `web/`): `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 8: Verify end-to-end**

With dev servers running, complete a full session as an employee and reach the report.
Expected: report renders normally; in the DB, a new `work_entries` row has `sentiment` set and `summary_text` populated from `worked_on`.

- [ ] **Step 9: Commit**

```bash
git add web/src/lib/assessment-core.ts web/src/lib/assessment-core.test.ts web/src/lib/assessment.ts
git commit -m "feat: structured work-note extraction folded into assessment"
```

---

## Task 9: Admin insights upgrade

**Files:**
- Create: `web/src/lib/insights.ts`
- Modify: `web/src/app/api/admin/insights/route.ts`
- Modify: `web/src/components/insights-tab.tsx`

- [ ] **Step 1: Implement `web/src/lib/insights.ts`**

```ts
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
```

- [ ] **Step 2: Rewrite `web/src/app/api/admin/insights/route.ts`**

```ts
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
```

- [ ] **Step 3: Rewrite `web/src/components/insights-tab.tsx`**

```tsx
"use client";

import { useEffect, useState } from "react";

export default function InsightsTab() {
  const [data, setData] = useState<any>(null);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [entries, setEntries] = useState<Record<string, any[]>>({});
  const [digest, setDigest] = useState<string | null>(null);
  const [genLoading, setGenLoading] = useState(false);

  useEffect(() => {
    fetch("/api/admin/insights")
      .then((r) => r.json())
      .then((d) => {
        setData(d);
        if (d.latestDigest) {
          try {
            setDigest(JSON.parse(d.latestDigest.digest_json).summary);
          } catch {
            setDigest(null);
          }
        }
      });
  }, []);

  async function toggle(id: string) {
    if (expanded === id) {
      setExpanded(null);
      return;
    }
    setExpanded(id);
    if (!entries[id]) {
      const r = await fetch(`/api/admin/insights?employeeId=${id}`).then((x) => x.json());
      setEntries((prev) => ({ ...prev, [id]: r.entries }));
    }
  }

  async function generateDigest() {
    setGenLoading(true);
    const r = await fetch("/api/admin/insights", { method: "POST" }).then((x) => x.json());
    setDigest(r.summary);
    setGenLoading(false);
  }

  if (!data) return <p className="text-[var(--muted)] px-6">Loading...</p>;

  const sentimentCounts: Record<string, number> = {};
  (data.orgSentiment || []).forEach((s: any) => {
    sentimentCounts[s.sentiment] = s.c;
  });

  return (
    <div className="px-6 space-y-5">
      <div className="bg-white rounded-xl border border-[var(--card-border)] p-4">
        <div className="flex justify-between items-center mb-2">
          <h3 className="text-sm font-semibold text-[var(--foreground)]">Weekly Digest</h3>
          <button
            onClick={generateDigest}
            disabled={genLoading}
            className="text-xs px-3 py-1.5 rounded-lg bg-[var(--accent)] text-white disabled:opacity-50"
          >
            {genLoading ? "Generating..." : "Generate"}
          </button>
        </div>
        <p className="text-sm text-[var(--foreground)] whitespace-pre-line">
          {digest || "No digest yet. Click Generate to summarize the last 7 days."}
        </p>
      </div>

      <div className="grid grid-cols-3 gap-3">
        <div className="bg-white rounded-xl border border-[var(--card-border)] p-4 text-center">
          <p className="text-2xl font-bold text-[var(--success)]">{sentimentCounts.positive || 0}</p>
          <p className="text-xs text-[var(--muted)] mt-1">Positive</p>
        </div>
        <div className="bg-white rounded-xl border border-[var(--card-border)] p-4 text-center">
          <p className="text-2xl font-bold text-[var(--foreground)]">{sentimentCounts.neutral || 0}</p>
          <p className="text-xs text-[var(--muted)] mt-1">Neutral</p>
        </div>
        <div className="bg-white rounded-xl border border-[var(--card-border)] p-4 text-center">
          <p className="text-2xl font-bold text-[var(--gold)]">{sentimentCounts.negative || 0}</p>
          <p className="text-xs text-[var(--muted)] mt-1">Negative</p>
        </div>
      </div>

      {data.blocked && data.blocked.length > 0 && (
        <div>
          <h3 className="text-sm font-semibold text-[var(--foreground)] mb-2">Blockers</h3>
          <div className="bg-white rounded-xl border border-[var(--card-border)] divide-y divide-[var(--card-border)]">
            {data.blocked.map((b: any, i: number) => (
              <div key={i} className="px-4 py-3">
                <p className="text-xs font-medium text-[var(--accent)]">{b.name || b.email}</p>
                <p className="text-sm text-[var(--foreground)]">{b.blockers_text}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      <div>
        <h3 className="text-sm font-semibold text-[var(--foreground)] mb-2">By Employee</h3>
        <div className="bg-white rounded-xl border border-[var(--card-border)] divide-y divide-[var(--card-border)]">
          {data.employees.map((e: any) => (
            <div key={e.id}>
              <button
                onClick={() => toggle(e.id)}
                className="w-full px-4 py-3 flex justify-between items-center text-left"
              >
                <span className="text-sm font-medium text-[var(--foreground)]">{e.name || e.email}</span>
                <span className="text-xs text-[var(--muted)]">{e.entry_count} notes</span>
              </button>
              {expanded === e.id && (
                <div className="px-4 pb-3 space-y-2">
                  {(entries[e.id] || []).length === 0 ? (
                    <p className="text-xs text-[var(--muted)]">No work notes yet.</p>
                  ) : (
                    (entries[e.id] || []).map((w: any, i: number) => (
                      <div key={i} className="border-l-2 border-[var(--card-border)] pl-3">
                        <p className="text-xs text-[var(--muted)]">
                          {new Date(w.created_at).toLocaleDateString()} — {w.sentiment}
                        </p>
                        <p className="text-sm text-[var(--foreground)]">{w.summary_text}</p>
                        {w.blockers_text && (
                          <p className="text-xs text-[var(--gold)] mt-0.5">Blocker: {w.blockers_text}</p>
                        )}
                      </div>
                    ))
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Type-check**

Run (from `web/`): `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 5: Verify in the browser**

As admin, open `http://localhost:3000/admin` → Insights tab.
Expected: sentiment counts, blockers list (if any), per-employee accordion that loads work notes on expand, and a "Generate" digest button that produces a summary paragraph. No console errors.

- [ ] **Step 6: Commit**

```bash
git add web/src/lib/insights.ts web/src/app/api/admin/insights/route.ts web/src/components/insights-tab.tsx
git commit -m "feat: admin insights with per-employee drill-down, sentiment, blockers, weekly digest"
```

---

## Task 10: Engagement polish (leaderboard framing)

**Files:**
- Modify: `web/src/app/dashboard/page.tsx`
- Modify: `web/src/components/leaderboard.tsx` (read first to match its props)

- [ ] **Step 1: Read the leaderboard component**

Run: open `web/src/components/leaderboard.tsx` and confirm its prop names (`entries`, `currentUserId`) and what fields it reads (e.g. `total_points`, `streak`, `name`, `email`).

- [ ] **Step 2: Add an all-time leaderboard alongside the weekly one**

In `web/src/app/dashboard/page.tsx`, where `leaderboard` is computed, also compute all-time:

```tsx
  const leaderboard = session.orgId
    ? await getLeaderboard(session.orgId, "week")
    : [];
  const leaderboardAllTime = session.orgId
    ? await getLeaderboard(session.orgId, "alltime")
    : [];
```

Then, after the existing weekly leaderboard block, add an all-time block:

```tsx
      {leaderboardAllTime.length > 0 && (
        <div className="mx-6 mt-6">
          <h2 className="text-lg font-semibold mb-3 text-[var(--foreground)]">All-Time Leaderboard</h2>
          <Leaderboard entries={leaderboardAllTime as any} currentUserId={session.userId} />
        </div>
      )}
```

- [ ] **Step 3: Verify in the browser**

As an employee in an org with multiple members, open the dashboard.
Expected: both "This Week's Leaderboard" and "All-Time Leaderboard" render with correct ordering; the current user is highlighted (per existing component behavior). No console errors.

- [ ] **Step 4: Final type-check, lint, and test**

Run (from `web/`): `npx tsc --noEmit && npm run lint && npm test`
Expected: clean type-check, lint passes (or only pre-existing warnings), all unit tests green.

- [ ] **Step 5: Commit**

```bash
git add web/src/app/dashboard/page.tsx web/src/components/leaderboard.tsx
git commit -m "feat: add all-time leaderboard to dashboard"
```

---

## Self-Review Notes (resolved during planning)

- **Spec coverage:** Lesson generator (Tasks 2–4), recommendations (Tasks 3,7), nudges (Tasks 5–7), work insights capture (Task 8) + admin views/digest (Task 9), engagement polish (Tasks 7,10), schema (Task 1). All spec sections map to tasks.
- **Type consistency:** `generateLesson`/`getLessonById`/`getRecommendedLesson`/`consumeLesson` return the shared `GeneratedLesson` shape; `completeNudgeByLesson` referenced in Task 4 is defined in Task 5 (note added re: ordering); `parseAssessmentResponse` shape (`overallLevel`, `skills`, `feedbackJson`, `workNote`) matches its consumer in Task 8.
- **Cross-task dependency:** Task 4's `session/start` imports from `@/lib/nudges` (Task 5). Implement Task 5 before running Task 4's browser verification; the in-step note flags this.
- **TTS safety:** generator prompt and `validateGeneratedLesson` strip/forbid emojis; digest prompt forbids emojis (not spoken, but kept clean).
```
