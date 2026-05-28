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
  ]);

  const alterStatements = [
    "ALTER TABLE users ADD COLUMN org_id TEXT",
    "ALTER TABLE sessions ADD COLUMN track_id TEXT",
    "ALTER TABLE sessions ADD COLUMN target_duration_seconds INTEGER DEFAULT 300",
    "ALTER TABLE work_entries ADD COLUMN topics_json TEXT DEFAULT '[]'",
    "ALTER TABLE work_entries ADD COLUMN blockers_text TEXT",
    "ALTER TABLE work_entries ADD COLUMN sentiment TEXT DEFAULT 'neutral'",
  ];
  for (const sql of alterStatements) {
    try {
      await db.execute({ sql, args: [] });
    } catch {
      // Column already exists, safe to ignore
    }
  }
}
