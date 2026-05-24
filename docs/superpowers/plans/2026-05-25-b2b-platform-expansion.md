# B2B Platform Expansion Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Transform SpeakRise from a single-user English practice app into a multi-tenant B2B platform with org management, gamification, admin dashboards, and a warm UI redesign.

**Architecture:** Extend the existing Next.js + FastAPI stack. Add org/team tables to Turso, build admin routes alongside employee routes. Keep the AI service unchanged — all new logic lives in the Next.js layer. UI redesign applied globally via Tailwind theme update.

**Tech Stack:** Next.js 16 (App Router), Turso/libSQL, Tailwind CSS 4, iron-session, SendGrid, existing FastAPI AI service.

---

## File Structure

### New Files

```
web/src/lib/gamification.ts          — points calculation, streak logic, badge awarding
web/src/lib/org.ts                   — org CRUD, invite logic, member management
web/src/lib/tracks.ts                — track config, scenario templates
web/src/lib/work-insights.ts         — extract work summaries, generate weekly digests

web/src/app/admin/page.tsx           — admin dashboard (3 tabs)
web/src/app/admin/team/page.tsx      — team management (invite, assign tracks)
web/src/app/admin/setup/page.tsx     — org creation flow (first-time admin)
web/src/app/invite/page.tsx          — invite acceptance page

web/src/app/api/admin/invite/route.ts        — send invite emails
web/src/app/api/admin/team/route.ts          — list/manage team members
web/src/app/api/admin/tracks/route.ts        — CRUD tracks
web/src/app/api/admin/insights/route.ts      — work insights data
web/src/app/api/admin/engagement/route.ts    — engagement metrics
web/src/app/api/admin/progress/route.ts      — progress metrics

web/src/components/leaderboard.tsx    — leaderboard widget
web/src/components/streak-badge.tsx   — streak display + badges
web/src/components/admin-nav.tsx      — admin navigation tabs
web/src/components/engagement-tab.tsx — engagement tab content
web/src/components/progress-tab.tsx   — progress tab content
web/src/components/insights-tab.tsx   — work insights tab content
```

### Modified Files

```
web/src/lib/schema.ts                — add new tables (orgs, org_members, tracks, etc.)
web/src/lib/auth.ts                  — add invite acceptance, org association
web/src/lib/session.ts               — add orgId, role to SessionData
web/src/lib/assessment.ts            — add points awarding + work extraction after assessment
web/src/app/globals.css              — warm/earthy theme variables
web/src/app/layout.tsx               — update font, apply warm theme
web/src/app/login/page.tsx           — warm UI redesign
web/src/app/dashboard/page.tsx       — redesign + add streaks/points/leaderboard
web/src/app/session/page.tsx         — use track-configured duration
web/src/app/report/[sessionId]/page.tsx — add points display + TTS readout
web/src/app/onboarding/page.tsx      — warm UI
web/src/app/history/page.tsx         — warm UI
web/src/components/conversation-ui.tsx — configurable timer duration
web/src/components/nav.tsx           — update styling, add admin link for admins
web/src/components/progress-bar.tsx  — warm color scheme
web/src/components/timer.tsx         — accept configurable duration
web/src/app/api/auth/verify-otp/route.ts — handle invite tokens, set org/role
web/src/app/api/session/start/route.ts   — attach track_id, use track duration
```

---

## Task 1: Database Schema Expansion

**Files:**
- Modify: `web/src/lib/schema.ts`
- Modify: `web/src/app/api/setup-db/route.ts`

- [ ] **Step 1: Add new tables to schema.ts**

```typescript
// Add these to the db.batch([...]) array in migrateDatabase():

    {
      sql: `CREATE TABLE IF NOT EXISTS organizations (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        created_by TEXT NOT NULL,
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      )`,
      args: [],
    },
    {
      sql: `CREATE TABLE IF NOT EXISTS org_members (
        id TEXT PRIMARY KEY,
        org_id TEXT NOT NULL,
        user_id TEXT NOT NULL,
        role TEXT NOT NULL DEFAULT 'employee',
        invited_at TEXT NOT NULL DEFAULT (datetime('now')),
        joined_at TEXT,
        invite_token TEXT,
        UNIQUE(org_id, user_id)
      )`,
      args: [],
    },
    {
      sql: `CREATE TABLE IF NOT EXISTS tracks (
        id TEXT PRIMARY KEY,
        org_id TEXT NOT NULL,
        name TEXT NOT NULL,
        duration_seconds INTEGER NOT NULL DEFAULT 300,
        scenarios_json TEXT NOT NULL DEFAULT '[]',
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      )`,
      args: [],
    },
    {
      sql: `CREATE TABLE IF NOT EXISTS user_tracks (
        user_id TEXT NOT NULL,
        track_id TEXT NOT NULL,
        assigned_at TEXT NOT NULL DEFAULT (datetime('now')),
        PRIMARY KEY(user_id, track_id)
      )`,
      args: [],
    },
    {
      sql: `CREATE TABLE IF NOT EXISTS streaks (
        user_id TEXT PRIMARY KEY,
        current_streak INTEGER NOT NULL DEFAULT 0,
        longest_streak INTEGER NOT NULL DEFAULT 0,
        last_session_date TEXT
      )`,
      args: [],
    },
    {
      sql: `CREATE TABLE IF NOT EXISTS points (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        session_id TEXT NOT NULL,
        participation_points INTEGER NOT NULL DEFAULT 0,
        quality_points INTEGER NOT NULL DEFAULT 0,
        streak_bonus INTEGER NOT NULL DEFAULT 0,
        total INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      )`,
      args: [],
    },
    {
      sql: `CREATE TABLE IF NOT EXISTS badges (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        badge_type TEXT NOT NULL,
        earned_at TEXT NOT NULL DEFAULT (datetime('now')),
        UNIQUE(user_id, badge_type)
      )`,
      args: [],
    },
    {
      sql: `CREATE TABLE IF NOT EXISTS work_entries (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        session_id TEXT NOT NULL,
        summary_text TEXT NOT NULL,
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      )`,
      args: [],
    },
    {
      sql: `CREATE TABLE IF NOT EXISTS weekly_digests (
        id TEXT PRIMARY KEY,
        org_id TEXT NOT NULL,
        week_start TEXT NOT NULL,
        digest_json TEXT NOT NULL,
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      )`,
      args: [],
    },
```

- [ ] **Step 2: Add columns to existing tables**

Add after the new table creates in the same batch:

```typescript
    {
      sql: `ALTER TABLE users ADD COLUMN org_id TEXT`,
      args: [],
    },
    {
      sql: `ALTER TABLE sessions ADD COLUMN track_id TEXT`,
      args: [],
    },
    {
      sql: `ALTER TABLE sessions ADD COLUMN target_duration_seconds INTEGER DEFAULT 300`,
      args: [],
    },
```

Note: SQLite ALTER TABLE ADD COLUMN is idempotent-safe if we wrap in try/catch. Wrap these three in individual try/catch blocks since they'll fail if columns already exist:

```typescript
// After the batch, run ALTER TABLEs individually with error handling
const alterStatements = [
  "ALTER TABLE users ADD COLUMN org_id TEXT",
  "ALTER TABLE sessions ADD COLUMN track_id TEXT",
  "ALTER TABLE sessions ADD COLUMN target_duration_seconds INTEGER DEFAULT 300",
];
for (const sql of alterStatements) {
  try {
    await db.execute({ sql, args: [] });
  } catch {
    // Column already exists, safe to ignore
  }
}
```

- [ ] **Step 3: Run migration**

Visit `/api/setup-db` to trigger the migration on the deployed instance.

- [ ] **Step 4: Commit**

```bash
git add web/src/lib/schema.ts
git commit -m "feat: add B2B schema tables (orgs, tracks, gamification)"
```

---

## Task 2: UI Theme Redesign (Warm & Earthy)

**Files:**
- Modify: `web/src/app/globals.css`
- Modify: `web/src/app/layout.tsx`

- [ ] **Step 1: Replace globals.css with warm theme**

```css
@import "tailwindcss";

:root {
  --background: #FAF7F2;
  --foreground: #2D2A26;
  --card: #FFFFFF;
  --card-border: #E8E2D9;
  --muted: #6B6560;
  --accent: #C75B39;
  --accent-light: #F2E8E4;
  --success: #8FAE7E;
  --success-light: #EDF5EA;
  --gold: #D4A853;
  --gold-light: #FBF5E8;
  --indigo: #5B6ABF;
  --indigo-light: #ECEEF8;
}

@theme inline {
  --color-background: var(--background);
  --color-foreground: var(--foreground);
  --font-sans: var(--font-geist-sans);
  --font-mono: var(--font-geist-mono);
}

body {
  background: var(--background);
  color: var(--foreground);
  font-family: 'Plus Jakarta Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, sans-serif;
}
```

- [ ] **Step 2: Update layout.tsx to use Plus Jakarta Sans**

Add Google Font import to layout.tsx head, or use `next/font`:

```typescript
import { Plus_Jakarta_Sans } from "next/font/google";

const jakarta = Plus_Jakarta_Sans({
  subsets: ["latin"],
  variable: "--font-jakarta",
});

// In the html tag:
<html lang="en" className={jakarta.variable}>
<body className="font-[family-name:var(--font-jakarta)]">
```

- [ ] **Step 3: Commit**

```bash
git add web/src/app/globals.css web/src/app/layout.tsx
git commit -m "feat: warm earthy UI theme with Plus Jakarta Sans"
```

---

## Task 3: Redesign Login Page

**Files:**
- Modify: `web/src/app/login/page.tsx`

- [ ] **Step 1: Update login page with warm styling**

Replace all dark theme classes (`bg-gray-900`, `border-gray-800`, `text-gray-400`, etc.) with warm equivalents:

