# SpeakRise v1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a full web app where users sign in with email+OTP, have daily 5-minute AI voice conversations, get graded, and track their English-speaking progress.

**Architecture:** Next.js web app (pages, auth, DB) + FastAPI AI service (Whisper STT, Kokoro TTS, DeepSeek LLM). Both on one VPS behind nginx. Turso (libSQL) for persistence.

**Tech Stack:** Next.js 15 (App Router), TypeScript, Tailwind CSS, iron-session, @libsql/client, SendGrid, FastAPI, faster-whisper, kokoro-onnx, DeepSeek API

---

## File Structure

```
speakrise/
├── web/                          # Next.js app
│   ├── package.json
│   ├── tsconfig.json
│   ├── tailwind.config.ts
│   ├── next.config.ts
│   ├── .env.local                # TURSO, SENDGRID, AI_SERVICE_URL, SESSION_SECRET
│   ├── src/
│   │   ├── lib/
│   │   │   ├── db.ts             # Turso client + query helpers
│   │   │   ├── schema.ts         # DB schema creation (migration)
│   │   │   ├── session.ts        # iron-session config + helpers
│   │   │   ├── auth.ts           # OTP generation, verification, SendGrid email
│   │   │   ├── ai-client.ts      # HTTP client to FastAPI service
│   │   │   └── assessment.ts     # Grading prompt builder + response parser
│   │   ├── app/
│   │   │   ├── layout.tsx        # Root layout (Tailwind, fonts, session provider)
│   │   │   ├── page.tsx          # Redirect to /dashboard or /login
│   │   │   ├── login/
│   │   │   │   └── page.tsx      # Email + OTP login form
│   │   │   ├── onboarding/
│   │   │   │   └── page.tsx      # Baseline conversation + level assessment
│   │   │   ├── dashboard/
│   │   │   │   └── page.tsx      # Home: level, progress, start session
│   │   │   ├── session/
│   │   │   │   └── page.tsx      # Voice conversation UI (client component)
│   │   │   ├── report/
│   │   │   │   └── [sessionId]/
│   │   │   │       └── page.tsx  # Post-chat feedback + exercises
│   │   │   ├── history/
│   │   │   │   └── page.tsx      # Past sessions list
│   │   │   └── api/
│   │   │       ├── auth/
│   │   │       │   ├── send-otp/route.ts
│   │   │       │   ├── verify-otp/route.ts
│   │   │       │   └── logout/route.ts
│   │   │       ├── session/
│   │   │       │   ├── start/route.ts
│   │   │       │   ├── end/route.ts
│   │   │       │   └── message/route.ts
│   │   │       ├── ai/
│   │   │       │   ├── transcribe/route.ts
│   │   │       │   ├── chat/route.ts
│   │   │       │   └── speak/route.ts
│   │   │       └── assess/route.ts
│   │   └── components/
│   │       ├── conversation-ui.tsx  # Voice chat component (VAD, recording, playback)
│   │       ├── timer.tsx            # 5-min soft countdown
│   │       ├── progress-bar.tsx     # Skill/level progress visualization
│   │       └── nav.tsx              # Mobile bottom nav
│   └── tests/
│       ├── lib/
│       │   ├── auth.test.ts
│       │   ├── assessment.test.ts
│       │   └── db.test.ts
│       └── api/
│           ├── auth.test.ts
│           └── session.test.ts
├── ai-service/                   # FastAPI (moved from root app.py)
│   ├── app.py                    # Main FastAPI app (existing, cleaned up)
│   ├── requirements.txt
│   └── .env                      # DEEPSEEK_API_KEY
├── deploy/
│   ├── nginx.conf                # nginx config for speakrise.quantana.top
│   ├── speakrise-web.service     # systemd unit for Next.js
│   ├── speakrise-ai.service      # systemd unit for FastAPI
│   └── setup.sh                  # VPS setup script (installs deps, configures services)
├── kokoro-v1.0.onnx              # TTS model (gitignored)
├── voices-v1.0.bin               # TTS voices (gitignored)
├── prd.md
└── docs/
```

---

### Task 1: Project Scaffolding — Next.js + Restructured AI Service

**Files:**
- Create: `web/package.json`, `web/tsconfig.json`, `web/tailwind.config.ts`, `web/next.config.ts`, `web/src/app/layout.tsx`, `web/src/app/page.tsx`, `web/.env.local`
- Move: `app.py` → `ai-service/app.py`
- Create: `ai-service/requirements.txt`, `ai-service/.env`

- [ ] **Step 1: Create the Next.js app**

```bash
cd /Users/vishalkumar/Downloads/speakrise
npx create-next-app@latest web --typescript --tailwind --eslint --app --src-dir --import-alias "@/*" --no-turbopack
```

Accept defaults. This creates the full `web/` directory with Next.js 15, TypeScript, Tailwind, App Router.

- [ ] **Step 2: Install Next.js dependencies**

```bash
cd web
npm install iron-session @libsql/client @sendgrid/mail uuid
npm install -D @types/uuid
```

- [ ] **Step 3: Create `web/.env.local`**

```env
TURSO_DATABASE_URL=<copy from root .env>
TURSO_AUTH_TOKEN=<copy from root .env>
SENDGRID_API_KEY=<copy from root .env>
SENDGRID_FROM_EMAIL=noreply@quantana.top
AI_SERVICE_URL=http://localhost:8770
SESSION_SECRET=<generate a random 32-char string>
```

- [ ] **Step 4: Restructure AI service**

Move existing `app.py` to `ai-service/app.py`. Update paths so Kokoro model files are referenced from project root.

```bash
mkdir -p ai-service
cp app.py ai-service/app.py
```

Edit `ai-service/app.py`: change `MODEL_DIR` to look one level up for model files:
```python
MODEL_DIR = os.path.dirname(os.path.dirname(__file__))
```

Create `ai-service/requirements.txt`:
```
fastapi
uvicorn
faster-whisper
kokoro-onnx
python-multipart
httpx
soundfile
numpy
python-dotenv
```

Create `ai-service/.env`:
```
DEEPSEEK_API_KEY=<copy from root .env>
```

- [ ] **Step 5: Verify AI service still runs**

```bash
cd /Users/vishalkumar/Downloads/speakrise
source venv/bin/activate
cd ai-service
python app.py
```

Test: `curl -s http://localhost:8770/voices | head -c 100`
Expected: JSON array of voice names.

- [ ] **Step 6: Verify Next.js runs**

```bash
cd /Users/vishalkumar/Downloads/speakrise/web
npm run dev
```

Open http://localhost:3000 — should see Next.js default page.

- [ ] **Step 7: Commit**

```bash
git add web/ ai-service/ .gitignore
git commit -m "feat: scaffold Next.js app + restructure AI service"
```

---

### Task 2: Database Schema + Turso Client

**Files:**
- Create: `web/src/lib/db.ts`
- Create: `web/src/lib/schema.ts`
- Create: `web/src/app/api/setup-db/route.ts` (temporary, for running migrations)

- [ ] **Step 1: Create Turso client**

Create `web/src/lib/db.ts`:
```typescript
import { createClient } from "@libsql/client";

export const db = createClient({
  url: process.env.TURSO_DATABASE_URL!,
  authToken: process.env.TURSO_AUTH_TOKEN!,
});
```

- [ ] **Step 2: Create schema migration**

