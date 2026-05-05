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
