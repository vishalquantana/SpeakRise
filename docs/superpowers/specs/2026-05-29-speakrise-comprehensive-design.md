# SpeakRise Comprehensive Product Design

**Date:** 2026-05-29
**Status:** Approved — ready for implementation planning

## Goal

Take SpeakRise from a working MVP to a comprehensive, engaging product that (1) measurably improves employees' spoken English and business communication, and (2) captures notes about employees' work so admins gain valuable per-employee and team-level insight. The product must stay engaging over time so nobody gets bored.

## Locked Decisions

- **Lesson engine:** Hybrid — curated skeletons as guardrails, LLM fills fresh topic/opening/coaching focus per session.
- **Work insights:** Admin-first — admin reads per-employee work notes verbatim plus aggregate rollups.
- **Nudges:** Targeted — admin recommends a specific lesson/skill; surfaced on the employee dashboard, optional email.
- **Plan scope:** One comprehensive plan, built in dependency order.
- **Work-note extraction:** Folded into the existing assessment LLM call (no extra round-trip).
- **Nudge email:** Opt-in per nudge (in-app is the default channel).

## Current State (baseline)

Already built and working:

- **Employee:** OTP login, baseline assessment onboarding, daily voice session (VAD → Whisper → DeepSeek → Kokoro streaming TTS), post-session report (skill scores, exercises, transcript, report TTS), dashboard (level, points, streak, badges, leaderboard), history.
- **Admin:** org creation, employee invites (SendGrid), admin dashboard with Engagement / Progress / Insights tabs, team management, configurable tracks.
- **Gamification:** streaks, points (participation + quality + streak bonus), badges, leaderboard (`lib/gamification.ts`).
- **Tracks:** 8 static work-oriented scenarios tagged by level (`lib/tracks.ts`).

Gaps this design closes:

1. No content freshness — only 8 static scenarios; users will get bored.
2. No lesson recommendations — nothing tells an employee what to practice next.
3. No real nudges — the Engagement tab only *labels* people "Needs a nudge"; no action, no targeting.
4. Weak work insights — `work_entries` just stores the first 3 user messages truncated to 500 chars.

## Subsystem 1 — Lesson Generator