Create `web/src/lib/schema.ts`:
```typescript
import { db } from "./db";

export async function migrateDatabase() {
  await db.batch([
    {
      sql: `CREATE TABLE IF NOT EXISTS users (
        id TEXT PRIMARY KEY,
        email TEXT UNIQUE NOT NULL,
        name TEXT,
        current_level INTEGER NOT NULL DEFAULT 1,
        onboarding_complete INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      )`,
      args: [],
    },
    {
      sql: `CREATE TABLE IF NOT EXISTS otp_codes (
        id TEXT PRIMARY KEY,
        email TEXT NOT NULL,
        code TEXT NOT NULL,
        expires_at TEXT NOT NULL,
        used INTEGER NOT NULL DEFAULT 0
      )`,
      args: [],
    },
    {
      sql: `CREATE TABLE IF NOT EXISTS sessions (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        started_at TEXT NOT NULL DEFAULT (datetime('now')),
        ended_at TEXT,
        duration_seconds INTEGER,
        session_type TEXT NOT NULL DEFAULT 'daily'
      )`,
      args: [],
    },
    {
      sql: `CREATE TABLE IF NOT EXISTS messages (
        id TEXT PRIMARY KEY,
        session_id TEXT NOT NULL,
        role TEXT NOT NULL,
        content TEXT NOT NULL,
        audio_duration_ms INTEGER,
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      )`,
      args: [],
    },
    {
      sql: `CREATE TABLE IF NOT EXISTS assessments (
        id TEXT PRIMARY KEY,
        session_id TEXT NOT NULL,
        user_id TEXT NOT NULL,
        overall_level INTEGER NOT NULL,
        feedback_json TEXT NOT NULL,
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      )`,
      args: [],
    },
    {
      sql: `CREATE TABLE IF NOT EXISTS progress (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        skill TEXT NOT NULL,
        score INTEGER NOT NULL DEFAULT 0,
        level INTEGER NOT NULL DEFAULT 1,
        updated_at TEXT NOT NULL DEFAULT (datetime('now')),
        UNIQUE(user_id, skill)
      )`,
      args: [],
    },
  ]);
}
```

- [ ] **Step 3: Create temporary migration API route**

Create `web/src/app/api/setup-db/route.ts`:
```typescript
import { NextResponse } from "next/server";
import { migrateDatabase } from "@/lib/schema";

export async function POST() {
  await migrateDatabase();
  return NextResponse.json({ ok: true });
}
```

- [ ] **Step 4: Run migration and verify**

```bash
cd /Users/vishalkumar/Downloads/speakrise/web
npm run dev
```

In another terminal:
```bash
curl -X POST http://localhost:3000/api/setup-db
```

Expected: `{"ok":true}`

- [ ] **Step 5: Commit**

```bash
cd /Users/vishalkumar/Downloads/speakrise
git add web/src/lib/db.ts web/src/lib/schema.ts web/src/app/api/setup-db/route.ts
git commit -m "feat: add Turso DB client and schema migration"
```

---

### Task 3: Auth — Session Config + OTP Email + Verification

**Files:**
- Create: `web/src/lib/session.ts`
- Create: `web/src/lib/auth.ts`
- Create: `web/src/app/api/auth/send-otp/route.ts`
- Create: `web/src/app/api/auth/verify-otp/route.ts`
- Create: `web/src/app/api/auth/logout/route.ts`

- [ ] **Step 1: Create session config**

Create `web/src/lib/session.ts`:
```typescript
import { getIronSession, IronSession } from "iron-session";
import { cookies } from "next/headers";

export interface SessionData {
  userId?: string;
  email?: string;
}

const sessionOptions = {
  password: process.env.SESSION_SECRET!,
  cookieName: "speakrise_session",
  cookieOptions: {
    secure: process.env.NODE_ENV === "production",
    httpOnly: true,
    sameSite: "lax" as const,
    maxAge: 60 * 60 * 24 * 30, // 30 days
  },
};

export async function getSession(): Promise<IronSession<SessionData>> {
  const cookieStore = await cookies();
  return getIronSession<SessionData>(cookieStore, sessionOptions);
}
```

- [ ] **Step 2: Create auth helpers**

Create `web/src/lib/auth.ts`:
```typescript
import sgMail from "@sendgrid/mail";
import { v4 as uuid } from "uuid";
import { db } from "./db";

sgMail.setApiKey(process.env.SENDGRID_API_KEY!);

export function generateOTP(): string {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

export async function createAndSendOTP(email: string): Promise<void> {
  const code = generateOTP();
  const id = uuid();
  const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString();

  await db.execute({
    sql: "INSERT INTO otp_codes (id, email, code, expires_at) VALUES (?, ?, ?, ?)",
    args: [id, email.toLowerCase(), code, expiresAt],
  });

  await sgMail.send({
    to: email,
    from: process.env.SENDGRID_FROM_EMAIL!,
    subject: "SpeakRise - Your login code",
    text: `Your SpeakRise verification code is: ${code}\n\nThis code expires in 10 minutes.`,
    html: `<h2>Your SpeakRise verification code</h2><p style="font-size:32px;font-weight:bold;letter-spacing:8px">${code}</p><p>This code expires in 10 minutes.</p>`,
  });
}

export async function verifyOTP(email: string, code: string): Promise<boolean> {
  const result = await db.execute({
    sql: `SELECT id FROM otp_codes
          WHERE email = ? AND code = ? AND used = 0 AND expires_at > datetime('now')
          ORDER BY expires_at DESC LIMIT 1`,
    args: [email.toLowerCase(), code],
  });

  if (result.rows.length === 0) return false;

  await db.execute({
    sql: "UPDATE otp_codes SET used = 1 WHERE id = ?",
    args: [result.rows[0].id as string],
  });

  return true;
}

export async function findOrCreateUser(email: string): Promise<{ id: string; onboarding_complete: boolean }> {
  const normalized = email.toLowerCase();
  const existing = await db.execute({
    sql: "SELECT id, onboarding_complete FROM users WHERE email = ?",
    args: [normalized],
  });

  if (existing.rows.length > 0) {
    return {
      id: existing.rows[0].id as string,
      onboarding_complete: existing.rows[0].onboarding_complete === 1,
    };
  }

  const id = uuid();
  await db.execute({
    sql: "INSERT INTO users (id, email) VALUES (?, ?)",
    args: [id, normalized],
  });

  return { id, onboarding_complete: false };
}
```

- [ ] **Step 3: Create send-otp API route**

Create `web/src/app/api/auth/send-otp/route.ts`:
```typescript
import { NextRequest, NextResponse } from "next/server";
import { createAndSendOTP } from "@/lib/auth";

export async function POST(req: NextRequest) {
  const { email } = await req.json();

  if (!email || !email.includes("@")) {
    return NextResponse.json({ error: "Valid email required" }, { status: 400 });
  }

  await createAndSendOTP(email);
  return NextResponse.json({ ok: true });
}
```

- [ ] **Step 4: Create verify-otp API route**

Create `web/src/app/api/auth/verify-otp/route.ts`:
```typescript
import { NextRequest, NextResponse } from "next/server";
import { verifyOTP, findOrCreateUser } from "@/lib/auth";
import { getSession } from "@/lib/session";

export async function POST(req: NextRequest) {
  const { email, code } = await req.json();

  const valid = await verifyOTP(email, code);
  if (!valid) {
    return NextResponse.json({ error: "Invalid or expired code" }, { status: 401 });
  }

  const user = await findOrCreateUser(email);
  const session = await getSession();
  session.userId = user.id;
  session.email = email;
  await session.save();

  return NextResponse.json({
    ok: true,
    redirect: user.onboarding_complete ? "/dashboard" : "/onboarding",
  });
}
```

- [ ] **Step 5: Create logout API route**

Create `web/src/app/api/auth/logout/route.ts`:
```typescript
import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";

export async function POST() {
  const session = await getSession();
  session.destroy();
  return NextResponse.json({ ok: true });
}
```

- [ ] **Step 6: Test auth flow manually**

```bash
cd /Users/vishalkumar/Downloads/speakrise/web
npm run dev
```

Test send OTP:
```bash
curl -X POST http://localhost:3000/api/auth/send-otp \
  -H "Content-Type: application/json" \
  -d '{"email":"test@example.com"}'
```
Expected: `{"ok":true}` and email received.

- [ ] **Step 7: Commit**

```bash
cd /Users/vishalkumar/Downloads/speakrise
git add web/src/lib/session.ts web/src/lib/auth.ts web/src/app/api/auth/
git commit -m "feat: add email+OTP auth with iron-session"
```

---

### Task 4: Login Page

**Files:**
- Create: `web/src/app/login/page.tsx`
- Modify: `web/src/app/layout.tsx` (add Inter font, dark theme globals)
- Modify: `web/src/app/page.tsx` (redirect logic)

- [ ] **Step 1: Update root layout with dark theme and Inter font**

Replace `web/src/app/layout.tsx`:
```tsx
import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "SpeakRise",
  description: "AI-powered English conversation practice",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="dark">
      <body className={`${inter.className} bg-gray-950 text-gray-100 min-h-screen`}>
        {children}
      </body>
    </html>
  );
}
```

- [ ] **Step 2: Update root page with redirect logic**