```typescript
// Key class replacements:
// bg-gray-900 → bg-white border border-[var(--card-border)]
// text-gray-400 → text-[var(--muted)]
// bg-indigo-600 → bg-[var(--accent)] hover:bg-[#B5502F]
// border-gray-800 → border-[var(--card-border)]
// text-white → text-white (buttons stay white text)
// focus:border-indigo-500 → focus:border-[var(--accent)]
// bg-yellow-900/30 → bg-[var(--gold-light)] border-[var(--gold)]
// text-yellow-400 → text-[var(--gold)]

// Container: min-h-screen flex items-center justify-center px-6 bg-[var(--background)]
// Card wrapper: add a bg-white rounded-2xl shadow-sm border border-[var(--card-border)] p-8
```

Full updated LoginForm return:

```tsx
return (
  <div className="w-full max-w-sm bg-white rounded-2xl shadow-sm border border-[var(--card-border)] p-8">
    <h1 className="text-3xl font-bold mb-2 text-[var(--foreground)]">
      Speak<span className="text-[var(--accent)]">Rise</span>
    </h1>
    <p className="text-[var(--muted)] mb-8">Practice English, level up your speaking</p>

    {testMode && (
      <div className="mb-4 p-2 bg-[var(--gold-light)] border border-[var(--gold)] rounded-lg text-[var(--gold)] text-xs text-center">
        Test mode — any email, code 123456
      </div>
    )}

    {step === "email" ? (
      <form onSubmit={handleSendOTP} className="space-y-4">
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="Enter your email"
          required
          className="w-full px-4 py-3 rounded-xl bg-[var(--background)] border border-[var(--card-border)] focus:border-[var(--accent)] focus:outline-none text-[var(--foreground)] placeholder-[var(--muted)]"
        />
        <button
          type="submit"
          disabled={loading}
          className="w-full py-3 rounded-xl bg-[var(--accent)] hover:bg-[#B5502F] disabled:opacity-50 font-semibold text-white transition"
        >
          {loading ? "Sending..." : "Send verification code"}
        </button>
      </form>
    ) : (
      <form onSubmit={handleVerifyOTP} className="space-y-4">
        <p className="text-[var(--muted)] text-sm">Code sent to {email}</p>
        <input
          type="text"
          value={code}
          onChange={(e) => setCode(e.target.value)}
          placeholder="Enter 6-digit code"
          maxLength={6}
          required
          className="w-full px-4 py-3 rounded-xl bg-[var(--background)] border border-[var(--card-border)] focus:border-[var(--accent)] focus:outline-none text-[var(--foreground)] placeholder-[var(--muted)] text-center text-2xl tracking-widest"
        />
        <button
          type="submit"
          disabled={loading}
          className="w-full py-3 rounded-xl bg-[var(--accent)] hover:bg-[#B5502F] disabled:opacity-50 font-semibold text-white transition"
        >
          {loading ? "Verifying..." : "Verify and sign in"}
        </button>
        <button
          type="button"
          onClick={() => { setStep("email"); setCode(testMode ? "123456" : ""); setError(""); }}
          className="w-full py-2 text-[var(--muted)] text-sm hover:text-[var(--foreground)] transition"
        >
          Use a different email
        </button>
      </form>
    )}

    {error && <p className="mt-4 text-red-500 text-sm text-center">{error}</p>}
  </div>
);
```

- [ ] **Step 2: Commit**

```bash
git add web/src/app/login/page.tsx
git commit -m "feat: redesign login page with warm earthy theme"
```

---

## Task 4: Org Management & Invite System

**Files:**
- Create: `web/src/lib/org.ts`
- Modify: `web/src/lib/auth.ts`
- Modify: `web/src/lib/session.ts`
- Create: `web/src/app/admin/setup/page.tsx`
- Create: `web/src/app/invite/page.tsx`
- Create: `web/src/app/api/admin/invite/route.ts`
- Modify: `web/src/app/api/auth/verify-otp/route.ts`

- [ ] **Step 1: Create org.ts**

```typescript
// web/src/lib/org.ts
import { db } from "./db";
import { v4 as uuid } from "uuid";
import sgMail from "@sendgrid/mail";

sgMail.setApiKey(process.env.SENDGRID_API_KEY!);

export async function createOrg(name: string, adminUserId: string): Promise<string> {
  const orgId = uuid();
  await db.execute({
    sql: "INSERT INTO organizations (id, name, created_by) VALUES (?, ?, ?)",
    args: [orgId, name, adminUserId],
  });
  await db.execute({
    sql: "UPDATE users SET org_id = ? WHERE id = ?",
    args: [orgId, adminUserId],
  });
  await db.execute({
    sql: "INSERT INTO org_members (id, org_id, user_id, role, joined_at) VALUES (?, ?, ?, 'admin', datetime('now'))",
    args: [uuid(), orgId, adminUserId],
  });
  return orgId;
}

export async function inviteEmployee(orgId: string, email: string): Promise<void> {
  const token = uuid();
  const normalized = email.toLowerCase();

  // Check if user already exists
  const existing = await db.execute({
    sql: "SELECT id FROM users WHERE email = ?",
    args: [normalized],
  });

  if (existing.rows.length > 0) {
    const userId = existing.rows[0].id as string;
    // Add to org directly
    await db.execute({
      sql: `INSERT INTO org_members (id, org_id, user_id, role, joined_at)
            VALUES (?, ?, ?, 'employee', datetime('now'))
            ON CONFLICT(org_id, user_id) DO NOTHING`,
      args: [uuid(), orgId, userId],
    });
    await db.execute({
      sql: "UPDATE users SET org_id = ? WHERE id = ?",
      args: [orgId, userId],
    });
  } else {
    // Store invite token for when they sign up
    await db.execute({
      sql: "INSERT INTO org_members (id, org_id, user_id, role, invite_token) VALUES (?, ?, ?, 'employee', ?)",
      args: [uuid(), orgId, normalized, token],
    });
  }

  const appUrl = process.env.NODE_ENV === "production"
    ? "https://speakrise.quantana.top"
    : "http://localhost:3000";

  await sgMail.send({
    to: normalized,
    from: process.env.SENDGRID_FROM_EMAIL!,
    subject: "You're invited to SpeakRise",
    html: `<h2>You've been invited to practice English on SpeakRise</h2>
           <p>Your team is using SpeakRise for daily English practice. Click below to join:</p>
           <p><a href="${appUrl}/invite?token=${token}&email=${encodeURIComponent(normalized)}" style="display:inline-block;padding:12px 24px;background:#C75B39;color:white;border-radius:8px;text-decoration:none;font-weight:bold;">Join SpeakRise</a></p>`,
  });
}

export async function getOrgForUser(userId: string): Promise<{ orgId: string; role: string } | null> {
  const result = await db.execute({
    sql: "SELECT org_id, role FROM org_members WHERE user_id = ? LIMIT 1",
    args: [userId],
  });
  if (result.rows.length === 0) return null;
  return { orgId: result.rows[0].org_id as string, role: result.rows[0].role as string };
}

export async function getOrgMembers(orgId: string) {
  const result = await db.execute({
    sql: `SELECT u.id, u.email, u.name, u.current_level, om.role, om.joined_at
          FROM org_members om
          JOIN users u ON u.id = om.user_id
          WHERE om.org_id = ? AND om.joined_at IS NOT NULL
          ORDER BY om.joined_at`,
    args: [orgId],
  });
  return result.rows;
}
```

- [ ] **Step 2: Update session.ts to include org context**

```typescript
// web/src/lib/session.ts
import { getIronSession, IronSession } from "iron-session";
import { cookies } from "next/headers";

export interface SessionData {
  userId?: string;
  email?: string;
  orgId?: string;
  role?: string; // 'admin' | 'employee'
}

const sessionOptions = {
  password: process.env.SESSION_SECRET!,
  cookieName: "speakrise_session",
  cookieOptions: {
    secure: process.env.NODE_ENV === "production",
    httpOnly: true,
    sameSite: "lax" as const,
    maxAge: 60 * 60 * 24 * 30,
  },
};

export async function getSession(): Promise<IronSession<SessionData>> {
  const cookieStore = await cookies();
  return getIronSession<SessionData>(cookieStore, sessionOptions);
}
```

- [ ] **Step 3: Update verify-otp route to handle invite flow**

In `web/src/app/api/auth/verify-otp/route.ts`, after `findOrCreateUser`, check for pending invite:

```typescript
import { NextRequest, NextResponse } from "next/server";
import { verifyOTP, findOrCreateUser } from "@/lib/auth";
import { getSession } from "@/lib/session";
import { db } from "@/lib/db";
import { v4 as uuid } from "uuid";

export async function POST(req: NextRequest) {
  const { email, code, testMode, inviteToken } = await req.json();

  if (testMode) {
    if (code !== "123456") {
      return NextResponse.json({ error: "Invalid code" }, { status: 401 });
    }
  } else {
    const valid = await verifyOTP(email, code);
    if (!valid) {
      return NextResponse.json({ error: "Invalid or expired code" }, { status: 401 });
    }
  }

  const user = await findOrCreateUser(email);
  const session = await getSession();
  session.userId = user.id;
  session.email = email;

  // Handle invite token — associate user with org
  if (inviteToken) {
    const invite = await db.execute({
      sql: "SELECT org_id FROM org_members WHERE invite_token = ? AND user_id = ?",
      args: [inviteToken, email.toLowerCase()],
    });
    if (invite.rows.length > 0) {
      const orgId = invite.rows[0].org_id as string;
      await db.execute({
        sql: "UPDATE org_members SET user_id = ?, joined_at = datetime('now'), invite_token = NULL WHERE invite_token = ?",
        args: [user.id, inviteToken],
      });
      await db.execute({
        sql: "UPDATE users SET org_id = ? WHERE id = ?",
        args: [orgId, user.id],
      });
      session.orgId = orgId;
      session.role = "employee";
    }
  }

  // Load org info if not set from invite
  if (!session.orgId) {
    const orgResult = await db.execute({
      sql: "SELECT org_id, role FROM org_members WHERE user_id = ? LIMIT 1",
      args: [user.id],
    });
    if (orgResult.rows.length > 0) {
      session.orgId = orgResult.rows[0].org_id as string;
      session.role = orgResult.rows[0].role as string;
    }
  }

  await session.save();

  const redirect = user.onboarding_complete ? "/dashboard" : "/onboarding";
  return NextResponse.json({ ok: true, redirect });
}
```

