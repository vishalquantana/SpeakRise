# SpeakRise - Product Requirements Document

## 1. Product Overview

SpeakRise is an AI-powered English conversation practice platform that helps users improve their speaking skills through daily 5-minute voice sessions with real-time AI feedback. Users progress through 5 proficiency levels — from basic comprehension to expert-level communication — via natural conversations, personalized assessments, and targeted exercises.

**Core Philosophy:** "Be a Crab" — shed your old shell and grow. Small daily practice compounds into transformative communication skills.

**Product URL:** https://speakrise.quantana.top

---

## 2. Target Audience & Business Model

### B2C (Individuals)
- **Free Tier:** 1 daily 5-minute conversation session
- **Premium Tier:** Multiple sessions per day, advanced analytics
- **Pro Tier:** Accent coaching, voice modulation, gravitas training, leadership communication

### B2B (Corporates)
- **Value Proposition:** Employees improve communication skills while the company gains macro-insights into organizational communication health and morale
- **Features:** Team dashboards, leaderboards, nudges, aggregate analytics

---

## 3. User Flows

### 3.1 Onboarding & Baseline Assessment
1. User visits app, enters email on login page
2. Receives 6-digit OTP via email (SendGrid), verifies identity
3. Redirected to baseline assessment — a 5-minute AI conversation
4. AI greets user warmly, asks them to introduce themselves
5. AI evaluates grammar, vocabulary, fluency, clarity, sentence structure
6. Starting level assigned (1-5), personalized roadmap generated
7. User lands on dashboard with their level and skill breakdown

### 3.2 The Daily Practice Loop
1. User opens dashboard, sees current level and skill scores
2. Clicks "Start Today's Session"
3. AI initiates conversation with an engaging question (AI speaks first)
4. Voice Activity Detection auto-captures speech — zero manual button presses
5. Real-time pipeline: Speech-to-Text → LLM response → Text-to-Speech playback
6. Session runs for ~5 minutes (timer visible)
7. Session ends → AI assessment runs automatically

### 3.3 Post-Session Report
After each session, users see:
- **Overall level achieved** (1-5 scale)
- **What went well** — 2-3 positive observations
- **Areas to improve** — 2-3 actionable suggestions
- **Skill breakdown** — Progress bars for each evaluated skill
- **Practice exercises** — "Repeat after me" (corrected sentences), vocabulary definitions with examples
- **Full transcript** — Complete conversation for review

### 3.4 History & Progress Tracking
- View all past sessions with date, type, duration, and level
- Click any session to see its full report
- Dashboard shows cumulative skill progress over time

---

## 4. The 5-Level Proficiency System

| Level | Name | Description | Focus Areas |
|-------|------|-------------|-------------|
| 1 | **Learning** | Understanding words and sentences | Vocabulary acquisition, basic grammar |
| 2 | **Speaking** | Using words to speak basic facts | Grammar accuracy, sentence construction |
| 3 | **Communicating** | Conveying complex ideas clearly | Sentence variety, fluency, clarity |
| 4 | **Persuading** | Convincing through logic and emotion | Rhetoric, word choice, argumentation |
| 5 | **Inspiring** | Expert-level communication | Narrative, delivery, gravitas |

---

## 5. Assessment & Feedback Engine

### Foundation Skills (All Levels)
| Skill | Measurement |
|-------|-------------|
| Grammar | Correctness of sentence structure (0-100) |
| Vocabulary | Range and appropriateness of word choice (0-100) |
| Sentence Length | Complexity and depth of expression (0-100) |
| Sentence Variety | Mix of simple, compound, complex sentences (0-100) |
| Fluency | Smoothness and natural flow (0-100) |
| Clarity | How clearly ideas are communicated (0-100) |

### Advanced Skills (Level 3+)
| Skill | Measurement |
|-------|-------------|
| Rhetoric | Use of ethos, pathos, logos (0-100) |
| Narrative | Storytelling, analogies, humor, insights (0-100) |
| Delivery | Pacing, hooks, curiosity, persuasion techniques (0-100) |

### Exercise Types
- **Repeat After Me:** Corrected versions of user's actual sentences — practice until correct
- **Vocabulary:** New words with definitions, example sentences, and usage context

---

## 6. Technical Architecture