Replace `web/src/app/page.tsx`:
```tsx
import { redirect } from "next/navigation";
import { getSession } from "@/lib/session";
import { db } from "@/lib/db";

export default async function Home() {
  const session = await getSession();

  if (!session.userId) {
    redirect("/login");
  }

  const result = await db.execute({
    sql: "SELECT onboarding_complete FROM users WHERE id = ?",
    args: [session.userId],
  });

  if (result.rows.length === 0) {
    redirect("/login");
  }

  if (!result.rows[0].onboarding_complete) {
    redirect("/onboarding");
  }

  redirect("/dashboard");
}
```

- [ ] **Step 3: Create login page**

Create `web/src/app/login/page.tsx`:
```tsx
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [step, setStep] = useState<"email" | "otp">("email");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function handleSendOTP(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");

    const res = await fetch("/api/auth/send-otp", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email }),
    });

    setLoading(false);
    if (res.ok) {
      setStep("otp");
    } else {
      setError("Failed to send code. Try again.");
    }
  }

  async function handleVerifyOTP(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");

    const res = await fetch("/api/auth/verify-otp", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, code }),
    });

    const data = await res.json();
    setLoading(false);

    if (res.ok) {
      router.push(data.redirect);
    } else {
      setError("Invalid or expired code.");
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center px-6">
      <div className="w-full max-w-sm">
        <h1 className="text-3xl font-bold mb-2">
          Speak<span className="text-indigo-500">Rise</span>
        </h1>
        <p className="text-gray-400 mb-8">Practice English, level up your speaking</p>

        {step === "email" ? (
          <form onSubmit={handleSendOTP} className="space-y-4">
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="Enter your email"
              required
              className="w-full px-4 py-3 rounded-xl bg-gray-900 border border-gray-800 focus:border-indigo-500 focus:outline-none text-white placeholder-gray-500"
            />
            <button
              type="submit"
              disabled={loading}
              className="w-full py-3 rounded-xl bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 font-semibold transition"
            >
              {loading ? "Sending..." : "Send verification code"}
            </button>
          </form>
        ) : (
          <form onSubmit={handleVerifyOTP} className="space-y-4">
            <p className="text-gray-400 text-sm">Code sent to {email}</p>
            <input
              type="text"
              value={code}
              onChange={(e) => setCode(e.target.value)}
              placeholder="Enter 6-digit code"
              maxLength={6}
              required
              className="w-full px-4 py-3 rounded-xl bg-gray-900 border border-gray-800 focus:border-indigo-500 focus:outline-none text-white placeholder-gray-500 text-center text-2xl tracking-widest"
            />
            <button
              type="submit"
              disabled={loading}
              className="w-full py-3 rounded-xl bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 font-semibold transition"
            >
              {loading ? "Verifying..." : "Verify and sign in"}
            </button>
            <button
              type="button"
              onClick={() => { setStep("email"); setCode(""); setError(""); }}
              className="w-full py-2 text-gray-400 text-sm hover:text-white transition"
            >
              Use a different email
            </button>
          </form>
        )}

        {error && <p className="mt-4 text-red-400 text-sm text-center">{error}</p>}
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Verify login page renders**

```bash
cd /Users/vishalkumar/Downloads/speakrise/web && npm run dev
```

Open http://localhost:3000/login — should see the email input form with SpeakRise branding.

- [ ] **Step 5: Commit**

```bash
cd /Users/vishalkumar/Downloads/speakrise
git add web/src/app/layout.tsx web/src/app/page.tsx web/src/app/login/
git commit -m "feat: add login page with email+OTP flow"
```

---

### Task 5: AI Client + Proxy API Routes

**Files:**
- Create: `web/src/lib/ai-client.ts`
- Create: `web/src/app/api/ai/transcribe/route.ts`
- Create: `web/src/app/api/ai/chat/route.ts`
- Create: `web/src/app/api/ai/speak/route.ts`

- [ ] **Step 1: Create AI service client**

Create `web/src/lib/ai-client.ts`:
```typescript
const AI_URL = process.env.AI_SERVICE_URL || "http://localhost:8770";

export async function transcribeAudio(audioBlob: Blob): Promise<{ text: string; language: string }> {
  const form = new FormData();
  form.append("audio", audioBlob, "recording.webm");

  const res = await fetch(`${AI_URL}/transcribe`, { method: "POST", body: form });
  return res.json();
}

export async function chat(
  text: string,
  sessionId: string,
  systemPrompt?: string
): Promise<{ text: string }> {
  const res = await fetch(`${AI_URL}/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text, session_id: sessionId, system_prompt: systemPrompt }),
  });
  return res.json();
}

export async function speakStream(text: string, voice: string): Promise<Response> {
  return fetch(`${AI_URL}/speak-stream`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text, voice }),
  });
}
```

- [ ] **Step 2: Create transcribe proxy route**

Create `web/src/app/api/ai/transcribe/route.ts`:
```typescript
import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/session";

const AI_URL = process.env.AI_SERVICE_URL || "http://localhost:8770";

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session.userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const formData = await req.formData();
  const res = await fetch(`${AI_URL}/transcribe`, { method: "POST", body: formData });
  const data = await res.json();
  return NextResponse.json(data);
}
```

- [ ] **Step 3: Create chat proxy route**

Create `web/src/app/api/ai/chat/route.ts`:
```typescript
import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/session";

const AI_URL = process.env.AI_SERVICE_URL || "http://localhost:8770";

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session.userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json();
  const res = await fetch(`${AI_URL}/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await res.json();
  return NextResponse.json(data);
}
```

- [ ] **Step 4: Create speak proxy route (streaming)**

Create `web/src/app/api/ai/speak/route.ts`:
```typescript
import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/session";

const AI_URL = process.env.AI_SERVICE_URL || "http://localhost:8770";

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session.userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json();
  const res = await fetch(`${AI_URL}/speak-stream`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  return new NextResponse(res.body, {
    headers: { "Content-Type": "text/event-stream", "Cache-Control": "no-cache" },
  });
}
```

- [ ] **Step 5: Update FastAPI chat endpoint to accept optional system_prompt**

Edit `ai-service/app.py` — modify the `/chat` endpoint to accept an optional `system_prompt` field:
```python
@app.post("/chat")
async def chat(request: dict):
    session_id = request.get("session_id", "default")
    user_text = request["text"]
    system_prompt = request.get("system_prompt", SYSTEM_PROMPT)

    if session_id not in conversations:
        conversations[session_id] = []

    conversations[session_id].append({"role": "user", "content": user_text})
    messages = [{"role": "system", "content": system_prompt}] + conversations[session_id][-20:]

    async with httpx.AsyncClient(timeout=60.0) as client:
        resp = await client.post(
            "https://api.deepseek.com/chat/completions",
            headers={"Authorization": f"Bearer {DEEPSEEK_API_KEY}"},
            json={"model": "deepseek-v4-flash", "messages": messages, "stream": False},
        )
        data = resp.json()
        assistant_text = data["choices"][0]["message"]["content"]

    conversations[session_id].append({"role": "assistant", "content": assistant_text})
    return {"text": assistant_text}
```

- [ ] **Step 6: Commit**

```bash
cd /Users/vishalkumar/Downloads/speakrise
git add web/src/lib/ai-client.ts web/src/app/api/ai/ ai-service/app.py
git commit -m "feat: add AI proxy routes (transcribe, chat, speak-stream)"
```

---

### Task 6: Session Management API Routes

**Files:**
- Create: `web/src/app/api/session/start/route.ts`
- Create: `web/src/app/api/session/end/route.ts`
- Create: `web/src/app/api/session/message/route.ts`

- [ ] **Step 1: Create start-session route**

Create `web/src/app/api/session/start/route.ts`:
```typescript
import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { db } from "@/lib/db";
import { v4 as uuid } from "uuid";

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session.userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { sessionType } = await req.json();
  const id = uuid();

  await db.execute({
    sql: "INSERT INTO sessions (id, user_id, session_type) VALUES (?, ?, ?)",
    args: [id, session.userId, sessionType || "daily"],
  });

  return NextResponse.json({ sessionId: id });
}
```

- [ ] **Step 2: Create end-session route**

Create `web/src/app/api/session/end/route.ts`:
```typescript
import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { db } from "@/lib/db";

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session.userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { sessionId } = await req.json();

  const sessionRow = await db.execute({
    sql: "SELECT started_at FROM sessions WHERE id = ? AND user_id = ?",
    args: [sessionId, session.userId],
  });

  if (sessionRow.rows.length === 0) {
    return NextResponse.json({ error: "Session not found" }, { status: 404 });
  }

  const startedAt = new Date(sessionRow.rows[0].started_at as string);
  const durationSeconds = Math.round((Date.now() - startedAt.getTime()) / 1000);

  await db.execute({
    sql: "UPDATE sessions SET ended_at = datetime('now'), duration_seconds = ? WHERE id = ?",
    args: [durationSeconds, sessionId],
  });

  return NextResponse.json({ ok: true, durationSeconds });
}
```

- [ ] **Step 3: Create message storage route**

Create `web/src/app/api/session/message/route.ts`:
```typescript
import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { db } from "@/lib/db";
import { v4 as uuid } from "uuid";

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session.userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { sessionId, role, content, audioDurationMs } = await req.json();

  const id = uuid();
  await db.execute({
    sql: "INSERT INTO messages (id, session_id, role, content, audio_duration_ms) VALUES (?, ?, ?, ?, ?)",
    args: [id, sessionId, role, content, audioDurationMs || null],
  });

  return NextResponse.json({ id });
}
```

- [ ] **Step 4: Commit**

```bash
cd /Users/vishalkumar/Downloads/speakrise
git add web/src/app/api/session/
git commit -m "feat: add session management API routes (start, end, message)"
```

---

### Task 7: Assessment Engine

**Files:**
- Create: `web/src/lib/assessment.ts`
- Create: `web/src/app/api/assess/route.ts`

- [ ] **Step 1: Create assessment module**

Create `web/src/lib/assessment.ts`:
```typescript
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