- [ ] **Step 4: Create admin setup page**

```tsx
// web/src/app/admin/setup/page.tsx
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function AdminSetupPage() {
  const router = useRouter();
  const [orgName, setOrgName] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    const res = await fetch("/api/admin/team", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "create-org", name: orgName }),
    });
    if (res.ok) {
      router.push("/admin");
    }
    setLoading(false);
  }

  return (
    <div className="min-h-screen flex items-center justify-center px-6">
      <div className="w-full max-w-sm bg-white rounded-2xl shadow-sm border border-[var(--card-border)] p-8">
        <h1 className="text-2xl font-bold mb-2 text-[var(--foreground)]">
          Create your team
        </h1>
        <p className="text-[var(--muted)] mb-6 text-sm">Set up your organization to invite employees</p>
        <form onSubmit={handleCreate} className="space-y-4">
          <input
            type="text"
            value={orgName}
            onChange={(e) => setOrgName(e.target.value)}
            placeholder="Organization name"
            required
            className="w-full px-4 py-3 rounded-xl bg-[var(--background)] border border-[var(--card-border)] focus:border-[var(--accent)] focus:outline-none text-[var(--foreground)] placeholder-[var(--muted)]"
          />
          <button
            type="submit"
            disabled={loading}
            className="w-full py-3 rounded-xl bg-[var(--accent)] hover:bg-[#B5502F] disabled:opacity-50 font-semibold text-white transition"
          >
            {loading ? "Creating..." : "Create Organization"}
          </button>
        </form>
      </div>
    </div>
  );
}
```

- [ ] **Step 5: Create invite acceptance page**

```tsx
// web/src/app/invite/page.tsx
"use client";

import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

function InviteForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const token = searchParams.get("token") || "";
  const inviteEmail = searchParams.get("email") || "";
  const [code, setCode] = useState("");
  const [loading, setLoading] = useState(false);
  const [step, setStep] = useState<"confirm" | "otp">("confirm");
  const [error, setError] = useState("");

  async function handleSendOTP() {
    setLoading(true);
    const res = await fetch("/api/auth/send-otp", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: inviteEmail }),
    });
    setLoading(false);
    if (res.ok) setStep("otp");
    else setError("Failed to send code.");
  }

  async function handleVerify(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    const res = await fetch("/api/auth/verify-otp", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: inviteEmail, code, inviteToken: token }),
    });
    const data = await res.json();
    setLoading(false);
    if (res.ok) router.push(data.redirect);
    else setError("Invalid or expired code.");
  }

  return (
    <div className="w-full max-w-sm bg-white rounded-2xl shadow-sm border border-[var(--card-border)] p-8">
      <h1 className="text-2xl font-bold mb-2 text-[var(--foreground)]">
        Join Speak<span className="text-[var(--accent)]">Rise</span>
      </h1>
      <p className="text-[var(--muted)] mb-6 text-sm">You've been invited to practice English with your team</p>

      {step === "confirm" ? (
        <div className="space-y-4">
          <p className="text-sm text-[var(--foreground)]">Joining as <strong>{inviteEmail}</strong></p>
          <button
            onClick={handleSendOTP}
            disabled={loading}
            className="w-full py-3 rounded-xl bg-[var(--accent)] hover:bg-[#B5502F] disabled:opacity-50 font-semibold text-white transition"
          >
            {loading ? "Sending..." : "Send verification code"}
          </button>
        </div>
      ) : (
        <form onSubmit={handleVerify} className="space-y-4">
          <p className="text-[var(--muted)] text-sm">Code sent to {inviteEmail}</p>
          <input
            type="text"
            value={code}
            onChange={(e) => setCode(e.target.value)}
            placeholder="Enter 6-digit code"
            maxLength={6}
            required
            className="w-full px-4 py-3 rounded-xl bg-[var(--background)] border border-[var(--card-border)] focus:border-[var(--accent)] focus:outline-none text-[var(--foreground)] text-center text-2xl tracking-widest"
          />
          <button
            type="submit"
            disabled={loading}
            className="w-full py-3 rounded-xl bg-[var(--accent)] hover:bg-[#B5502F] disabled:opacity-50 font-semibold text-white transition"
          >
            {loading ? "Verifying..." : "Join team"}
          </button>
        </form>
      )}

      {error && <p className="mt-4 text-red-500 text-sm text-center">{error}</p>}
    </div>
  );
}

export default function InvitePage() {
  return (
    <div className="min-h-screen flex items-center justify-center px-6">
      <Suspense fallback={<div className="text-[var(--muted)]">Loading...</div>}>
        <InviteForm />
      </Suspense>
    </div>
  );
}
```

- [ ] **Step 6: Create admin invite API route**

```typescript
// web/src/app/api/admin/invite/route.ts
import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { inviteEmployee } from "@/lib/org";

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session.userId || session.role !== "admin") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { email } = await req.json();
  if (!email || !email.includes("@")) {
    return NextResponse.json({ error: "Valid email required" }, { status: 400 });
  }

  await inviteEmployee(session.orgId!, email);
  return NextResponse.json({ ok: true });
}
```

- [ ] **Step 7: Create admin team API route**

```typescript
// web/src/app/api/admin/team/route.ts
import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { createOrg, getOrgMembers } from "@/lib/org";

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session.userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { action, name } = await req.json();

  if (action === "create-org") {
    const orgId = await createOrg(name, session.userId);
    session.orgId = orgId;
    session.role = "admin";
    await session.save();
    return NextResponse.json({ ok: true, orgId });
  }

  return NextResponse.json({ error: "Unknown action" }, { status: 400 });
}

export async function GET() {
  const session = await getSession();
  if (!session.userId || session.role !== "admin") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const members = await getOrgMembers(session.orgId!);
  return NextResponse.json({ members });
}
```

- [ ] **Step 8: Commit**

```bash
git add web/src/lib/org.ts web/src/lib/session.ts web/src/app/admin/setup/page.tsx web/src/app/invite/page.tsx web/src/app/api/admin/invite/route.ts web/src/app/api/admin/team/route.ts web/src/app/api/auth/verify-otp/route.ts
git commit -m "feat: org management with admin setup, invite flow, team API"
```

---

## Task 5: Track Configuration & Scenarios

**Files:**
- Create: `web/src/lib/tracks.ts`
- Create: `web/src/app/api/admin/tracks/route.ts`

- [ ] **Step 1: Create tracks.ts with scenario templates**

```typescript
// web/src/lib/tracks.ts
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
  // Level 1-2: Basic work talk
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
  // Level 3: Explain and describe
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
  // Level 4: Persuade
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
  // Level 5: Inspire
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
  // Find scenarios at or below user's level from enabled list
  const eligible = DEFAULT_SCENARIOS.filter(
    s => enabledScenarioIds.includes(s.id) && s.level <= userLevel
  );
  // Prefer scenarios at the user's level, fall back to lower
  const atLevel = eligible.filter(s => s.level === userLevel);
  const pool = atLevel.length > 0 ? atLevel : eligible;
  // Random pick
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
```

- [ ] **Step 2: Create admin tracks API**

```typescript
// web/src/app/api/admin/tracks/route.ts
import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { db } from "@/lib/db";
import { createDefaultTrack, updateTrack, assignUserToTrack, DEFAULT_SCENARIOS } from "@/lib/tracks";

export async function GET() {
  const session = await getSession();
  if (!session.userId || session.role !== "admin") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const tracks = await db.execute({
    sql: "SELECT * FROM tracks WHERE org_id = ?",
    args: [session.orgId!],
  });

  return NextResponse.json({ tracks: tracks.rows, availableScenarios: DEFAULT_SCENARIOS });
}

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session.userId || session.role !== "admin") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { action, trackId, userId, ...data } = await req.json();

  if (action === "create-default") {
    const id = await createDefaultTrack(session.orgId!);
    return NextResponse.json({ ok: true, trackId: id });
  }

  if (action === "update" && trackId) {
    await updateTrack(trackId, data);
    return NextResponse.json({ ok: true });
  }

  if (action === "assign" && trackId && userId) {
    await assignUserToTrack(userId, trackId);
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ error: "Unknown action" }, { status: 400 });
}
```

- [ ] **Step 3: Commit**

```bash
git add web/src/lib/tracks.ts web/src/app/api/admin/tracks/route.ts
git commit -m "feat: track system with scenario templates and admin API"
```

---

## Task 6: Gamification Engine (Points, Streaks, Badges)

**Files:**
- Create: `web/src/lib/gamification.ts`
- Modify: `web/src/lib/assessment.ts`

- [ ] **Step 1: Create gamification.ts**

