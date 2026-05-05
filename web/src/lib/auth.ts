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