The user's current level is ${userLevel}. Be calibrated — most learners are L1-L2. Only rate L4-L5 for genuinely exceptional speakers.`;

  return baseSkills + advancedSkills + levelDescriptions;
}

export async function assessSession(
  sessionId: string,
  userId: string,
  userLevel: number
): Promise<{ assessmentId: string; overallLevel: number }> {
  // Fetch all messages for this session
  const messagesResult = await db.execute({
    sql: "SELECT role, content FROM messages WHERE session_id = ? ORDER BY created_at",
    args: [sessionId],
  });

  const transcript = messagesResult.rows
    .map((r) => `${(r.role as string).toUpperCase()}: ${r.content}`)
    .join("\n");

  const gradingPrompt = buildGradingPrompt(userLevel);

  // Call DeepSeek via the AI service for assessment
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
    // If LLM doesn't return valid JSON, wrap it
    overallLevel = userLevel;
    feedbackJson = JSON.stringify({
      overall_level: userLevel,
      skills: {},
      feedback: { went_well: ["Session completed"], improve: ["Keep practicing"] },
      exercises: [],
      raw_response: data.text,
    });
  }

  // Store assessment
  const assessmentId = uuid();
  await db.execute({
    sql: "INSERT INTO assessments (id, session_id, user_id, overall_level, feedback_json) VALUES (?, ?, ?, ?, ?)",
    args: [assessmentId, sessionId, userId, overallLevel, feedbackJson],
  });

  // Update user level
  await db.execute({
    sql: "UPDATE users SET current_level = ? WHERE id = ?",
    args: [overallLevel, userId],
  });

  // Update progress table
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
```

- [ ] **Step 2: Create assess API route**

Create `web/src/app/api/assess/route.ts`:
```typescript
import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { db } from "@/lib/db";
import { assessSession } from "@/lib/assessment";

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session.userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { sessionId } = await req.json();

  // Get user's current level
  const userResult = await db.execute({
    sql: "SELECT current_level FROM users WHERE id = ?",
    args: [session.userId],
  });

  const currentLevel = (userResult.rows[0]?.current_level as number) || 1;

  const { assessmentId, overallLevel } = await assessSession(
    sessionId,
    session.userId,
    currentLevel
  );

  return NextResponse.json({ assessmentId, overallLevel });
}
```

- [ ] **Step 3: Commit**

```bash
cd /Users/vishalkumar/Downloads/speakrise
git add web/src/lib/assessment.ts web/src/app/api/assess/
git commit -m "feat: add assessment engine with grading prompt and progress tracking"
```

---

### Task 8: Conversation UI Component

**Files:**
- Create: `web/src/components/conversation-ui.tsx`
- Create: `web/src/components/timer.tsx`

- [ ] **Step 1: Create timer component**

Create `web/src/components/timer.tsx`:
```tsx
"use client";

import { useState, useEffect, useRef } from "react";

interface TimerProps {
  durationSeconds: number;
  onTimeUp: () => void;
  running: boolean;
}