**Curated skeletons** live in `lib/lessons.ts` as code constants (expanding today's `DEFAULT_SCENARIOS`). ~15–20 skeletons covering the level × skill × theme matrix. Each skeleton has:

- `id`, `theme` (daily-update, problem-solving, process-explanation, decision-defense, proposal-pitch, executive-brief, team-motivation, storytelling, negotiation, customer-call, interview, conflict-resolution, …)
- `level` (1–5 eligibility)
- `target_skills` (e.g. grammar, fluency, vocabulary, rhetoric, narrative, delivery, clarity)
- `prompt_skeleton` (system-prompt scaffold for the conversation)

**Generator** `generateLesson(userId, { targetSkill?, theme?, avoidRecent })`:

1. Selects an eligible skeleton: filters by user level, prefers one whose `target_skills` include the requested/weakest skill, and excludes the user's last N used `template_id`s (anti-repetition).
2. Calls DeepSeek to produce a fresh, personalized instance: `topic`, `opening_message`, `system_prompt_addition`, using the user's level and recent work topics as context.
3. **Returns clean text — the generator prompt explicitly forbids emojis** because `opening_message` is spoken via TTS.
4. Persists a `generated_lessons` row with `status = 'suggested'`.

**Variety guarantee:** skeleton rotation + LLM topic variation means lessons rarely repeat even within a theme.

### Table: `generated_lessons`

```
id TEXT PRIMARY KEY
user_id TEXT NOT NULL
template_id TEXT NOT NULL
level INTEGER NOT NULL
target_skill TEXT
topic TEXT NOT NULL
opening_message TEXT NOT NULL
system_prompt_addition TEXT NOT NULL
source TEXT NOT NULL DEFAULT 'auto'   -- 'auto' | 'recommendation' | 'nudge'
status TEXT NOT NULL DEFAULT 'suggested'  -- 'suggested' | 'completed'
session_id TEXT
created_at TEXT NOT NULL DEFAULT (datetime('now'))
```

## Subsystem 2 — Recommendation Engine

- `getWeakestSkills(userId)` reads the `progress` table and returns ranked weakest skills.
- Dashboard shows a **"Recommended for you"** card: a generated lesson targeting the weakest skill plus a one-line *why* ("Sharpen your grammar"). Actions: **Start recommended** and **Surprise me** (auto-pick).
- `/api/session/start` is extended to accept an optional `lessonId`. When present, it consumes that `generated_lessons` row (sets `session_id`, used as the session's scenario). When absent, it auto-generates a lesson server-side. This replaces the static `pickScenario` path while preserving track configuration (duration, enabled themes).

## Subsystem 3 — Nudge System

`lib/nudges.ts` + table `nudges`:

```
id TEXT PRIMARY KEY
org_id TEXT NOT NULL
from_admin_id TEXT NOT NULL
to_user_id TEXT NOT NULL
lesson_id TEXT            -- generated_lessons.id, nullable
target_skill TEXT
message TEXT
status TEXT NOT NULL DEFAULT 'pending'  -- 'pending' | 'seen' | 'completed'
created_at TEXT NOT NULL DEFAULT (datetime('now'))
seen_at TEXT
```

- **Admin:** Progress/Team views and the Engagement "Needs a nudge" list each get a working **Nudge** button → choose target skill/theme + optional message + optional "send email" checkbox → `createNudge()` generates a lesson targeting that skill (`source = 'nudge'`) and, if opted in, sends a SendGrid email.
- **Employee:** `getPendingNudges(userId)` powers a highlighted dashboard card — *"Your coach suggests: <lesson topic> — <message>."* Starting it runs the linked lesson and calls `completeNudge()` (→ `completed`). Loading the dashboard marks pending nudges `seen`.

### APIs

- `POST /api/admin/nudge` — body `{ toUserId, targetSkill?, theme?, message?, sendEmail? }`; admin-only.
- `GET /api/nudges` — pending nudges for the current user.

## Subsystem 4 — Work Insights (admin-first)

**Capture:** the assessment grading prompt (`lib/assessment.ts`) is extended so the returned JSON includes a `work_note` object: `{ worked_on, blockers, highlights, sentiment }` (sentiment ∈ positive | neutral | negative). Folded into the existing single assessment call. `work_entries` gains columns: `topics_json`, `blockers_text`, `sentiment` (keep `summary_text` for `worked_on`). The old "first 3 messages truncated" logic is removed.

**Admin Insights tab** (`lib/insights.ts`):

- **Per-employee drill-down:** `getEmployeeInsights(userId)` — timeline of work notes (full text), detected topics, sentiment/morale trend, surfaced blockers.
- **Org rollup:** `getOrgInsights(orgId)` — common themes, morale trend, list of currently-blocked employees.
- **Weekly digest:** `generateWeeklyDigest(orgId)` — LLM summarizes the week's `work_entries` into the existing `weekly_digests` table; optional digest email. Triggered on-demand from the admin UI (no cron dependency required for MVP).

## Subsystem 5 — Engagement Polish

The employee dashboard becomes the engagement hub, ordered: recommended-lesson card → pending-nudge card (if any) → level/points/streak summary → badges → leaderboard. Leaderboard supports "this week" and "all-time" and surfaces "longest streak" framing (data already exists in `gamification.ts`). No streak-freeze or other speculative features (YAGNI).

## Architecture Summary

**New libs:** `lib/lessons.ts` (skeletons + generator + recommendation helpers), `lib/nudges.ts`, `lib/insights.ts`.

**Schema (`lib/schema.ts`):** add `generated_lessons`, `nudges`; enrich `work_entries` with `topics_json`, `blockers_text`, `sentiment` via additive `ALTER` statements; populate `weekly_digests`.

**APIs:** `/api/session/start` (accept `lessonId`, auto-generate fallback), `POST /api/admin/nudge`, `GET /api/nudges`, `/api/admin/insights` (extend for per-employee + digest generation).

**UI:** dashboard (recommended + nudge cards, reordered), session start (lesson-aware), admin engagement/progress/team (nudge buttons), admin insights (per-employee drill-down + digest button).

**Closed-loop data flow per session:** dashboard recommends/loads lesson → session runs that lesson → assessment grades skills **and** extracts a work note (single call) → points/streak/badges update → `progress` updates → next recommendation reflects the new weakest skill → admin insights, leaderboard, and digests reflect it.

## Constraints & Risks

- **Customized Next.js:** `web/AGENTS.md` warns the framework differs from defaults — implementation must read `node_modules/next/dist/docs/` before writing route/page code.
- **TTS cleanliness:** any LLM output that reaches Kokoro (lesson `opening_message`, conversation turns) must be emoji-free; enforce in generator and conversation prompts.
- **Latency/cost:** lesson generation adds one DeepSeek call before a session starts; work-note extraction adds no extra call (folded into assessment). Acceptable.
- **Backwards compatibility:** existing sessions/tracks keep working; new lesson path is additive and falls back to auto-generation.

## Out of Scope

Multi-language, mobile app, accent/prosody analysis, payments/tiers, cron-scheduled digests/emails (digest is on-demand for now), streak-freeze and other speculative gamification.
