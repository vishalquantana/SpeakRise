# SpeakRise v1 — Design Spec

## Overview

SpeakRise is an AI-powered English conversation practice app. Users have daily 5-minute voice conversations with an AI partner, receive graded feedback, and track progress across 5 skill levels.

**v1 scope:** Auth + Core Conversation + Assessment/Grading + Post-Chat Reports
**v2 (later):** Gamification (badges, streaks, leaderboards), B2B/corporate features (teams, admin dashboards, org insights)

## Architecture

**Two services on one VPS (speakrise.quantana.top):**

1. **Next.js web app** (port 3000) — pages, auth, dashboard, reports, progress UI. All user-facing. Talks to Turso for persistence and to FastAPI for AI.
2. **FastAPI AI service** (port 8770, internal only) — Whisper STT, Kokoro TTS, DeepSeek LLM. Stateless — receives audio/text, returns audio/text. No direct DB access.

```
nginx (SSL via Let's Encrypt)
  └── all traffic → Next.js (port 3000)
        └── AI calls → FastAPI (port 8770, localhost only)
```

**Key tech decisions:**
- **Database:** Turso (libSQL) — accessed from Next.js via JS SDK
- **Auth:** Email + OTP via SendGrid. Session cookies (iron-session or similar).
- **STT:** faster-whisper (base model) — local on VPS
- **TTS:** Kokoro v1.0 ONNX — local on VPS, sentence-by-sentence streaming
- **LLM:** DeepSeek v4-flash via API — for conversation + post-session assessment
- **Frontend:** React (Next.js), mobile-first design
- **Deployment:** Single VPS (Vultr Mumbai, Ubuntu 24.04), systemd services, nginx reverse proxy

## Database Schema (Turso)

### users
| Column | Type | Notes |
|--------|------|-------|
| id | TEXT (UUID) | Primary key |
| email | TEXT | Unique |
| name | TEXT | Nullable, set during onboarding |
| current_level | INTEGER | 1-5, default 1 |
| onboarding_complete | BOOLEAN | Default false |
| created_at | DATETIME | |

### otp_codes
| Column | Type | Notes |
|--------|------|-------|
| id | TEXT (UUID) | Primary key |
| email | TEXT | |
| code | TEXT | 6-digit |
| expires_at | DATETIME | 10 min TTL |
| used | BOOLEAN | Default false |

### sessions
| Column | Type | Notes |
|--------|------|-------|
| id | TEXT (UUID) | Primary key |
| user_id | TEXT | FK → users |
| started_at | DATETIME | |
| ended_at | DATETIME | Nullable |
| duration_seconds | INTEGER | |
| session_type | TEXT | 'baseline' or 'daily' |

### messages
| Column | Type | Notes |
|--------|------|-------|
| id | TEXT (UUID) | Primary key |
| session_id | TEXT | FK → sessions |
| role | TEXT | 'user' or 'assistant' |
| content | TEXT | Transcript text |
| audio_duration_ms | INTEGER | Nullable |
| created_at | DATETIME | |

### assessments
| Column | Type | Notes |
|--------|------|-------|
| id | TEXT (UUID) | Primary key |
| session_id | TEXT | FK → sessions |
| user_id | TEXT | FK → users |
| overall_level | INTEGER | 1-5 |
| feedback_json | TEXT | JSON blob (see below) |
| created_at | DATETIME | |

### progress
| Column | Type | Notes |
|--------|------|-------|
| id | TEXT (UUID) | Primary key |
| user_id | TEXT | FK → users |
| skill | TEXT | e.g. 'grammar', 'vocabulary' |
| score | INTEGER | 0-100 |
| level | INTEGER | 1-5 |
| updated_at | DATETIME | |

**feedback_json structure:**
```json
{
  "overall_level": 2,
  "skills": { "grammar": 72, "vocabulary": 65, "sentence_variety": 45 },
  "feedback": { "went_well": ["...", "..."], "improve": ["...", "..."] },
  "exercises": [
    { "type": "repeat_after_me", "sentence": "...", "explanation": "..." },
    { "type": "vocabulary", "word": "...", "definition": "...", "example": "..." }
  ]
}
```

## Auth Flow

1. User enters email → Next.js API route generates 6-digit OTP → stores in `otp_codes` (10 min expiry) → sends via SendGrid
2. User enters OTP → API validates → creates or finds user → sets signed session cookie
3. New users (onboarding_complete = false) → redirect to `/onboarding`
4. Returning users → redirect to `/dashboard`

## Pages & User Flow

1. **`/login`** — Email input → OTP input → redirect
2. **`/onboarding`** — Baseline 5-min conversation with prompts: "Tell me about yourself", "What do you do?", "What do you want to do?". Sets starting level.
3. **`/dashboard`** — Current level, progress, "Start Today's Session" button, recent history, skill breakdown
4. **`/session`** — Conversation UI with soft 5-min timer, VAD, real-time transcript, streaming TTS
5. **`/report/[sessionId]`** — Post-chat report: feedback, skill scores, exercises, level progress
6. **`/history`** — Past sessions list with scores

All pages mobile-first, responsive up to desktop.

## Conversation Session Flow

1. User clicks "Start Session" → creates session in DB → opens conversation UI
2. VAD detects speech → records → sends to FastAPI (Whisper STT) → gets transcript
3. Transcript sent to FastAPI (DeepSeek) → gets response → stored in `messages`
4. Response sent to FastAPI (Kokoro TTS) → streamed sentence-by-sentence → plays back
5. Loop continues. Soft 5-min timer shows countdown.
6. At 5:00, AI wraps up naturally. Frontend stops VAD.
7. Session marked as ended. Full transcript sent to DeepSeek with grading prompt.
8. Assessment stored. User redirected to report page.

## Assessment & Grading Engine

Post-session, the full transcript is sent to DeepSeek with a structured grading prompt.

**Evaluated skills by level:**
- **L1:** Grammar, vocabulary, sentence length, WPM, clarity
- **L2:** Above + sentence variety, pausing, fluency
- **L3+:** Above + rhetoric (ethos/pathos/logos), narrative, delivery, persuasion

DeepSeek returns structured JSON (overall level, per-skill scores, prose feedback, exercises). Stored in `assessments`, `progress` tables updated.

**Onboarding baseline** uses the same engine with the 3 baseline prompts to set starting level.

## The 5 Levels

1. **Learning** — Understanding words and sentences → focus on vocabulary
2. **Speaking** — Using words to speak basic facts → focus on grammar
3. **Communicating** — Conveying complex ideas → focus on sentence length/variety
4. **Persuading** — Convincing logically → focus on word choice, rhetoric
5. **Inspiring** — Expert-level communication → focus on delivery, gravitas, storytelling

## Deployment

- **VPS:** Vultr Mumbai, Ubuntu 24.04, speakrise.quantana.top
- **SSL:** Let's Encrypt via certbot (required for mobile mic access)
- **Services:** systemd — Next.js (node), FastAPI (uvicorn), nginx
- **Whisper model:** base (fits in memory on 1GB + swap)
- **Deployment flow:** git push → ssh → pull → restart services