export default function Timer({ durationSeconds, onTimeUp, running }: TimerProps) {
  const [remaining, setRemaining] = useState(durationSeconds);
  const intervalRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    if (!running) return;

    intervalRef.current = setInterval(() => {
      setRemaining((prev) => {
        if (prev <= 1) {
          clearInterval(intervalRef.current!);
          onTimeUp();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [running, onTimeUp]);

  const mins = Math.floor(remaining / 60);
  const secs = remaining % 60;
  const pct = (remaining / durationSeconds) * 100;
  const isLow = remaining < 60;

  return (
    <div className="flex items-center gap-3">
      <div className="w-24 h-1.5 bg-gray-800 rounded-full overflow-hidden">
        <div
          className={`h-full rounded-full transition-all duration-1000 ${isLow ? "bg-red-500" : "bg-indigo-500"}`}
          style={{ width: `${pct}%` }}
        />
      </div>
      <span className={`text-sm font-mono ${isLow ? "text-red-400" : "text-gray-400"}`}>
        {mins}:{secs.toString().padStart(2, "0")}
      </span>
    </div>
  );
}
```

- [ ] **Step 2: Create conversation UI component**

Create `web/src/components/conversation-ui.tsx`:
```tsx
"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import Timer from "./timer";

interface Message {
  role: "user" | "assistant";
  content: string;
}

interface ConversationUIProps {
  sessionId: string;
  voice?: string;
  onSessionEnd: () => void;
  isOnboarding?: boolean;
}

export default function ConversationUI({ sessionId, voice = "af_sarah", onSessionEnd, isOnboarding }: ConversationUIProps) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [state, setState] = useState<"idle" | "listening" | "recording" | "processing" | "speaking">("idle");
  const [timerRunning, setTimerRunning] = useState(false);
  const chatRef = useRef<HTMLDivElement>(null);

  // Audio refs
  const streamRef = useRef<MediaStream | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const playCtxRef = useRef<AudioContext | null>(null);
  const activeRef = useRef(false);
  const processingRef = useRef(false);
  const vadRef = useRef<NodeJS.Timeout | null>(null);
  const noiseFloorRef = useRef(0);
  const isSpeakingRef = useRef(false);
  const silenceStartRef = useRef(0);
  const speechStartRef = useRef(0);

  const SILENCE_DURATION = 1500;
  const MIN_SPEECH_DURATION = 400;
  const SPEECH_MARGIN = 3.0;
  const NOISE_SAMPLES = 30;

  function addMessage(role: "user" | "assistant", content: string) {
    setMessages((prev) => [...prev, { role, content }]);
    // Store message in DB
    fetch("/api/session/message", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sessionId, role, content }),
    });
  }

  function getRMS(): number {
    if (!analyserRef.current) return 0;
    const data = new Uint8Array(analyserRef.current.fftSize);
    analyserRef.current.getByteTimeDomainData(data);
    let sum = 0;
    for (let i = 0; i < data.length; i++) {
      const v = (data[i] - 128) / 128;
      sum += v * v;
    }
    return Math.sqrt(sum / data.length) * 100;
  }

  const startRecording = useCallback(() => {
    if (recorderRef.current?.state === "recording") return;
    chunksRef.current = [];
    const recorder = new MediaRecorder(streamRef.current!, { mimeType: "audio/webm;codecs=opus" });
    recorder.ondataavailable = (e) => { if (e.data.size > 0) chunksRef.current.push(e.data); };
    recorder.start(100);
    recorderRef.current = recorder;
  }, []);

  const processAudio = useCallback(async () => {
    if (!recorderRef.current || recorderRef.current.state !== "recording") return;
    processingRef.current = true;
    setState("processing");

    const blob = await new Promise<Blob>((resolve) => {
      recorderRef.current!.onstop = () => resolve(new Blob(chunksRef.current, { type: "audio/webm" }));
      recorderRef.current!.stop();
    });

    try {
      // Transcribe
      const form = new FormData();
      form.append("audio", blob, "recording.webm");
      const trRes = await fetch("/api/ai/transcribe", { method: "POST", body: form });
      const { text } = await trRes.json();

      if (!text?.trim()) {
        processingRef.current = false;
        setState("listening");
        return;
      }

      addMessage("user", text);

      // Chat
      const chatRes = await fetch("/api/ai/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text, session_id: sessionId }),
      });
      const { text: reply } = await chatRes.json();
      addMessage("assistant", reply);

      // TTS stream
      setState("speaking");
      if (!playCtxRef.current) playCtxRef.current = new AudioContext();
      if (playCtxRef.current.state === "suspended") await playCtxRef.current.resume();

      const ttsRes = await fetch("/api/ai/speak", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: reply, voice }),
      });

      const reader = ttsRes.body!.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      const audioQueue: AudioBuffer[] = [];
      let isPlaying = false;
      let totalChunks = 0;
      let playedChunks = 0;

      const playNext = async (): Promise<void> => {
        if (audioQueue.length === 0) { isPlaying = false; return; }
        isPlaying = true;
        const buf = audioQueue.shift()!;
        const src = playCtxRef.current!.createBufferSource();
        src.buffer = buf;
        src.connect(playCtxRef.current!.destination);
        await new Promise<void>((resolve) => {
          src.onended = () => { playedChunks++; resolve(); };
          src.start(0);
        });
        await playNext();
      };

      const processChunk = async (data: string) => {
        if (data === "[DONE]") return;
        try {
          const parsed = JSON.parse(data);
          totalChunks = parsed.total;
          const binary = atob(parsed.audio);
          const bytes = new Uint8Array(binary.length);
          for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
          const audioBuf = await playCtxRef.current!.decodeAudioData(bytes.buffer.slice(0));
          audioQueue.push(audioBuf);
          if (!isPlaying) await playNext();
        } catch (e) { console.error("Chunk error:", e); }
      };

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop()!;
        for (const line of lines) {
          if (line.startsWith("data: ")) await processChunk(line.slice(6));
        }
      }
      if (buffer.startsWith("data: ")) await processChunk(buffer.slice(6));
      // Wait for playback to finish
      while (isPlaying || playedChunks < totalChunks) {
        await new Promise((r) => setTimeout(r, 100));
      }
    } catch (err) {
      console.error("Pipeline error:", err);
    }

    processingRef.current = false;
    if (activeRef.current) {
      setState("listening");
      startVAD();
    }
  }, [sessionId, voice]);

  function startVAD() {
    if (vadRef.current) clearInterval(vadRef.current);
    vadRef.current = setInterval(() => {
      if (processingRef.current || !activeRef.current) return;
      const rms = getRMS();
      const now = Date.now();
      const speechThreshold = Math.max(noiseFloorRef.current * SPEECH_MARGIN, noiseFloorRef.current + 2);
      const silenceThreshold = Math.max(noiseFloorRef.current * 1.5, noiseFloorRef.current + 1);

      if (!isSpeakingRef.current && rms > speechThreshold) {
        isSpeakingRef.current = true;
        speechStartRef.current = now;
        silenceStartRef.current = 0;
        startRecording();
        setState("recording");
      } else if (isSpeakingRef.current && rms < silenceThreshold) {
        if (!silenceStartRef.current) silenceStartRef.current = now;
        if (now - silenceStartRef.current >= SILENCE_DURATION && now - speechStartRef.current >= MIN_SPEECH_DURATION) {
          isSpeakingRef.current = false;
          silenceStartRef.current = 0;
          if (vadRef.current) clearInterval(vadRef.current);
          processAudio();
        }
      } else if (isSpeakingRef.current && rms >= silenceThreshold) {
        silenceStartRef.current = 0;
      }
    }, 50);
  }

  async function startConversation() {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    streamRef.current = stream;

    const ctx = new AudioContext();
    const analyser = ctx.createAnalyser();
    analyser.fftSize = 2048;
    ctx.createMediaStreamSource(stream).connect(analyser);
    audioCtxRef.current = ctx;
    analyserRef.current = analyser;

    // Calibrate noise floor
    setState("processing");
    const samples: number[] = [];
    await new Promise<void>((resolve) => {
      const cal = setInterval(() => {
        samples.push(getRMS());
        if (samples.length >= NOISE_SAMPLES) {
          clearInterval(cal);
          const sorted = [...samples].sort((a, b) => a - b);
          noiseFloorRef.current = sorted[Math.floor(sorted.length * 0.8)];
          resolve();
        }
      }, 50);
    });

    activeRef.current = true;
    setTimerRunning(true);
    setState("listening");
    startVAD();
  }

  function endConversation() {
    activeRef.current = false;
    processingRef.current = false;
    setTimerRunning(false);
    if (vadRef.current) clearInterval(vadRef.current);
    if (streamRef.current) streamRef.current.getTracks().forEach((t) => t.stop());
    if (audioCtxRef.current) audioCtxRef.current.close();
    setState("idle");
    onSessionEnd();
  }

  useEffect(() => {
    if (chatRef.current) chatRef.current.scrollTop = chatRef.current.scrollHeight;
  }, [messages]);

  useEffect(() => {
    return () => {
      activeRef.current = false;
      if (vadRef.current) clearInterval(vadRef.current);
      if (streamRef.current) streamRef.current.getTracks().forEach((t) => t.stop());
    };
  }, []);

  const stateLabels: Record<string, { text: string; color: string }> = {
    idle: { text: "Ready", color: "text-gray-500" },
    listening: { text: "Listening...", color: "text-green-400" },
    recording: { text: "Hearing you...", color: "text-orange-400" },
    processing: { text: "Thinking...", color: "text-indigo-400" },
    speaking: { text: "Speaking...", color: "text-blue-400" },
  };

  return (
    <div className="flex flex-col h-full">
      {/* Header with timer */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-800">
        <span className={`text-sm font-medium ${stateLabels[state].color}`}>
          {stateLabels[state].text}
        </span>
        {timerRunning && (
          <Timer durationSeconds={isOnboarding ? 300 : 300} onTimeUp={endConversation} running={timerRunning} />
        )}
      </div>

      {/* Messages */}
      <div ref={chatRef} className="flex-1 overflow-y-auto p-4 space-y-3">
        {messages.map((m, i) => (
          <div key={i} className={`max-w-[80%] px-4 py-3 rounded-2xl text-sm leading-relaxed ${
            m.role === "user"
              ? "ml-auto bg-indigo-600 text-white rounded-br-sm"
              : "bg-gray-800 text-gray-100 rounded-bl-sm"
          }`}>
            {m.content}
          </div>
        ))}
      </div>

      {/* Controls */}
      <div className="p-4 border-t border-gray-800 flex justify-center">
        {state === "idle" ? (
          <button
            onClick={startConversation}
            className="px-8 py-3 rounded-full bg-indigo-600 hover:bg-indigo-700 font-semibold transition"
          >
            Start Talking
          </button>
        ) : (
          <button
            onClick={endConversation}
            className="px-8 py-3 rounded-full border border-gray-600 hover:border-gray-400 text-gray-300 font-semibold transition"
          >
            End Session
          </button>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Commit**

```bash
cd /Users/vishalkumar/Downloads/speakrise
git add web/src/components/
git commit -m "feat: add conversation UI and timer components"
```

---

### Task 9: Dashboard Page

**Files:**
- Create: `web/src/app/dashboard/page.tsx`
- Create: `web/src/components/progress-bar.tsx`
- Create: `web/src/components/nav.tsx`

- [ ] **Step 1: Create progress bar component**

Create `web/src/components/progress-bar.tsx`:
```tsx
interface ProgressBarProps {
  label: string;
  score: number;
  max?: number;
}

export default function ProgressBar({ label, score, max = 100 }: ProgressBarProps) {
  const pct = Math.min((score / max) * 100, 100);
  return (
    <div className="space-y-1">
      <div className="flex justify-between text-sm">
        <span className="text-gray-300 capitalize">{label.replace(/_/g, " ")}</span>
        <span className="text-gray-500">{score}%</span>
      </div>
      <div className="h-2 bg-gray-800 rounded-full overflow-hidden">
        <div className="h-full bg-indigo-500 rounded-full transition-all" style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Create bottom nav component**

Create `web/src/components/nav.tsx`:
```tsx
"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const links = [
  { href: "/dashboard", label: "Home", icon: "⌂" },
  { href: "/history", label: "History", icon: "☰" },
];

export default function Nav() {
  const pathname = usePathname();

  return (
    <nav className="fixed bottom-0 left-0 right-0 bg-gray-950 border-t border-gray-800 flex justify-around py-2 px-4 z-50">
      {links.map((l) => (
        <Link
          key={l.href}
          href={l.href}
          className={`flex flex-col items-center gap-0.5 text-xs py-1 px-3 ${
            pathname === l.href ? "text-indigo-400" : "text-gray-500"
          }`}
        >
          <span className="text-lg">{l.icon}</span>
          <span>{l.label}</span>
        </Link>
      ))}
    </nav>
  );
}
```

- [ ] **Step 3: Create dashboard page**

Create `web/src/app/dashboard/page.tsx`:
```tsx
import { redirect } from "next/navigation";
import { getSession } from "@/lib/session";
import { db } from "@/lib/db";
import Link from "next/link";
import ProgressBar from "@/components/progress-bar";
import Nav from "@/components/nav";

const LEVEL_NAMES = ["", "Learning", "Speaking", "Communicating", "Persuading", "Inspiring"];

export default async function DashboardPage() {
  const session = await getSession();
  if (!session.userId) redirect("/login");

  const userResult = await db.execute({
    sql: "SELECT * FROM users WHERE id = ?",
    args: [session.userId],
  });
  if (userResult.rows.length === 0) redirect("/login");
  const user = userResult.rows[0];

  if (!user.onboarding_complete) redirect("/onboarding");

  // Get progress
  const progressResult = await db.execute({
    sql: "SELECT skill, score FROM progress WHERE user_id = ? ORDER BY skill",
    args: [session.userId],
  });

  // Get today's sessions
  const todayResult = await db.execute({
    sql: `SELECT id FROM sessions WHERE user_id = ? AND session_type = 'daily'
          AND date(started_at) = date('now') AND ended_at IS NOT NULL`,
    args: [session.userId],
  });
  const completedToday = todayResult.rows.length > 0;

  // Recent sessions
  const recentResult = await db.execute({
    sql: `SELECT s.id, s.started_at, s.duration_seconds, a.overall_level
          FROM sessions s LEFT JOIN assessments a ON a.session_id = s.id
          WHERE s.user_id = ? AND s.ended_at IS NOT NULL
          ORDER BY s.started_at DESC LIMIT 5`,
    args: [session.userId],
  });

  const level = user.current_level as number;

  return (
    <div className="min-h-screen pb-20">
      {/* Header */}
      <header className="px-6 pt-6 pb-4">
        <h1 className="text-2xl font-bold">
          Speak<span className="text-indigo-500">Rise</span>
        </h1>
        <p className="text-gray-400 text-sm mt-1">{user.email as string}</p>
      </header>

      {/* Level card */}
      <div className="mx-6 p-5 bg-gray-900 rounded-2xl border border-gray-800">
        <div className="flex items-center justify-between mb-3">
          <div>
            <p className="text-gray-400 text-xs uppercase tracking-wide">Current Level</p>
            <p className="text-2xl font-bold mt-1">
              L{level} — {LEVEL_NAMES[level]}
            </p>
          </div>
          <div className="w-14 h-14 rounded-full bg-indigo-600/20 flex items-center justify-center text-2xl font-bold text-indigo-400">
            {level}
          </div>
        </div>
      </div>

      {/* Start session */}
      <div className="mx-6 mt-4">
        {completedToday ? (
          <div className="p-4 bg-green-900/20 border border-green-800 rounded-xl text-center">
            <p className="text-green-400 font-medium">Today's session complete</p>
            <Link href="/session" className="text-sm text-indigo-400 mt-1 inline-block">
              Practice more
            </Link>
          </div>
        ) : (
          <Link
            href="/session"
            className="block w-full py-4 bg-indigo-600 hover:bg-indigo-700 rounded-xl text-center font-semibold text-lg transition"
          >
            Start Today's Session
          </Link>
        )}
      </div>

      {/* Skills */}
      {progressResult.rows.length > 0 && (
        <div className="mx-6 mt-6">
          <h2 className="text-lg font-semibold mb-3">Skills</h2>
          <div className="space-y-3">
            {progressResult.rows.map((r) => (
              <ProgressBar key={r.skill as string} label={r.skill as string} score={r.score as number} />
            ))}
          </div>
        </div>
      )}

      {/* Recent sessions */}
      {recentResult.rows.length > 0 && (
        <div className="mx-6 mt-6">
          <h2 className="text-lg font-semibold mb-3">Recent Sessions</h2>
          <div className="space-y-2">
            {recentResult.rows.map((r) => (
              <Link
                key={r.id as string}
                href={`/report/${r.id}`}
                className="block p-3 bg-gray-900 rounded-xl border border-gray-800 hover:border-gray-700 transition"
              >
                <div className="flex justify-between items-center">
                  <span className="text-sm text-gray-300">
                    {new Date(r.started_at as string).toLocaleDateString()}
                  </span>
                  <span className="text-xs text-gray-500">
                    {Math.round((r.duration_seconds as number) / 60)}m · L{r.overall_level}
                  </span>
                </div>
              </Link>
            ))}
          </div>
        </div>
      )}

      <Nav />
    </div>
  );
}
```

- [ ] **Step 4: Commit**

```bash
cd /Users/vishalkumar/Downloads/speakrise
git add web/src/app/dashboard/ web/src/components/progress-bar.tsx web/src/components/nav.tsx
git commit -m "feat: add dashboard page with level, skills, and recent sessions"
```

---

### Task 10: Session Page

**Files:**
- Create: `web/src/app/session/page.tsx`

- [ ] **Step 1: Create session page**

Create `web/src/app/session/page.tsx`:
```tsx
"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import ConversationUI from "@/components/conversation-ui";

export default function SessionPage() {
  const router = useRouter();
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [assessing, setAssessing] = useState(false);

  useEffect(() => {
    // Create session on mount
    fetch("/api/session/start", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sessionType: "daily" }),
    })
      .then((r) => r.json())
      .then((data) => setSessionId(data.sessionId));
  }, []);

  async function handleSessionEnd() {
    if (!sessionId) return;
    setAssessing(true);

    // End session
    await fetch("/api/session/end", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sessionId }),
    });

    // Run assessment
    const res = await fetch("/api/assess", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sessionId }),
    });
    const data = await res.json();

    router.push(`/report/${sessionId}`);
  }

  if (!sessionId) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p className="text-gray-400">Preparing session...</p>
      </div>
    );
  }

  if (assessing) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-4">
        <div className="w-8 h-8 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
        <p className="text-gray-400">Generating your report...</p>
      </div>
    );
  }

  return (
    <div className="h-screen flex flex-col">
      <ConversationUI sessionId={sessionId} onSessionEnd={handleSessionEnd} />
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
cd /Users/vishalkumar/Downloads/speakrise
git add web/src/app/session/
git commit -m "feat: add session page with conversation UI and assessment flow"
```

---

### Task 11: Report Page

**Files:**
- Create: `web/src/app/report/[sessionId]/page.tsx`

- [ ] **Step 1: Create report page**

Create `web/src/app/report/[sessionId]/page.tsx`:
```tsx
import { redirect } from "next/navigation";
import { getSession } from "@/lib/session";
import { db } from "@/lib/db";
import Link from "next/link";
import ProgressBar from "@/components/progress-bar";
import Nav from "@/components/nav";

const LEVEL_NAMES = ["", "Learning", "Speaking", "Communicating", "Persuading", "Inspiring"];

export default async function ReportPage({ params }: { params: Promise<{ sessionId: string }> }) {
  const { sessionId } = await params;
  const session = await getSession();
  if (!session.userId) redirect("/login");

  // Fetch assessment
  const assessResult = await db.execute({
    sql: "SELECT * FROM assessments WHERE session_id = ? AND user_id = ?",
    args: [sessionId, session.userId],
  });

  if (assessResult.rows.length === 0) redirect("/dashboard");

  const assessment = assessResult.rows[0];
  const feedback = JSON.parse(assessment.feedback_json as string);
  const level = assessment.overall_level as number;

  // Fetch session messages
  const messagesResult = await db.execute({
    sql: "SELECT role, content FROM messages WHERE session_id = ? ORDER BY created_at",
    args: [sessionId],
  });

  return (
    <div className="min-h-screen pb-20">
      <header className="px-6 pt-6 pb-4">
        <Link href="/dashboard" className="text-gray-400 text-sm hover:text-white transition">
          &larr; Back to dashboard
        </Link>
        <h1 className="text-xl font-bold mt-2">Session Report</h1>
      </header>

      {/* Level result */}
      <div className="mx-6 p-5 bg-gray-900 rounded-2xl border border-gray-800">
        <p className="text-gray-400 text-xs uppercase tracking-wide">Your Level</p>
        <p className="text-3xl font-bold mt-1">
          L{level} — {LEVEL_NAMES[level]}
        </p>
      </div>

      {/* What went well */}
      {feedback.feedback?.went_well?.length > 0 && (
        <div className="mx-6 mt-4 p-4 bg-green-900/20 border border-green-800/50 rounded-xl">
          <h2 className="text-green-400 font-semibold text-sm mb-2">What went well</h2>
          <ul className="space-y-1">
            {feedback.feedback.went_well.map((item: string, i: number) => (
              <li key={i} className="text-sm text-gray-300">{item}</li>
            ))}
          </ul>
        </div>
      )}

      {/* What to improve */}
      {feedback.feedback?.improve?.length > 0 && (
        <div className="mx-6 mt-3 p-4 bg-orange-900/20 border border-orange-800/50 rounded-xl">
          <h2 className="text-orange-400 font-semibold text-sm mb-2">Areas to improve</h2>
          <ul className="space-y-1">
            {feedback.feedback.improve.map((item: string, i: number) => (
              <li key={i} className="text-sm text-gray-300">{item}</li>
            ))}
          </ul>
        </div>
      )}

      {/* Skills */}
      {feedback.skills && Object.keys(feedback.skills).length > 0 && (
        <div className="mx-6 mt-6">
          <h2 className="text-lg font-semibold mb-3">Skill Scores</h2>
          <div className="space-y-3">
            {Object.entries(feedback.skills).map(([skill, score]) => (
              <ProgressBar key={skill} label={skill} score={score as number} />
            ))}
          </div>
        </div>
      )}

      {/* Exercises */}
      {feedback.exercises?.length > 0 && (
        <div className="mx-6 mt-6">
          <h2 className="text-lg font-semibold mb-3">Practice Exercises</h2>
          <div className="space-y-3">
            {feedback.exercises.map((ex: any, i: number) => (
              <div key={i} className="p-4 bg-gray-900 rounded-xl border border-gray-800">
                {ex.type === "repeat_after_me" ? (
                  <>
                    <p className="text-xs text-indigo-400 uppercase tracking-wide mb-1">Repeat after me</p>
                    <p className="text-white font-medium">"{ex.sentence}"</p>
                    <p className="text-sm text-gray-400 mt-1">{ex.explanation}</p>
                  </>
                ) : (
                  <>
                    <p className="text-xs text-indigo-400 uppercase tracking-wide mb-1">Vocabulary</p>
                    <p className="text-white font-medium">{ex.word}</p>
                    <p className="text-sm text-gray-400">{ex.definition}</p>
                    <p className="text-sm text-gray-500 mt-1 italic">"{ex.example}"</p>
                  </>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Transcript */}
      <div className="mx-6 mt-6">
        <h2 className="text-lg font-semibold mb-3">Conversation Transcript</h2>
        <div className="space-y-2">
          {messagesResult.rows.map((m, i) => (
            <div key={i} className={`text-sm p-3 rounded-xl ${
              m.role === "user" ? "bg-indigo-900/30 text-indigo-200" : "bg-gray-900 text-gray-300"
            }`}>
              <span className="text-xs text-gray-500 uppercase">{m.role as string}: </span>
              {m.content as string}
            </div>
          ))}
        </div>
      </div>

      <div className="mx-6 mt-6 mb-6">
        <Link
          href="/dashboard"
          className="block w-full py-3 bg-indigo-600 hover:bg-indigo-700 rounded-xl text-center font-semibold transition"
        >
          Back to Dashboard
        </Link>
      </div>

      <Nav />
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
cd /Users/vishalkumar/Downloads/speakrise
git add web/src/app/report/
git commit -m "feat: add post-session report page with feedback, skills, and exercises"
```

---

### Task 12: Onboarding Page

**Files:**
- Create: `web/src/app/onboarding/page.tsx`

- [ ] **Step 1: Create onboarding page**

Create `web/src/app/onboarding/page.tsx`:
```tsx
"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import ConversationUI from "@/components/conversation-ui";

export default function OnboardingPage() {
  const router = useRouter();
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [assessing, setAssessing] = useState(false);

  useEffect(() => {
    fetch("/api/session/start", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sessionType: "baseline" }),
    })
      .then((r) => r.json())
      .then((data) => setSessionId(data.sessionId));
  }, []);

  async function handleSessionEnd() {
    if (!sessionId) return;
    setAssessing(true);

    await fetch("/api/session/end", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sessionId }),
    });

    await fetch("/api/assess", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sessionId }),
    });

    // Mark onboarding complete
    await fetch("/api/auth/complete-onboarding", { method: "POST" });

    router.push("/dashboard");
  }

  if (!sessionId) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center px-6 text-center">
        <h1 className="text-2xl font-bold mb-2">
          Welcome to Speak<span className="text-indigo-500">Rise</span>
        </h1>
        <p className="text-gray-400">Preparing your baseline assessment...</p>
      </div>
    );
  }

  if (assessing) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-4">
        <div className="w-8 h-8 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
        <p className="text-gray-400">Analyzing your speaking level...</p>
      </div>
    );
  }

  return (
    <div className="h-screen flex flex-col">
      <div className="px-4 py-3 bg-gray-900 border-b border-gray-800">
        <h2 className="font-semibold">Baseline Assessment</h2>
        <p className="text-xs text-gray-400">Have a short conversation so we can understand your level</p>
      </div>
      <div className="flex-1">
        <ConversationUI sessionId={sessionId} onSessionEnd={handleSessionEnd} isOnboarding />
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Create complete-onboarding API route**

Create `web/src/app/api/auth/complete-onboarding/route.ts`:
```typescript
import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { db } from "@/lib/db";

export async function POST() {
  const session = await getSession();
  if (!session.userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  await db.execute({
    sql: "UPDATE users SET onboarding_complete = 1 WHERE id = ?",
    args: [session.userId],
  });

  return NextResponse.json({ ok: true });
}
```

- [ ] **Step 3: Commit**

```bash
cd /Users/vishalkumar/Downloads/speakrise
git add web/src/app/onboarding/ web/src/app/api/auth/complete-onboarding/
git commit -m "feat: add onboarding page with baseline assessment"
```

---

### Task 13: History Page

**Files:**
- Create: `web/src/app/history/page.tsx`

- [ ] **Step 1: Create history page**

Create `web/src/app/history/page.tsx`:
```tsx
import { redirect } from "next/navigation";
import { getSession } from "@/lib/session";
import { db } from "@/lib/db";
import Link from "next/link";
import Nav from "@/components/nav";

const LEVEL_NAMES = ["", "Learning", "Speaking", "Communicating", "Persuading", "Inspiring"];

export default async function HistoryPage() {
  const session = await getSession();
  if (!session.userId) redirect("/login");

  const sessionsResult = await db.execute({
    sql: `SELECT s.id, s.started_at, s.duration_seconds, s.session_type, a.overall_level
          FROM sessions s LEFT JOIN assessments a ON a.session_id = s.id
          WHERE s.user_id = ? AND s.ended_at IS NOT NULL
          ORDER BY s.started_at DESC LIMIT 50`,
    args: [session.userId],
  });

  return (
    <div className="min-h-screen pb-20">
      <header className="px-6 pt-6 pb-4">
        <h1 className="text-xl font-bold">Session History</h1>
      </header>

      <div className="px-6 space-y-2">
        {sessionsResult.rows.length === 0 ? (
          <p className="text-gray-500 text-center py-8">No sessions yet</p>
        ) : (
          sessionsResult.rows.map((r) => (
            <Link
              key={r.id as string}
              href={`/report/${r.id}`}
              className="block p-4 bg-gray-900 rounded-xl border border-gray-800 hover:border-gray-700 transition"
            >
              <div className="flex justify-between items-center">
                <div>
                  <p className="text-sm font-medium text-gray-200">
                    {new Date(r.started_at as string).toLocaleDateString("en-US", {
                      weekday: "short", month: "short", day: "numeric",
                    })}
                  </p>
                  <p className="text-xs text-gray-500 mt-0.5">
                    {r.session_type === "baseline" ? "Baseline Assessment" : "Daily Practice"}
                    {" · "}
                    {Math.round((r.duration_seconds as number) / 60)} min
                  </p>
                </div>
                {r.overall_level && (
                  <div className="text-right">
                    <p className="text-sm font-semibold text-indigo-400">L{r.overall_level as number}</p>
                    <p className="text-xs text-gray-500">{LEVEL_NAMES[r.overall_level as number]}</p>
                  </div>
                )}
              </div>
            </Link>
          ))
        )}
      </div>

      <Nav />
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
cd /Users/vishalkumar/Downloads/speakrise
git add web/src/app/history/
git commit -m "feat: add session history page"
```

---

### Task 14: Deployment Setup

**Files:**
- Create: `deploy/nginx.conf`
- Create: `deploy/speakrise-web.service`
- Create: `deploy/speakrise-ai.service`
- Create: `deploy/setup.sh`

- [ ] **Step 1: Create nginx config**

Create `deploy/nginx.conf`:
```nginx
server {
    listen 80;
    server_name speakrise.quantana.top;
    return 301 https://$host$request_uri;
}

server {
    listen 443 ssl http2;
    server_name speakrise.quantana.top;

    ssl_certificate /etc/letsencrypt/live/speakrise.quantana.top/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/speakrise.quantana.top/privkey.pem;

    client_max_body_size 10M;

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_buffering off;
        proxy_cache off;
    }
}
```

- [ ] **Step 2: Create systemd service for Next.js**

Create `deploy/speakrise-web.service`:
```ini
[Unit]
Description=SpeakRise Web (Next.js)
After=network.target

[Service]
Type=simple
User=root
WorkingDirectory=/opt/speakrise/web
ExecStart=/usr/bin/node /opt/speakrise/web/node_modules/.bin/next start -p 3000
Restart=on-failure
RestartSec=5
Environment=NODE_ENV=production
EnvironmentFile=/opt/speakrise/web/.env.local

[Install]
WantedBy=multi-user.target
```

- [ ] **Step 3: Create systemd service for FastAPI**

Create `deploy/speakrise-ai.service`:
```ini
[Unit]
Description=SpeakRise AI Service (FastAPI)
After=network.target

[Service]
Type=simple
User=root
WorkingDirectory=/opt/speakrise/ai-service
ExecStart=/opt/speakrise/venv/bin/uvicorn app:app --host 127.0.0.1 --port 8770
Restart=on-failure
RestartSec=5
EnvironmentFile=/opt/speakrise/ai-service/.env

[Install]
WantedBy=multi-user.target
```

- [ ] **Step 4: Create VPS setup script**

Create `deploy/setup.sh`:
```bash
#!/bin/bash
set -e

echo "=== SpeakRise VPS Setup ==="

# System packages
apt update && apt upgrade -y
apt install -y nginx certbot python3-certbot-nginx python3-venv python3-pip git curl

# Install Node.js 20
curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
apt install -y nodejs

# Clone repo
mkdir -p /opt/speakrise
cd /opt/speakrise
if [ ! -d .git ]; then
    git clone https://github.com/vishalquantana/SpeakRise.git .
else
    git pull
fi

# Python venv for AI service
python3 -m venv venv
source venv/bin/activate
pip install -r ai-service/requirements.txt

# Download model files if not present
if [ ! -f kokoro-v1.0.onnx ]; then
    echo "Downloading Kokoro model..."
    curl -L -o kokoro-v1.0.onnx https://github.com/nazdridoy/kokoro-tts/releases/download/v1.0.0/kokoro-v1.0.onnx
    curl -L -o voices-v1.0.bin https://github.com/nazdridoy/kokoro-tts/releases/download/v1.0.0/voices-v1.0.bin
fi

# Build Next.js
cd web
npm ci
npm run build
cd ..

# Install systemd services
cp deploy/speakrise-web.service /etc/systemd/system/
cp deploy/speakrise-ai.service /etc/systemd/system/
systemctl daemon-reload
systemctl enable speakrise-web speakrise-ai
systemctl restart speakrise-ai
systemctl restart speakrise-web

# Nginx
cp deploy/nginx.conf /etc/nginx/sites-available/speakrise
ln -sf /etc/nginx/sites-available/speakrise /etc/nginx/sites-enabled/
rm -f /etc/nginx/sites-enabled/default

# SSL (skip if already configured)
if [ ! -d /etc/letsencrypt/live/speakrise.quantana.top ]; then
    certbot --nginx -d speakrise.quantana.top --non-interactive --agree-tos -m admin@quantana.top
fi

nginx -t && systemctl restart nginx

echo "=== Setup complete ==="
echo "Visit https://speakrise.quantana.top"
```

- [ ] **Step 5: Make setup script executable and commit**

```bash
chmod +x deploy/setup.sh
cd /Users/vishalkumar/Downloads/speakrise
git add deploy/
git commit -m "feat: add deployment configs (nginx, systemd, setup script)"
```

---

### Task 15: Integration Test — Full Flow Locally

- [ ] **Step 1: Run DB migration**

```bash
cd /Users/vishalkumar/Downloads/speakrise/web
npm run dev &
sleep 3
curl -X POST http://localhost:3000/api/setup-db
```

Expected: `{"ok":true}`

- [ ] **Step 2: Start AI service**

```bash
cd /Users/vishalkumar/Downloads/speakrise
source venv/bin/activate
cd ai-service
python app.py &
```

- [ ] **Step 3: Test full flow in browser**

Open http://localhost:3000 — should redirect to /login.
Enter email, receive OTP, verify, land on /onboarding.
Have a short conversation, end session, see report.
Navigate to dashboard, see level and skills.

- [ ] **Step 4: Fix any issues found during integration**

- [ ] **Step 5: Final commit**

```bash
cd /Users/vishalkumar/Downloads/speakrise
git add -A
git commit -m "fix: integration fixes from end-to-end testing"
git push origin main
```

---

### Task 16: Deploy to VPS

- [ ] **Step 1: Copy env files to VPS**

```bash
sshpass -p '$VPS_ROOT_PASSWORD' scp /Users/vishalkumar/Downloads/speakrise/ai-service/.env root@speakrise.quantana.top:/tmp/ai-service.env
sshpass -p '$VPS_ROOT_PASSWORD' scp /Users/vishalkumar/Downloads/speakrise/web/.env.local root@speakrise.quantana.top:/tmp/web.env.local
```

- [ ] **Step 2: Run setup script on VPS**

```bash
sshpass -p '$VPS_ROOT_PASSWORD' ssh root@speakrise.quantana.top "cd /opt/speakrise && bash deploy/setup.sh"
```

- [ ] **Step 3: Copy env files into place**

```bash
sshpass -p '$VPS_ROOT_PASSWORD' ssh root@speakrise.quantana.top "cp /tmp/ai-service.env /opt/speakrise/ai-service/.env && cp /tmp/web.env.local /opt/speakrise/web/.env.local && systemctl restart speakrise-ai speakrise-web"
```

- [ ] **Step 4: Run DB migration on production**

```bash
curl -X POST https://speakrise.quantana.top/api/setup-db
```

Expected: `{"ok":true}`

- [ ] **Step 5: Verify production**

Open https://speakrise.quantana.top on your phone — should see login page. Test full flow.

- [ ] **Step 6: Commit any deploy fixes**

```bash
cd /Users/vishalkumar/Downloads/speakrise
git add -A
git commit -m "fix: production deployment adjustments"
git push origin main
```
