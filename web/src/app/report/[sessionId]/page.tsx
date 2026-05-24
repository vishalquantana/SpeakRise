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

  // Build TTS summary
  let ttsSummary = `You earned ${points?.total || 0} points this session. `;
  if (streak > 1) ttsSummary += `That's a ${streak} day streak! `;
  ttsSummary += `Your level is ${LEVEL_NAMES[level]}. `;
  if (feedback.feedback?.went_well?.[0]) {
    ttsSummary += `What went well: ${feedback.feedback.went_well[0]}. `;
  }
  if (feedback.feedback?.improve?.[0]) {
    ttsSummary += `To improve: ${feedback.feedback.improve[0]}. `;
  }
  ttsSummary += "Great job today. Keep it up!";

  return (
    <div className="min-h-screen pb-20 bg-[var(--background)]">
      <header className="px-6 pt-6 pb-4">
        <Link href="/dashboard" className="text-[var(--muted)] text-sm hover:text-[var(--foreground)] transition">
          &larr; Back to dashboard
        </Link>
        <h1 className="text-xl font-bold mt-2 text-[var(--foreground)]">Session Report</h1>
      </header>

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

      <div className="mx-6 mt-4 p-5 bg-white rounded-2xl border border-[var(--card-border)] shadow-sm">
        <p className="text-[var(--muted)] text-xs uppercase tracking-wide">Your Level</p>
        <p className="text-2xl font-bold mt-1 text-[var(--foreground)]">
          L{level} — {LEVEL_NAMES[level]}
        </p>
      </div>

      <ReportTTS text={ttsSummary} />

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
