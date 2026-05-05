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