### Stack
| Layer | Technology | Purpose |
|-------|-----------|---------|
| Frontend | Next.js 16, React 19, TypeScript, Tailwind CSS | Web UI, API proxy routes |
| AI Service | FastAPI (Python) | STT, LLM, TTS orchestration |
| Speech-to-Text | Faster-Whisper (small model, int8) | Audio transcription |
| LLM | DeepSeek v4-flash | Conversation and assessment grading |
| Text-to-Speech | Kokoro ONNX (local) | Voice synthesis, streaming SSE |
| Database | Turso (LibSQL) | Users, sessions, messages, assessments, progress |
| Auth | iron-session (encrypted cookies) | Passwordless OTP, 30-day sessions |
| Email | SendGrid | OTP delivery |
| Deployment | Nginx + systemd on VPS | Self-hosted, Let's Encrypt SSL |

### Data Model (6 Tables)
- **users** — id, email, name, current_level, onboarding_complete, created_at
- **otp_codes** — id, email, code, expires_at, used
- **sessions** — id, user_id, started_at, ended_at, duration_seconds, session_type
- **messages** — id, session_id, role, content, audio_duration_ms, created_at
- **assessments** — id, session_id, user_id, overall_level, feedback_json, created_at
- **progress** — id, user_id, skill, score, level, updated_at (unique per user+skill)

### Voice Pipeline (Real-Time)
```
User speaks → Mic (WebM/Opus)
  → VAD detects speech end (1.5s silence)
  → Whisper transcription
  → DeepSeek LLM generates response
  → Kokoro TTS streams audio (SSE, sentence-by-sentence)
  → Web Audio API playback
  → VAD resumes listening
```

### Voice Activity Detection
- Web Audio API AnalyserNode with RMS energy analysis
- Adaptive noise floor calibration (30 samples at session start)
- Speech threshold: noise_floor × 3.0
- Silence duration: 1500ms before stopping recording
- Minimum speech duration: 400ms to filter noise spikes
- Zero-button interaction — fully automatic

---

## 7. Pages & Routes

| Route | Auth | Purpose |
|-------|------|---------|
| `/login` | Public | Email + OTP login, test mode support |
| `/` | — | Smart redirect based on auth/onboarding state |
| `/onboarding` | Required | Baseline assessment conversation |
| `/dashboard` | Required | Level, skills, recent sessions, start session CTA |
| `/session` | Required | Daily conversation practice |
| `/report/[id]` | Required | Post-session feedback and assessment |
| `/history` | Required | All past sessions list |

---

## 8. Future Roadmap

### Phase 2 — Engagement & Retention
- Daily streak badges and visual rewards
- Push notification reminders
- Spaced repetition for weak skills
- Multiple AI personalities/coaching styles

### Phase 3 — Social & Teams (B2B)
- Team dashboards with aggregate analytics
- Nudge system (remind teammates to practice)
- Leaderboards (best team, most consistent)
- Manager insights into team communication health

### Phase 4 — Advanced Features
- Speaking rate analysis (words per minute)
- Pause and prosody detection
- Accent coaching and voice modulation training
- Industry-specific conversation scenarios (sales, interviews, presentations)
- Mobile app (React Native / Flutter)

### Phase 5 — Scale
- Multi-language support (Hindi, Spanish, etc.)
- Horizontal scaling of AI service
- Custom enterprise deployments (on-premise option)

---

## 9. Deployment & Infrastructure

- **VPS:** Vultr Mumbai (1GB RAM + swap)
- **Domain:** speakrise.quantana.top
- **SSL:** Let's Encrypt via Certbot
- **Process management:** systemd (speakrise-web, speakrise-ai)
- **Reverse proxy:** Nginx
- **AI models:** Local Whisper + Kokoro on VPS, DeepSeek via API

---

## 10. Key Design Decisions

1. **AI speaks first** — Reduces user anxiety, sets conversational tone, provides clear affordance
2. **Zero-button voice interaction** — VAD handles start/stop automatically, mimicking natural conversation
3. **Streaming TTS** — Sentence-by-sentence synthesis via SSE for low perceived latency
4. **Local TTS (Kokoro)** — Privacy-first, no external API dependency for voice synthesis
5. **Passwordless auth** — Email OTP reduces friction, no passwords to remember
6. **5-minute sessions** — Low commitment drives daily habit formation
7. **Dark theme** — Reduces eye strain, modern aesthetic for daily-use app
