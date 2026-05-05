import { NextRequest, NextResponse } from "next/server";
import { createAndSendOTP } from "@/lib/auth";

export async function POST(req: NextRequest) {
  const { email, testMode } = await req.json();

  if (!email || !email.includes("@")) {
    return NextResponse.json({ error: "Valid email required" }, { status: 400 });
  }

  // In test mode, skip sending real email - just store the OTP
  if (testMode) {
    const { v4: uuid } = await import("uuid");
    const { db } = await import("@/lib/db");
    const id = uuid();
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString();
    await db.execute({
      sql: "INSERT INTO otp_codes (id, email, code, expires_at) VALUES (?, ?, ?, ?)",
      args: [id, email.toLowerCase(), "000000", expiresAt],
    });
    return NextResponse.json({ ok: true, testMode: true });
  }

  await createAndSendOTP(email);
  return NextResponse.json({ ok: true });
}
