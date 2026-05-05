import { NextRequest, NextResponse } from "next/server";
import { verifyOTP, findOrCreateUser } from "@/lib/auth";
import { getSession } from "@/lib/session";

export async function POST(req: NextRequest) {
  const { email, code, testMode } = await req.json();

  // In test mode, accept any code
  if (testMode) {
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