```typescript
// web/src/lib/gamification.ts
import { db } from "./db";
import { v4 as uuid } from "uuid";

export interface PointsBreakdown {
  participation: number;
  quality: number;
  streakBonus: number;
  total: number;
}

export function calculateQualityPoints(skills: Record<string, number>): number {
  // skills are 0-100, we want 0-40 total quality points
  // Average all skills, then scale to 40
  const values = Object.values(skills);
  if (values.length === 0) return 0;
  const avg = values.reduce((a, b) => a + b, 0) / values.length;
  return Math.round((avg / 100) * 40);
}

export function calculateStreakMultiplier(currentStreak: number): number {
  if (currentStreak >= 30) return 2.0;
  if (currentStreak >= 7) return 1.5;
  return 1.0;
}

export async function updateStreak(userId: string): Promise<number> {
  const today = new Date().toISOString().split("T")[0];

  const existing = await db.execute({
    sql: "SELECT current_streak, longest_streak, last_session_date FROM streaks WHERE user_id = ?",
    args: [userId],
  });

  if (existing.rows.length === 0) {
    await db.execute({
      sql: "INSERT INTO streaks (user_id, current_streak, longest_streak, last_session_date) VALUES (?, 1, 1, ?)",
      args: [userId, today],
    });
    return 1;
  }

  const row = existing.rows[0];
  const lastDate = row.last_session_date as string | null;
  let currentStreak = row.current_streak as number;
  let longestStreak = row.longest_streak as number;

  if (lastDate === today) {
    // Already counted today
    return currentStreak;
  }

  const yesterday = new Date(Date.now() - 86400000).toISOString().split("T")[0];
  if (lastDate === yesterday) {
    currentStreak += 1;
  } else {
    currentStreak = 1;
  }

  if (currentStreak > longestStreak) longestStreak = currentStreak;

  await db.execute({
    sql: "UPDATE streaks SET current_streak = ?, longest_streak = ?, last_session_date = ? WHERE user_id = ?",
    args: [currentStreak, longestStreak, today, userId],
  });

  return currentStreak;
}

export async function awardPoints(userId: string, sessionId: string, skills: Record<string, number>): Promise<PointsBreakdown> {
  const streak = await updateStreak(userId);
  const participation = 10;
  const quality = calculateQualityPoints(skills);
  const multiplier = calculateStreakMultiplier(streak);
  const streakBonus = Math.round(participation * (multiplier - 1));
  const total = participation + quality + streakBonus;

  await db.execute({
    sql: "INSERT INTO points (id, user_id, session_id, participation_points, quality_points, streak_bonus, total) VALUES (?, ?, ?, ?, ?, ?, ?)",
    args: [uuid(), userId, sessionId, participation, quality, streakBonus, total],
  });

  // Check for badges
  await checkAndAwardBadges(userId, streak);

  return { participation, quality, streakBonus, total };
}

async function checkAndAwardBadges(userId: string, currentStreak: number): Promise<void> {
  const badges: { type: string; condition: boolean }[] = [];

  // Session count badges
  const countResult = await db.execute({
    sql: "SELECT COUNT(*) as c FROM points WHERE user_id = ?",
    args: [userId],
  });
  const sessionCount = countResult.rows[0].c as number;

  if (sessionCount === 1) badges.push({ type: "first_session", condition: true });
  if (sessionCount >= 100) badges.push({ type: "centurion", condition: true });

  // Streak badges
  if (currentStreak >= 7) badges.push({ type: "streak_7", condition: true });
  if (currentStreak >= 30) badges.push({ type: "streak_30", condition: true });
  if (currentStreak >= 90) badges.push({ type: "streak_90", condition: true });

  for (const badge of badges) {
    if (badge.condition) {
      await db.execute({
        sql: "INSERT INTO badges (id, user_id, badge_type) VALUES (?, ?, ?) ON CONFLICT(user_id, badge_type) DO NOTHING",
        args: [uuid(), userId, badge.type],
      });
    }
  }
}

export async function getLeaderboard(orgId: string, period: "week" | "alltime") {
  const dateFilter = period === "week"
    ? "AND p.created_at >= date('now', '-7 days')"
    : "";

  const result = await db.execute({
    sql: `SELECT u.id, u.email, u.name, u.current_level, SUM(p.total) as total_points,
            (SELECT current_streak FROM streaks WHERE user_id = u.id) as streak
          FROM points p
          JOIN users u ON u.id = p.user_id
          WHERE u.org_id = ? ${dateFilter}
          GROUP BY u.id
          ORDER BY total_points DESC
          LIMIT 20`,
    args: [orgId],
  });
  return result.rows;
}

export async function getUserStats(userId: string) {
  const pointsResult = await db.execute({
    sql: "SELECT SUM(total) as total_points FROM points WHERE user_id = ?",
    args: [userId],
  });
  const streakResult = await db.execute({
    sql: "SELECT current_streak, longest_streak FROM streaks WHERE user_id = ?",
    args: [userId],
  });
  const badgesResult = await db.execute({
    sql: "SELECT badge_type, earned_at FROM badges WHERE user_id = ? ORDER BY earned_at DESC",
    args: [userId],
  });

  return {
    totalPoints: (pointsResult.rows[0]?.total_points as number) || 0,
    currentStreak: (streakResult.rows[0]?.current_streak as number) || 0,
    longestStreak: (streakResult.rows[0]?.longest_streak as number) || 0,
    badges: badgesResult.rows,
  };
}
```

- [ ] **Step 2: Update assessment.ts to award points and extract work entries**

Add at the end of `assessSession()`, before the return:

```typescript
// After saving progress scores, award points
import { awardPoints } from "./gamification";

// Inside assessSession, after the progress loop:
  const points = await awardPoints(userId, sessionId, feedback.skills || {});

  // Extract work entry from transcript
  const workSummary = await extractWorkSummary(sessionId, userId);

  return { assessmentId, overallLevel, points };
```

Add the `extractWorkSummary` function:

```typescript
async function extractWorkSummary(sessionId: string, userId: string): Promise<void> {
  const messagesResult = await db.execute({
    sql: "SELECT content FROM messages WHERE session_id = ? AND role = 'user' ORDER BY created_at LIMIT 3",
    args: [sessionId],
  });

  if (messagesResult.rows.length === 0) return;

  // Use the first few user messages as work context
  const userText = messagesResult.rows.map(r => r.content as string).join(" ");

  // Simple extraction: store the user's early responses as work summary
  // The AI already asks "what did you work on" so first responses contain work info
  const summary = userText.substring(0, 500);

  await db.execute({
    sql: "INSERT INTO work_entries (id, user_id, session_id, summary_text) VALUES (?, ?, ?, ?)",
    args: [uuid(), userId, sessionId, summary],
  });
}
```

- [ ] **Step 3: Commit**

```bash
git add web/src/lib/gamification.ts web/src/lib/assessment.ts
git commit -m "feat: gamification engine with points, streaks, badges, work extraction"
```

---

## Task 7: Update Session Flow (Track-Aware + Configurable Duration)

**Files:**
- Modify: `web/src/app/api/session/start/route.ts`
- Modify: `web/src/app/session/page.tsx`
- Modify: `web/src/components/conversation-ui.tsx`
- Modify: `web/src/components/timer.tsx`

- [ ] **Step 1: Update session start to use track config**

```typescript
// web/src/app/api/session/start/route.ts
import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { db } from "@/lib/db";
import { v4 as uuid } from "uuid";
import { getTrackForUser, pickScenario } from "@/lib/tracks";

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session.userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { sessionType } = await req.json();
  const id = uuid();

  // Get user's track and level
  const track = await getTrackForUser(session.userId);
  const userResult = await db.execute({
    sql: "SELECT current_level FROM users WHERE id = ?",
    args: [session.userId],
  });
  const userLevel = (userResult.rows[0]?.current_level as number) || 1;

  const duration = track?.duration || 300;
  const trackId = track?.trackId || null;

  // Pick a scenario for this session
  let scenario = null;
  if (track) {
    scenario = pickScenario(userLevel, track.scenarios);
  }

  await db.execute({
    sql: "INSERT INTO sessions (id, user_id, session_type, track_id, target_duration_seconds) VALUES (?, ?, ?, ?, ?)",
    args: [id, session.userId, sessionType || "daily", trackId, duration],
  });

  return NextResponse.json({
    sessionId: id,
    duration,
    scenario: scenario ? {
      openingMessage: scenario.openingMessage,
      systemPromptAddition: scenario.systemPromptAddition,
    } : null,
  });
}
```

- [ ] **Step 2: Update session page to pass duration and scenario**

```tsx
// web/src/app/session/page.tsx
"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import ConversationUI from "@/components/conversation-ui";

export default function SessionPage() {
  const router = useRouter();
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [duration, setDuration] = useState(300);
  const [scenario, setScenario] = useState<{ openingMessage: string; systemPromptAddition: string } | null>(null);
  const [assessing, setAssessing] = useState(false);

  useEffect(() => {
    fetch("/api/session/start", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sessionType: "daily" }),
    })
      .then((r) => r.json())
      .then((data) => {
        setSessionId(data.sessionId);
        setDuration(data.duration || 300);
        setScenario(data.scenario || null);
      });
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

    router.push(`/report/${sessionId}`);
  }

  if (!sessionId) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p className="text-[var(--muted)]">Preparing session...</p>
      </div>
    );
  }

  if (assessing) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="w-8 h-8 border-2 border-[var(--accent)] border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
          <p className="text-[var(--muted)]">Analyzing your session...</p>
        </div>
      </div>
    );
  }

  return (
    <ConversationUI
      sessionId={sessionId}
      onSessionEnd={handleSessionEnd}
      duration={duration}
      initialPrompt={scenario?.openingMessage}
      systemPromptAddition={scenario?.systemPromptAddition}
    />
  );
}
```

- [ ] **Step 3: Update ConversationUI to accept duration prop**

In `web/src/components/conversation-ui.tsx`, update the interface and Timer usage:

```typescript
interface ConversationUIProps {
  sessionId: string;
  voice?: string;
  onSessionEnd: () => void;
  isOnboarding?: boolean;
  initialPrompt?: string;
  systemPromptAddition?: string;
  duration?: number; // seconds, default 300
}

export default function ConversationUI({ sessionId, voice = "af_sarah", onSessionEnd, isOnboarding, initialPrompt, systemPromptAddition, duration = 300 }: ConversationUIProps) {
```

