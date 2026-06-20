# SpeakRise — Hackathon Brief

## The Problem

700 million people worldwide are learning English, yet most lack access to daily speaking practice with real feedback. Language apps teach vocabulary and grammar through text, but speaking fluency requires actual conversation. Private tutors cost $20-50/hour, conversation clubs are inconsistent, and most learners simply don't get enough speaking time.

The result: millions of professionals who can read and write English but freeze up in meetings, interviews, and presentations.

## The Opportunity

Build an AI-powered English conversation coach that gives anyone a daily 5-minute speaking partner — with real-time voice interaction and personalized feedback on what to improve.

## What We're Building

**SpeakRise** is a web app where users have a natural voice conversation with an AI partner every day. The AI listens, responds naturally, and after each session generates a detailed report on the user's grammar, vocabulary, fluency, clarity, and more — with specific exercises to improve.

### Core Experience (5-Minute Loop)
1. User opens the app and clicks "Start Session"
2. AI greets them and asks an engaging question (AI speaks first)
3. User responds naturally — voice is auto-detected (no buttons to press)
4. AI listens, transcribes, generates a thoughtful response, and speaks it back
5. Conversation flows naturally for ~5 minutes
6. Session ends → AI analyzes the conversation and produces a feedback report

### The Feedback Report
- **What went well** — positive reinforcement on strengths
- **Areas to improve** — specific, actionable suggestions
- **Skill scores** — grammar, vocabulary, fluency, clarity, sentence variety (0-100 each)
- **Practice exercises** — corrected versions of actual sentences to repeat, new vocabulary to learn
- **Overall level** — progression through 5 levels: Learning → Speaking → Communicating → Persuading → Inspiring

### User Journey
1. **Sign up** — email + OTP (passwordless)
2. **Baseline assessment** — first conversation determines starting level
3. **Daily practice** — 5-minute sessions, tracked over time
4. **Progress dashboard** — see skills improve across sessions
5. **History** — revisit any past session's report and transcript

## Tech Stack

| Component | Technology | Why |
|-----------|-----------|-----|
| Frontend | Next.js + React + TypeScript + Tailwind | Fast, modern web UI with SSR |
| AI Service | FastAPI (Python) | Orchestrates the AI pipeline |
| Speech-to-Text | Faster-Whisper | Fast, accurate, runs locally |
| Conversation AI | DeepSeek API | Affordable, high-quality LLM |
| Text-to-Speech | Kokoro (ONNX, local) | Low-latency streaming TTS, no API costs |
| Database | Turso (LibSQL) | Serverless SQLite, simple and fast |
| Auth | iron-session | Encrypted cookie sessions, zero infrastructure |
| Deployment | VPS + Nginx + systemd | Simple, self-contained, cost-effective |

## Key Technical Challenges

1. **Real-time voice pipeline** — Microphone → transcription → LLM → speech synthesis → playback, all with low enough latency to feel conversational
2. **Voice Activity Detection** — Automatically detect when the user starts and stops speaking without any buttons (Web Audio API + RMS energy analysis)
3. **Streaming TTS** — Synthesize speech sentence-by-sentence and stream via SSE so the AI starts "talking" before the full response is ready
4. **AI assessment** — Parse conversations and reliably grade multiple skill dimensions with consistent JSON output

## Architecture

```
Browser (Next.js)
  ├── Mic capture (WebM/Opus via MediaRecorder)
  ├── VAD (Web Audio API, auto start/stop)
  ├── Audio playback (AudioContext, streaming)
  │
  ├── /api/ai/transcribe  ──→  FastAPI /transcribe  ──→  Whisper
  ├── /api/ai/chat         ──→  FastAPI /chat        ──→  DeepSeek API
  ├── /api/ai/speak        ──→  FastAPI /speak-stream ──→  Kokoro TTS (SSE)
  │
  ├── /api/session/*       ──→  Turso DB (sessions, messages)
  └── /api/assess          ──→  DeepSeek (grading prompt) ──→  Turso DB
```

## Database Schema

```sql
users          (id, email, name, current_level, onboarding_complete)
otp_codes      (id, email, code, expires_at, used)
sessions       (id, user_id, session_type, started_at, ended_at, duration_seconds)
messages       (id, session_id, role, content, created_at)
assessments    (id, session_id, user_id, overall_level, feedback_json)
progress       (id, user_id, skill, score, level)  -- unique per user+skill
```

## Success Criteria

A working demo where someone can:
- [ ] Log in with email OTP
- [ ] Complete a baseline assessment conversation (hear the AI, speak back, natural flow)
- [ ] See their starting level and skill breakdown
- [ ] Do a daily practice session
- [ ] View a post-session report with feedback, skill scores, and exercises
- [ ] See progress tracked over multiple sessions on the dashboard

## Stretch Goals

- [ ] Team/group features — nudges, leaderboards, shared dashboards (B2B)
- [ ] Speaking rate analysis (words per minute)
- [ ] Multiple AI personalities (casual friend, interview coach, presentation trainer)
- [ ] Accent coaching and pronunciation feedback
- [ ] Mobile-responsive PWA
- [ ] Spaced repetition for vocabulary and sentence exercises

## Business Context

**Market:** Global English learning market is $60B+ and growing. Conversation practice is the most underserved segment.

**Monetization:**
- Free: 1 session/day
- Premium ($9.99/mo): Unlimited sessions, advanced analytics
- B2B ($X/seat/mo): Team dashboards, nudges, manager insights, org-level analytics

**Differentiation:**
- Voice-first (not text-based like Duolingo)
- AI speaks first (reduces user anxiety)
- Zero-button interaction (VAD handles everything)
- Actionable feedback with real exercises (not just a score)
- 5-minute habit (low commitment, high retention)

## Getting Started

```bash
# Clone and install
git clone <repo>
cd speakrise/web && npm install
cd ../ai-service && pip install -r requirements.txt

# Set up environment
cp .env.example .env.local  # Configure Turso, SendGrid, DeepSeek keys

# Run locally
cd ai-service && uvicorn app:app --port 8770  # AI service
cd web && npm run dev                          # Next.js on :3000

# Initialize database
curl -X POST http://localhost:3000/api/setup-db

# Test mode (no real email needed)
# Visit http://localhost:3000/login?test_mode=true
# Use any email, OTP: 123456
```

## What's Already Built

The MVP is functional and deployed at https://speakrise.quantana.top. The full voice pipeline works end-to-end: login, onboarding assessment, daily sessions, AI grading, feedback reports, progress tracking, and session history. The codebase is clean and modular — ready to extend.
