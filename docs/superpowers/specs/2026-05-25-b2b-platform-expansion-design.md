# SpeakRise B2B Platform Expansion — Design Spec

## Overview

Transform SpeakRise from a single-user English practice app into a B2B platform where managers create teams, invite employees, assign conversation tracks, and monitor engagement/progress/work insights. Gamification (streaks, points, leaderboards, badges) drives daily participation. The AI conversation weaves work capture into English practice, and post-session feedback is read aloud via TTS.

## Multi-Tenancy & Roles

### Org Model

- **Self-serve**: An admin signs up, creates an org, invites employees via email OTP.
- Two roles: `admin` (full org control) and `employee` (practice + view own stats).
- An admin can configure tracks, session duration, and view all team data.
- Employees see their own dashboard, streaks, points, and session history.

### Auth Flow (unchanged pattern)

- Email OTP login (existing SendGrid integration).
- On first login via invite link, employee is auto-associated with the org.
- Admin creates org during their own signup flow.

## Curriculum & Conversation Tracks

### 5 Levels

1. **Learning** — basic recall, simple sentences
2. **Speaking** — describing, explaining, asking questions
3. **Communicating** — cause/effect, technical vocabulary, structured responses
4. **Persuading** — argumentation, nuance, defending a position
5. **Inspiring** — executive communication, conciseness, leadership presence

### Default Track: Work-Oriented

Every session begins with "what did you work on today?" — the AI uses the response as conversation material, then steers toward a level-appropriate challenge:

- **L1-2**: Describe your day, answer simple follow-ups
- **L3**: Explain a problem you solved, describe a process
- **L4**: Persuade the AI why your approach was the right one
- **L5**: Present a 60-second elevator pitch about your project

### Scenario Variety

The AI picks from a pool of scenario templates per level. Admin can optionally configure which scenario types are active. The AI mixes topics session-to-session to avoid repetition.

### Admin Configuration

- **Session duration**: 3-10 minutes (default: 5)
- **Track assignment**: which track employees are on
- **Active scenarios**: which scenario types are enabled (default: all)

## Session Flow

1. Employee opens app → dashboard shows today's activity status
2. Clicks "Start Session" → timer begins (admin-configured duration)
3. AI speaks first: greets, asks about their work
4. Conversation flows naturally with VAD (existing)
5. Timer expires → session ends gracefully
6. AI generates assessment → TTS reads the summary aloud
7. Points awarded, streak updated, report displayed

## Scoring & Gamification

### Points (Participation + Quality Hybrid)

- **Participation base**: 10 points for completing a session
- **Streak multiplier**: consecutive days multiply base (x1.5 at 7 days, x2 at 30 days)
- **Quality points**: AI rates 4 dimensions (grammar, vocabulary, fluency, clarity) on 1-5 scale. Each point on the scale = 2 quality points. Max quality per session = 40 points.
- **Total per session**: base (10) + quality (up to 40) + streak bonus

### Streaks

- Counter increments for each consecutive day with a completed session
- Resets to 0 if a day is missed
- Visual streak counter on dashboard

### Badges

Milestone-based, awarded automatically:
- First Session
- 7-Day Streak, 30-Day Streak, 90-Day Streak
- Level Up (each time)
- Top Scorer of the Week
- Perfect Score (all 5s on quality)
- Centurion (100 sessions completed)

### Leaderboard

- Org-wide, ranked by total points
- Two views: rolling weekly + all-time
- Shows top 10 + your own position

## Manager Dashboard

Three tabs, engagement as default landing:

### Tab 1: Engagement (Default)

- Daily/weekly completion rate (% of team who practiced today)
- Active vs. inactive list (who hasn't practiced in 3+ days)
- Team streak distribution
- Participation trend chart (last 30 days)

### Tab 2: Progress

- Per-employee: current level, skill scores, improvement trend
- Team-level: distribution across levels, recent level-ups
- Skill heatmap (where the team is strong/weak collectively)

### Tab 3: Work Insights

- AI-generated weekly digest: common themes the team mentioned working on
- Per-employee: summarized daily work mentions
- Priority visualization: what the team is spending time on
- Generated every Sunday for the prior week

## Post-Session Report

After each session, the user sees AND hears (via TTS):
- Points earned this session (breakdown: participation + quality)
- Overall level achieved for this session
- 2-3 things that went well (specific examples from the conversation)
- 2-3 areas to improve (actionable suggestions)
- Current streak status

The TTS reads a concise version (not the full detail — just the headline feedback).

## Database Schema Additions

New tables needed:

- `organizations` — id, name, created_by, created_at
- `org_members` — id, org_id, user_id, role (admin/employee), invited_at, joined_at
- `tracks` — id, org_id, name, config_json (duration, scenarios, etc.)
- `user_tracks` — user_id, track_id, assigned_at
- `streaks` — user_id, current_streak, longest_streak, last_session_date
- `points` — id, user_id, session_id, participation_points, quality_points, streak_bonus, total, created_at
- `badges` — id, user_id, badge_type, earned_at
- `work_entries` — id, user_id, session_id, summary_text (AI-extracted), created_at
- `weekly_digests` — id, org_id, week_start, digest_json, created_at

Existing tables modified:
- `users`: add `org_id` (nullable, for org association)
- `sessions`: add `track_id`, `target_duration_seconds`

## UI Design Direction

- **Palette**: Soft cream/beige backgrounds (#FAF7F2), warm terracotta accents (#C75B39), sage green (#8FAE7E), muted gold (#D4A853)
- **Typography**: Rounded, friendly sans-serif (Inter or Plus Jakarta Sans)
- **Cards**: Large rounded corners (16-20px), gentle box shadows, no harsh borders
- **Spacing**: Generous whitespace, breathing room between elements
- **Animations**: Subtle — gentle fade-ins, smooth transitions, no flashy motion
- **Mobile-first**: Primary use case is phone, responsive up to desktop for admin dashboard

## Tech Stack

No changes to core infrastructure:
- **Frontend**: Next.js (existing)
- **AI Service**: FastAPI + Whisper + DeepSeek + Kokoro (existing)
- **Database**: Turso/libSQL (existing, schema expanded)
- **Email**: SendGrid (existing)
- **Hosting**: VPS at speakrise.quantana.top (existing)

## Out of Scope (for now)

- Premium/Pro tiers and billing
- Accent coaching and voice modulation
- Multiple orgs per admin
- SSO/SAML integration
- Mobile native apps