Update the Timer component usage to pass `duration`:

```tsx
<Timer duration={duration} running={timerRunning} onEnd={onSessionEnd} />
```

- [ ] **Step 4: Update Timer to accept configurable duration**

Read current timer.tsx and update to accept a `duration` prop instead of hardcoded 300.

- [ ] **Step 5: Commit**

```bash
git add web/src/app/api/session/start/route.ts web/src/app/session/page.tsx web/src/components/conversation-ui.tsx web/src/components/timer.tsx
git commit -m "feat: track-aware sessions with configurable duration and scenarios"
```

---

## Task 8: Post-Session Report with Points + TTS Readout

**Files:**
- Modify: `web/src/app/report/[sessionId]/page.tsx`
- Modify: `web/src/app/api/assess/route.ts`

- [ ] **Step 1: Update assess route to return points**

```typescript
// web/src/app/api/assess/route.ts
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

  const userResult = await db.execute({
    sql: "SELECT current_level FROM users WHERE id = ?",
    args: [session.userId],
  });

  const currentLevel = (userResult.rows[0]?.current_level as number) || 1;

  const { assessmentId, overallLevel, points } = await assessSession(
    sessionId,
    session.userId,
    currentLevel
  );

  return NextResponse.json({ assessmentId, overallLevel, points });
}
```

- [ ] **Step 2: Redesign report page with points and TTS**

```tsx
// web/src/app/report/[sessionId]/page.tsx
import { redirect } from "next/navigation";
import { getSession } from "@/lib/session";
import { db } from "@/lib/db";
import Link from "next/link";
import ProgressBar from "@/components/progress-bar";
import Nav from "@/components/nav";
import ReportTTS from "./report-tts";

const LEVEL_NAMES = ["", "Learning", "Speaking", "Communicating", "Persuading", "Inspiring"];

export default async function ReportPage({ params }: { params: Promise<{ sessionId: string }> }) {
  const { sessionId } = await params;
  const session = await getSession();
  if (!session.userId) redirect("/login");

  const assessResult = await db.execute({
    sql: "SELECT * FROM assessments WHERE session_id = ? AND user_id = ?",
    args: [sessionId, session.userId],
  });
  if (assessResult.rows.length === 0) redirect("/dashboard");

  const assessment = assessResult.rows[0];
  const feedback = JSON.parse(assessment.feedback_json as string);
  const level = assessment.overall_level as number;

  const pointsResult = await db.execute({
    sql: "SELECT * FROM points WHERE session_id = ?",
    args: [sessionId],
  });
  const points = pointsResult.rows[0] || null;

  const streakResult = await db.execute({
    sql: "SELECT current_streak FROM streaks WHERE user_id = ?",
    args: [session.userId],
  });
  const streak = (streakResult.rows[0]?.current_streak as number) || 0;

  // Build TTS summary text
  const ttsSummary = buildTTSSummary(feedback, points, streak, level);

  return (
    <div className="min-h-screen pb-20 bg-[var(--background)]">
      <header className="px-6 pt-6 pb-4">
        <Link href="/dashboard" className="text-[var(--muted)] text-sm hover:text-[var(--foreground)] transition">
          &larr; Back to dashboard
        </Link>
        <h1 className="text-xl font-bold mt-2 text-[var(--foreground)]">Session Report</h1>
      </header>

      {/* Points earned */}
      {points && (
        <div className="mx-6 p-5 bg-white rounded-2xl border border-[var(--card-border)] shadow-sm">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-[var(--muted)] text-xs uppercase tracking-wide">Points Earned</p>
              <p className="text-3xl font-bold text-[var(--accent)] mt-1">+{points.total as number}</p>
            </div>
            <div className="text-right text-sm text-[var(--muted)]">
              <p>Participation: +{points.participation_points as number}</p>
              <p>Quality: +{points.quality_points as number}</p>
              {(points.streak_bonus as number) > 0 && <p>Streak bonus: +{points.streak_bonus as number}</p>}
            </div>
          </div>
          {streak > 1 && (
            <p className="mt-3 text-sm text-[var(--gold)] font-medium">{streak} day streak!</p>
          )}
        </div>
      )}

      {/* Level */}
      <div className="mx-6 mt-4 p-5 bg-white rounded-2xl border border-[var(--card-border)] shadow-sm">
        <p className="text-[var(--muted)] text-xs uppercase tracking-wide">Your Level</p>
        <p className="text-2xl font-bold mt-1 text-[var(--foreground)]">
          L{level} — {LEVEL_NAMES[level]}
        </p>
      </div>

      {/* TTS player */}
      <ReportTTS text={ttsSummary} />

      {/* Feedback sections */}
      {feedback.feedback?.went_well?.length > 0 && (
        <div className="mx-6 mt-4 p-4 bg-[var(--success-light)] border border-[var(--success)] rounded-xl">
          <h2 className="text-[var(--success)] font-semibold text-sm mb-2">What went well</h2>
          <ul className="space-y-1">
            {feedback.feedback.went_well.map((item: string, i: number) => (
              <li key={i} className="text-sm text-[var(--foreground)]">{item}</li>
            ))}
          </ul>
        </div>
      )}

      {feedback.feedback?.improve?.length > 0 && (
        <div className="mx-6 mt-3 p-4 bg-[var(--accent-light)] border border-[var(--accent)] rounded-xl">
          <h2 className="text-[var(--accent)] font-semibold text-sm mb-2">Areas to improve</h2>
          <ul className="space-y-1">
            {feedback.feedback.improve.map((item: string, i: number) => (
              <li key={i} className="text-sm text-[var(--foreground)]">{item}</li>
            ))}
          </ul>
        </div>
      )}

      {/* Skills */}
      {feedback.skills && Object.keys(feedback.skills).length > 0 && (
        <div className="mx-6 mt-6">
          <h2 className="text-lg font-semibold mb-3 text-[var(--foreground)]">Skill Scores</h2>
          <div className="space-y-3">
            {Object.entries(feedback.skills).map(([skill, score]) => (
              <ProgressBar key={skill} label={skill} score={score as number} />
            ))}
          </div>
        </div>
      )}

      <div className="mx-6 mt-6 mb-6">
        <Link
          href="/dashboard"
          className="block w-full py-3 bg-[var(--accent)] hover:bg-[#B5502F] rounded-xl text-center font-semibold text-white transition"
        >
          Back to Dashboard
        </Link>
      </div>

      <Nav />
    </div>
  );
}

function buildTTSSummary(feedback: any, points: any, streak: number, level: number): string {
  let text = `You earned ${points?.total || 0} points this session. `;
  if (streak > 1) text += `That's a ${streak} day streak! `;
  text += `Your level is ${LEVEL_NAMES[level]}. `;
  if (feedback.feedback?.went_well?.[0]) {
    text += `What went well: ${feedback.feedback.went_well[0]}. `;
  }
  if (feedback.feedback?.improve?.[0]) {
    text += `To improve: ${feedback.feedback.improve[0]}. `;
  }
  text += "Great job today. Keep it up!";
  return text;
}
```

- [ ] **Step 3: Create ReportTTS client component**

```tsx
// web/src/app/report/[sessionId]/report-tts.tsx
"use client";

import { useEffect, useRef, useState } from "react";

export default function ReportTTS({ text }: { text: string }) {
  const [playing, setPlaying] = useState(false);
  const [autoPlayed, setAutoPlayed] = useState(false);
  const playCtxRef = useRef<AudioContext | null>(null);

  async function playTTS() {
    setPlaying(true);
    if (!playCtxRef.current) playCtxRef.current = new AudioContext();
    if (playCtxRef.current.state === "suspended") await playCtxRef.current.resume();

    const res = await fetch("/api/ai/speak", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text, voice: "af_sarah" }),
    });

    const reader = res.body!.getReader();
    const decoder = new TextDecoder();
    let buffer = "";

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });

      const lines = buffer.split("\n\n");
      buffer = lines.pop() || "";

      for (const line of lines) {
        if (!line.startsWith("data: ") || line === "data: [DONE]") continue;
        const data = JSON.parse(line.slice(6));
        const audioBytes = Uint8Array.from(atob(data.audio), c => c.charCodeAt(0));
        const audioBuffer = await playCtxRef.current!.decodeAudioData(audioBytes.buffer.slice(0));
        const source = playCtxRef.current!.createBufferSource();
        source.buffer = audioBuffer;
        source.connect(playCtxRef.current!.destination);
        source.start();
        await new Promise(r => setTimeout(r, audioBuffer.duration * 1000));
      }
    }
    setPlaying(false);
  }

  useEffect(() => {
    if (!autoPlayed) {
      setAutoPlayed(true);
      // Auto-play on load (may be blocked by browser policy)
      playTTS().catch(() => setPlaying(false));
    }
  }, []);

  return (
    <div className="mx-6 mt-4">
      <button
        onClick={playTTS}
        disabled={playing}
        className="w-full py-3 bg-[var(--indigo-light)] border border-[var(--indigo)] text-[var(--indigo)] rounded-xl font-medium text-sm transition hover:bg-[var(--indigo)] hover:text-white disabled:opacity-50"
      >
        {playing ? "Reading feedback..." : "Listen to feedback"}
      </button>
    </div>
  );
}
```

- [ ] **Step 4: Commit**

```bash
git add web/src/app/report/ web/src/app/api/assess/route.ts
git commit -m "feat: post-session report with points, TTS readout, warm UI"
```

---

## Task 9: Redesign Employee Dashboard

**Files:**
- Modify: `web/src/app/dashboard/page.tsx`
- Create: `web/src/components/streak-badge.tsx`
- Create: `web/src/components/leaderboard.tsx`

- [ ] **Step 1: Create streak-badge component**

```tsx
// web/src/components/streak-badge.tsx
const BADGE_LABELS: Record<string, { label: string; color: string }> = {
  first_session: { label: "First Steps", color: "var(--gold)" },
  streak_7: { label: "7-Day Streak", color: "var(--accent)" },
  streak_30: { label: "30-Day Streak", color: "var(--accent)" },
  streak_90: { label: "90-Day Streak", color: "var(--accent)" },
  centurion: { label: "Centurion", color: "var(--indigo)" },
  level_up: { label: "Level Up", color: "var(--success)" },
  perfect_score: { label: "Perfect Score", color: "var(--gold)" },
  top_scorer: { label: "Top Scorer", color: "var(--gold)" },
};

