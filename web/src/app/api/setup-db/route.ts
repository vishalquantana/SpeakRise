import { NextResponse } from "next/server";
import { migrateDatabase } from "@/lib/schema";

export async function POST() {
  await migrateDatabase();
  return NextResponse.json({ ok: true });
}