export default function StreakBadge({ type }: { type: string }) {
  const badge = BADGE_LABELS[type] || { label: type, color: "var(--muted)" };
  return (
    <span
      className="inline-block px-3 py-1 rounded-full text-xs font-medium text-white"
      style={{ backgroundColor: badge.color }}
    >
      {badge.label}
    </span>
  );
}
```

- [ ] **Step 2: Create leaderboard component**

```tsx
// web/src/components/leaderboard.tsx
interface LeaderboardEntry {
  email: string;
  name: string | null;
  total_points: number;
  streak: number | null;
  current_level: number;
}

export default function Leaderboard({ entries, currentUserId }: { entries: LeaderboardEntry[]; currentUserId: string }) {
  return (
    <div className="space-y-2">
      {entries.map((entry, i) => (
        <div
          key={entry.email}
          className={`flex items-center justify-between p-3 rounded-xl border ${
            i < 3 ? "bg-[var(--gold-light)] border-[var(--gold)]" : "bg-white border-[var(--card-border)]"
          }`}
        >
          <div className="flex items-center gap-3">
            <span className="w-6 text-center font-bold text-sm text-[var(--muted)]">{i + 1}</span>
            <div>
              <p className="text-sm font-medium text-[var(--foreground)]">{entry.name || entry.email.split("@")[0]}</p>
              <p className="text-xs text-[var(--muted)]">L{entry.current_level} {entry.streak ? `· ${entry.streak}d streak` : ""}</p>
            </div>
          </div>
          <span className="font-bold text-[var(--accent)]">{entry.total_points}pts</span>
        </div>
      ))}
    </div>
  );
}
```

- [ ] **Step 3: Redesign dashboard page**

```tsx
// web/src/app/dashboard/page.tsx
import { redirect } from "next/navigation";
import { getSession } from "@/lib/session";
import { db } from "@/lib/db";
import Link from "next/link";
import ProgressBar from "@/components/progress-bar";
import Nav from "@/components/nav";
import StreakBadge from "@/components/streak-badge";
import Leaderboard from "@/components/leaderboard";
import { getUserStats, getLeaderboard } from "@/lib/gamification";

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

  const stats = await getUserStats(session.userId);

  const todayResult = await db.execute({
    sql: `SELECT id FROM sessions WHERE user_id = ? AND session_type = 'daily'
          AND date(started_at) = date('now') AND ended_at IS NOT NULL`,
    args: [session.userId],
  });
  const completedToday = todayResult.rows.length > 0;

  const leaderboard = session.orgId
    ? await getLeaderboard(session.orgId, "week")
    : [];

  const level = user.current_level as number;

  return (
    <div className="min-h-screen pb-20 bg-[var(--background)]">
      <header className="px-6 pt-6 pb-4">
        <h1 className="text-2xl font-bold text-[var(--foreground)]">
          Speak<span className="text-[var(--accent)]">Rise</span>
        </h1>
        <p className="text-[var(--muted)] text-sm mt-1">{user.email as string}</p>
      </header>

      {/* Level + Streak card */}
      <div className="mx-6 p-5 bg-white rounded-2xl border border-[var(--card-border)] shadow-sm">
        <div className="flex items-center justify-between mb-3">
          <div>
            <p className="text-[var(--muted)] text-xs uppercase tracking-wide">Level {level}</p>
            <p className="text-xl font-bold mt-1 text-[var(--foreground)]">{LEVEL_NAMES[level]}</p>
          </div>
          <div className="text-right">
            <p className="text-2xl font-bold text-[var(--accent)]">{stats.totalPoints}</p>
            <p className="text-xs text-[var(--muted)]">total points</p>
          </div>
        </div>
        <div className="flex items-center gap-4 mt-3 pt-3 border-t border-[var(--card-border)]">
          <div className="flex items-center gap-1">
            <span className="text-lg">🔥</span>
            <span className="text-sm font-medium text-[var(--foreground)]">{stats.currentStreak} day streak</span>
          </div>
          <div className="flex items-center gap-1">
            <span className="text-lg">🏆</span>
            <span className="text-sm font-medium text-[var(--foreground)]">{stats.longestStreak} best</span>
          </div>
        </div>
      </div>

      {/* Start session CTA */}
      <div className="mx-6 mt-4">
        {completedToday ? (
          <div className="p-4 bg-[var(--success-light)] border border-[var(--success)] rounded-xl text-center">
            <p className="text-[var(--success)] font-medium">Today's session complete</p>
            <Link href="/session" className="text-sm text-[var(--accent)] mt-1 inline-block">
              Practice more
            </Link>
          </div>
        ) : (
          <Link
            href="/session"
            className="block w-full py-4 bg-[var(--accent)] hover:bg-[#B5502F] rounded-xl text-center font-semibold text-lg text-white transition shadow-sm"
          >
            Start Today's Session
          </Link>
        )}
      </div>

      {/* Badges */}
      {stats.badges.length > 0 && (
        <div className="mx-6 mt-6">
          <h2 className="text-lg font-semibold mb-3 text-[var(--foreground)]">Badges</h2>
          <div className="flex flex-wrap gap-2">
            {stats.badges.map((b: any) => (
              <StreakBadge key={b.badge_type} type={b.badge_type as string} />
            ))}
          </div>
        </div>
      )}

      {/* Leaderboard */}
      {leaderboard.length > 0 && (
        <div className="mx-6 mt-6">
          <h2 className="text-lg font-semibold mb-3 text-[var(--foreground)]">This Week's Leaderboard</h2>
          <Leaderboard entries={leaderboard as any} currentUserId={session.userId} />
        </div>
      )}

      <Nav />
    </div>
  );
}
```

- [ ] **Step 4: Commit**

```bash
git add web/src/app/dashboard/page.tsx web/src/components/streak-badge.tsx web/src/components/leaderboard.tsx
git commit -m "feat: redesign employee dashboard with points, streaks, badges, leaderboard"
```

---

## Task 10: Admin Dashboard (3 Tabs)

**Files:**
- Create: `web/src/app/admin/page.tsx`
- Create: `web/src/components/admin-nav.tsx`
- Create: `web/src/components/engagement-tab.tsx`
- Create: `web/src/components/progress-tab.tsx`
- Create: `web/src/components/insights-tab.tsx`
- Create: `web/src/app/api/admin/engagement/route.ts`
- Create: `web/src/app/api/admin/progress/route.ts`
- Create: `web/src/app/api/admin/insights/route.ts`

- [ ] **Step 1: Create engagement API**

```typescript
// web/src/app/api/admin/engagement/route.ts
import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { db } from "@/lib/db";

export async function GET() {
  const session = await getSession();
  if (!session.userId || session.role !== "admin") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const orgId = session.orgId!;

  // Total members
  const membersResult = await db.execute({
    sql: "SELECT COUNT(*) as total FROM org_members WHERE org_id = ? AND joined_at IS NOT NULL",
    args: [orgId],
  });
  const totalMembers = membersResult.rows[0].total as number;

  // Completed today
  const todayResult = await db.execute({
    sql: `SELECT COUNT(DISTINCT s.user_id) as count
          FROM sessions s JOIN users u ON u.id = s.user_id
          WHERE u.org_id = ? AND s.ended_at IS NOT NULL AND date(s.started_at) = date('now')`,
    args: [orgId],
  });
  const completedToday = todayResult.rows[0].count as number;

  // Inactive (no session in 3+ days)
  const inactiveResult = await db.execute({
    sql: `SELECT u.id, u.email, u.name
          FROM users u
          JOIN org_members om ON om.user_id = u.id AND om.org_id = ?
          WHERE u.id NOT IN (
            SELECT DISTINCT user_id FROM sessions
            WHERE ended_at IS NOT NULL AND started_at >= datetime('now', '-3 days')
          )
          AND om.joined_at IS NOT NULL`,
    args: [orgId],
  });

  // Streaks distribution
  const streaksResult = await db.execute({
    sql: `SELECT s.current_streak, u.email, u.name
          FROM streaks s JOIN users u ON u.id = s.user_id
          WHERE u.org_id = ?
          ORDER BY s.current_streak DESC`,
    args: [orgId],
  });

  // Last 30 days trend
  const trendResult = await db.execute({
    sql: `SELECT date(started_at) as day, COUNT(DISTINCT user_id) as active_users
          FROM sessions s JOIN users u ON u.id = s.user_id
          WHERE u.org_id = ? AND s.ended_at IS NOT NULL AND s.started_at >= datetime('now', '-30 days')
          GROUP BY date(started_at)
          ORDER BY day`,
    args: [orgId],
  });

  return NextResponse.json({
    totalMembers,
    completedToday,
    completionRate: totalMembers > 0 ? Math.round((completedToday / totalMembers) * 100) : 0,
    inactive: inactiveResult.rows,
    streaks: streaksResult.rows,
    trend: trendResult.rows,
  });
}
```

- [ ] **Step 2: Create progress API**

```typescript
// web/src/app/api/admin/progress/route.ts
import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { db } from "@/lib/db";

export async function GET() {
  const session = await getSession();
  if (!session.userId || session.role !== "admin") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const orgId = session.orgId!;

  // Per-member progress
  const membersResult = await db.execute({
    sql: `SELECT u.id, u.email, u.name, u.current_level,
            (SELECT SUM(total) FROM points WHERE user_id = u.id) as total_points,
            (SELECT current_streak FROM streaks WHERE user_id = u.id) as streak
          FROM users u
          JOIN org_members om ON om.user_id = u.id AND om.org_id = ?
          WHERE om.joined_at IS NOT NULL
          ORDER BY u.current_level DESC, total_points DESC`,
    args: [orgId],
  });

  // Level distribution
  const levelDist = await db.execute({
    sql: `SELECT current_level, COUNT(*) as count
          FROM users u JOIN org_members om ON om.user_id = u.id AND om.org_id = ?
          WHERE om.joined_at IS NOT NULL
          GROUP BY current_level ORDER BY current_level`,
    args: [orgId],
  });

  // Recent level-ups
  const levelUps = await db.execute({
    sql: `SELECT u.email, u.name, a.overall_level, a.created_at
          FROM assessments a JOIN users u ON u.id = a.user_id
          WHERE u.org_id = ? AND a.created_at >= datetime('now', '-7 days')
          ORDER BY a.created_at DESC LIMIT 10`,
    args: [orgId],
  });

  return NextResponse.json({
    members: membersResult.rows,
    levelDistribution: levelDist.rows,
    recentLevelUps: levelUps.rows,
  });
}
```

- [ ] **Step 3: Create insights API**

```typescript
// web/src/app/api/admin/insights/route.ts
import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { db } from "@/lib/db";

export async function GET() {
  const session = await getSession();
  if (!session.userId || session.role !== "admin") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const orgId = session.orgId!;

  // Recent work entries
  const workResult = await db.execute({
    sql: `SELECT w.summary_text, w.created_at, u.email, u.name
          FROM work_entries w JOIN users u ON u.id = w.user_id
          WHERE u.org_id = ?
          ORDER BY w.created_at DESC LIMIT 50`,
    args: [orgId],
  });

  // Weekly digest (if available)
  const digestResult = await db.execute({
    sql: `SELECT digest_json, week_start FROM weekly_digests
          WHERE org_id = ? ORDER BY created_at DESC LIMIT 1`,
    args: [orgId],
  });

  return NextResponse.json({
    recentWork: workResult.rows,
    latestDigest: digestResult.rows[0] || null,
  });
}
```

- [ ] **Step 4: Create admin-nav component**

```tsx
// web/src/components/admin-nav.tsx
"use client";

interface AdminNavProps {
  activeTab: string;
  onTabChange: (tab: string) => void;
}

const tabs = [
  { id: "engagement", label: "Engagement" },
  { id: "progress", label: "Progress" },
  { id: "insights", label: "Work Insights" },
];

export default function AdminNav({ activeTab, onTabChange }: AdminNavProps) {
  return (
    <div className="flex border-b border-[var(--card-border)] mx-6 mb-4">
      {tabs.map((tab) => (
        <button
          key={tab.id}
          onClick={() => onTabChange(tab.id)}
          className={`flex-1 py-3 text-sm font-medium text-center transition border-b-2 ${
            activeTab === tab.id
              ? "border-[var(--accent)] text-[var(--accent)]"
              : "border-transparent text-[var(--muted)] hover:text-[var(--foreground)]"
          }`}
        >
          {tab.label}
        </button>
      ))}
    </div>
  );
}
```

- [ ] **Step 5: Create engagement-tab component**

```tsx
// web/src/components/engagement-tab.tsx
"use client";

import { useEffect, useState } from "react";

interface EngagementData {
  totalMembers: number;
  completedToday: number;
  completionRate: number;
  inactive: Array<{ email: string; name: string | null }>;
  streaks: Array<{ current_streak: number; email: string; name: string | null }>;
}

export default function EngagementTab() {
  const [data, setData] = useState<EngagementData | null>(null);

  useEffect(() => {
    fetch("/api/admin/engagement").then(r => r.json()).then(setData);
  }, []);

  if (!data) return <p className="text-[var(--muted)] px-6">Loading...</p>;

  return (
    <div className="px-6 space-y-4">
      {/* Stats row */}
      <div className="grid grid-cols-3 gap-3">
        <div className="bg-white rounded-xl border border-[var(--card-border)] p-4 text-center">
          <p className="text-2xl font-bold text-[var(--accent)]">{data.completionRate}%</p>
          <p className="text-xs text-[var(--muted)] mt-1">Today</p>
        </div>
        <div className="bg-white rounded-xl border border-[var(--card-border)] p-4 text-center">
          <p className="text-2xl font-bold text-[var(--foreground)]">{data.completedToday}/{data.totalMembers}</p>
          <p className="text-xs text-[var(--muted)] mt-1">Active</p>
        </div>
        <div className="bg-white rounded-xl border border-[var(--card-border)] p-4 text-center">
          <p className="text-2xl font-bold text-[var(--gold)]">{data.inactive.length}</p>
          <p className="text-xs text-[var(--muted)] mt-1">Inactive (3d+)</p>
        </div>
      </div>

      {/* Inactive list */}
      {data.inactive.length > 0 && (
        <div>
          <h3 className="text-sm font-semibold text-[var(--foreground)] mb-2">Needs a nudge</h3>
          <div className="bg-white rounded-xl border border-[var(--card-border)] divide-y divide-[var(--card-border)]">
            {data.inactive.slice(0, 10).map((u, i) => (
              <div key={i} className="px-4 py-3 text-sm text-[var(--foreground)]">
                {u.name || u.email}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Top streaks */}
      {data.streaks.length > 0 && (
        <div>
          <h3 className="text-sm font-semibold text-[var(--foreground)] mb-2">Top Streaks</h3>
          <div className="bg-white rounded-xl border border-[var(--card-border)] divide-y divide-[var(--card-border)]">
            {data.streaks.slice(0, 5).map((s, i) => (
              <div key={i} className="px-4 py-3 flex justify-between items-center">
                <span className="text-sm text-[var(--foreground)]">{s.name || s.email}</span>
                <span className="text-sm font-bold text-[var(--accent)]">{s.current_streak}d</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 6: Create progress-tab component**

```tsx
// web/src/components/progress-tab.tsx
"use client";

import { useEffect, useState } from "react";

const LEVEL_NAMES = ["", "Learning", "Speaking", "Communicating", "Persuading", "Inspiring"];

export default function ProgressTab() {
  const [data, setData] = useState<any>(null);

  useEffect(() => {
    fetch("/api/admin/progress").then(r => r.json()).then(setData);
  }, []);

  if (!data) return <p className="text-[var(--muted)] px-6">Loading...</p>;

  return (
    <div className="px-6 space-y-4">
      {/* Level distribution */}
      <div>
        <h3 className="text-sm font-semibold text-[var(--foreground)] mb-2">Level Distribution</h3>
        <div className="bg-white rounded-xl border border-[var(--card-border)] p-4">
          <div className="flex gap-2 items-end h-24">
            {[1, 2, 3, 4, 5].map(level => {
              const count = data.levelDistribution.find((d: any) => d.current_level === level)?.count || 0;
              const maxCount = Math.max(...data.levelDistribution.map((d: any) => d.count as number), 1);
              const height = (count / maxCount) * 100;
              return (
                <div key={level} className="flex-1 flex flex-col items-center gap-1">
                  <div className="w-full rounded-t" style={{ height: `${Math.max(height, 4)}%`, backgroundColor: "var(--accent)", opacity: 0.5 + (level * 0.1) }}></div>
                  <span className="text-xs text-[var(--muted)]">L{level}</span>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Team members */}
      <div>
        <h3 className="text-sm font-semibold text-[var(--foreground)] mb-2">Team Progress</h3>
        <div className="bg-white rounded-xl border border-[var(--card-border)] divide-y divide-[var(--card-border)]">
          {data.members.map((m: any, i: number) => (
            <div key={i} className="px-4 py-3 flex justify-between items-center">
              <div>
                <p className="text-sm font-medium text-[var(--foreground)]">{m.name || m.email}</p>
                <p className="text-xs text-[var(--muted)]">L{m.current_level} — {LEVEL_NAMES[m.current_level]}</p>
              </div>
              <span className="text-sm text-[var(--accent)] font-medium">{m.total_points || 0}pts</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 7: Create insights-tab component**

```tsx
// web/src/components/insights-tab.tsx
"use client";

import { useEffect, useState } from "react";

export default function InsightsTab() {
  const [data, setData] = useState<any>(null);

  useEffect(() => {
    fetch("/api/admin/insights").then(r => r.json()).then(setData);
  }, []);

  if (!data) return <p className="text-[var(--muted)] px-6">Loading...</p>;

  return (
    <div className="px-6 space-y-4">
      <p className="text-sm text-[var(--muted)]">What your team has been working on (extracted from daily conversations)</p>

      {data.recentWork.length === 0 ? (
        <div className="bg-white rounded-xl border border-[var(--card-border)] p-6 text-center">
          <p className="text-[var(--muted)]">No work entries yet. Insights appear after team members complete sessions.</p>
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-[var(--card-border)] divide-y divide-[var(--card-border)]">
          {data.recentWork.map((entry: any, i: number) => (
            <div key={i} className="px-4 py-3">
              <div className="flex justify-between items-start mb-1">
                <p className="text-xs font-medium text-[var(--accent)]">{entry.name || entry.email}</p>
                <p className="text-xs text-[var(--muted)]">{new Date(entry.created_at).toLocaleDateString()}</p>
              </div>
              <p className="text-sm text-[var(--foreground)]">{entry.summary_text}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 8: Create admin dashboard page**

```tsx
// web/src/app/admin/page.tsx
"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import AdminNav from "@/components/admin-nav";
import EngagementTab from "@/components/engagement-tab";
import ProgressTab from "@/components/progress-tab";
import InsightsTab from "@/components/insights-tab";
import Link from "next/link";

export default function AdminDashboard() {
  const [activeTab, setActiveTab] = useState("engagement");
  const router = useRouter();

  return (
    <div className="min-h-screen pb-20 bg-[var(--background)]">
      <header className="px-6 pt-6 pb-4 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-[var(--foreground)]">
            Speak<span className="text-[var(--accent)]">Rise</span>
            <span className="text-sm font-normal text-[var(--muted)] ml-2">Admin</span>
          </h1>
        </div>
        <Link
          href="/admin/team"
          className="text-sm px-3 py-1.5 rounded-lg bg-[var(--accent)] text-white hover:bg-[#B5502F] transition"
        >
          Manage Team
        </Link>
      </header>

      <AdminNav activeTab={activeTab} onTabChange={setActiveTab} />

      {activeTab === "engagement" && <EngagementTab />}
      {activeTab === "progress" && <ProgressTab />}
      {activeTab === "insights" && <InsightsTab />}
    </div>
  );
}
```

- [ ] **Step 9: Commit**

```bash
git add web/src/app/admin/page.tsx web/src/components/admin-nav.tsx web/src/components/engagement-tab.tsx web/src/components/progress-tab.tsx web/src/components/insights-tab.tsx web/src/app/api/admin/engagement/route.ts web/src/app/api/admin/progress/route.ts web/src/app/api/admin/insights/route.ts
git commit -m "feat: admin dashboard with engagement, progress, and work insights tabs"
```

---

## Task 11: Admin Team Management Page

**Files:**
- Create: `web/src/app/admin/team/page.tsx`

- [ ] **Step 1: Create team management page**

```tsx
// web/src/app/admin/team/page.tsx
"use client";

import { useState, useEffect } from "react";
import Link from "next/link";

interface Member {
  id: string;
  email: string;
  name: string | null;
  current_level: number;
  role: string;
  joined_at: string;
}

export default function TeamPage() {
  const [members, setMembers] = useState<Member[]>([]);
  const [email, setEmail] = useState("");
  const [sending, setSending] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => {
    fetch("/api/admin/team").then(r => r.json()).then(d => setMembers(d.members || []));
  }, []);

  async function handleInvite(e: React.FormEvent) {
    e.preventDefault();
    setSending(true);
    setMessage("");
    const res = await fetch("/api/admin/invite", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email }),
    });
    setSending(false);
    if (res.ok) {
      setMessage(`Invite sent to ${email}`);
      setEmail("");
    } else {
      setMessage("Failed to send invite.");
    }
  }

  return (
    <div className="min-h-screen pb-20 bg-[var(--background)]">
      <header className="px-6 pt-6 pb-4">
        <Link href="/admin" className="text-[var(--muted)] text-sm hover:text-[var(--foreground)] transition">
          &larr; Back to dashboard
        </Link>
        <h1 className="text-xl font-bold mt-2 text-[var(--foreground)]">Team Management</h1>
      </header>

      {/* Invite form */}
      <div className="mx-6 p-5 bg-white rounded-2xl border border-[var(--card-border)] shadow-sm">
        <h2 className="text-sm font-semibold text-[var(--foreground)] mb-3">Invite Employee</h2>
        <form onSubmit={handleInvite} className="flex gap-2">
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="employee@company.com"
            required
            className="flex-1 px-4 py-2 rounded-xl bg-[var(--background)] border border-[var(--card-border)] focus:border-[var(--accent)] focus:outline-none text-sm text-[var(--foreground)] placeholder-[var(--muted)]"
          />
          <button
            type="submit"
            disabled={sending}
            className="px-4 py-2 rounded-xl bg-[var(--accent)] hover:bg-[#B5502F] disabled:opacity-50 font-medium text-white text-sm transition"
          >
            {sending ? "..." : "Invite"}
          </button>
        </form>
        {message && <p className="text-sm text-[var(--success)] mt-2">{message}</p>}
      </div>

      {/* Members list */}
      <div className="mx-6 mt-4">
        <h2 className="text-sm font-semibold text-[var(--foreground)] mb-3">Team ({members.length})</h2>
        <div className="bg-white rounded-xl border border-[var(--card-border)] divide-y divide-[var(--card-border)]">
          {members.map((m) => (
            <div key={m.id} className="px-4 py-3 flex justify-between items-center">
              <div>
                <p className="text-sm font-medium text-[var(--foreground)]">{m.name || m.email}</p>
                <p className="text-xs text-[var(--muted)]">{m.role} · L{m.current_level}</p>
              </div>
              <span className="text-xs text-[var(--muted)]">
                {m.joined_at ? new Date(m.joined_at).toLocaleDateString() : "pending"}
              </span>
            </div>
          ))}
          {members.length === 0 && (
            <div className="px-4 py-6 text-center text-[var(--muted)] text-sm">
              No team members yet. Invite someone above.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add web/src/app/admin/team/page.tsx
git commit -m "feat: admin team management page with invite flow"
```

---

## Task 12: Update Nav + Routing for Admin Role

**Files:**
- Modify: `web/src/components/nav.tsx`
- Modify: `web/src/app/page.tsx`

- [ ] **Step 1: Update nav to show admin link for admins**

```tsx
// web/src/components/nav.tsx
"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const employeeLinks = [
  { href: "/dashboard", label: "Home" },
  { href: "/history", label: "History" },
];

const adminLinks = [
  { href: "/dashboard", label: "Home" },
  { href: "/admin", label: "Admin" },
  { href: "/history", label: "History" },
];

export default function Nav({ isAdmin = false }: { isAdmin?: boolean }) {
  const pathname = usePathname();
  const links = isAdmin ? adminLinks : employeeLinks;

  return (
    <nav className="fixed bottom-0 left-0 right-0 bg-white border-t border-[var(--card-border)] flex justify-around py-3 px-4 z-50">
      {links.map((l) => (
        <Link
          key={l.href}
          href={l.href}
          className={`flex flex-col items-center gap-0.5 text-xs py-1 px-3 transition ${
            pathname === l.href || pathname.startsWith(l.href + "/")
              ? "text-[var(--accent)] font-medium"
              : "text-[var(--muted)]"
          }`}
        >
          <span>{l.label}</span>
        </Link>
      ))}
    </nav>
  );
}
```

- [ ] **Step 2: Update root page redirect logic**

```tsx
// web/src/app/page.tsx
import { redirect } from "next/navigation";
import { getSession } from "@/lib/session";

export default async function Home() {
  const session = await getSession();
  if (!session.userId) redirect("/login");
  redirect("/dashboard");
}
```

- [ ] **Step 3: Commit**

```bash
git add web/src/components/nav.tsx web/src/app/page.tsx
git commit -m "feat: update nav with admin link, warm styling"
```

---

## Task 13: Warm Theme Applied to Remaining Pages

**Files:**
- Modify: `web/src/app/onboarding/page.tsx`
- Modify: `web/src/app/history/page.tsx`
- Modify: `web/src/components/progress-bar.tsx`

- [ ] **Step 1: Update progress-bar with warm colors**

```tsx
// web/src/components/progress-bar.tsx
export default function ProgressBar({ label, score }: { label: string; score: number }) {
  return (
    <div>
      <div className="flex justify-between text-sm mb-1">
        <span className="text-[var(--foreground)] capitalize">{label.replace(/_/g, " ")}</span>
        <span className="text-[var(--muted)]">{score}%</span>
      </div>
      <div className="h-2 bg-[var(--card-border)] rounded-full overflow-hidden">
        <div
          className="h-full rounded-full transition-all duration-500"
          style={{ width: `${score}%`, backgroundColor: "var(--accent)" }}
        />
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Update history page with warm theme**

Replace dark theme classes in history page (`bg-gray-900` → `bg-white border border-[var(--card-border)]`, etc.). Same pattern as login and dashboard rewrites.

- [ ] **Step 3: Update onboarding page with warm theme**

Same class replacement pattern for onboarding page.

- [ ] **Step 4: Commit**

```bash
git add web/src/components/progress-bar.tsx web/src/app/history/page.tsx web/src/app/onboarding/page.tsx
git commit -m "feat: apply warm earthy theme to all remaining pages"
```

---

## Task 14: Build, Deploy, and Test

**Files:** None (deployment task)

- [ ] **Step 1: Run the database migration**

```bash
curl https://speakrise.quantana.top/api/setup-db
```

- [ ] **Step 2: Build locally to verify no errors**

```bash
cd web && npm run build
```

- [ ] **Step 3: Rsync to VPS**

```bash
cd /Users/vishalkumar/Downloads/speakrise && sshpass -p 'dS-2ff3))CxAiq*{' rsync -avz \
  -e 'ssh -o StrictHostKeyChecking=no' \
  --exclude 'venv' --exclude 'web/node_modules' --exclude 'kokoro-v1.0.onnx' \
  --exclude 'voices-v1.0.bin' --exclude '.git' --exclude '__pycache__' \
  ./ root@65.20.72.27:/opt/speakrise/
```

- [ ] **Step 4: Rebuild and restart on VPS**

```bash
sshpass -p 'dS-2ff3))CxAiq*{' ssh -o StrictHostKeyChecking=no root@65.20.72.27 \
  'cd /opt/speakrise/web && npm ci && npm run build && systemctl restart speakrise-web'
```

- [ ] **Step 5: Verify deployment**

Visit https://speakrise.quantana.top and test:
1. Login with OTP
2. Admin setup flow
3. Invite an employee
4. Complete a session as employee
5. Check points/streaks awarded
6. Check admin dashboard tabs

- [ ] **Step 6: Commit any fixes**

```bash
git add -A && git commit -m "fix: deployment fixes"
```
