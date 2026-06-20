import { redirect } from "next/navigation";
import { getSession } from "@/lib/session";
import { db } from "@/lib/db";
import { getLeaderboard } from "@/lib/gamification";
import Link from "next/link";
import ProgressBar from "@/components/progress-bar";
import Nav from "@/components/nav";
import ReportTTS, { RewardReveal, SpeakLine } from "./report-tts";

interface RepeatExercise {
  type: "repeat_after_me";
  sentence: string;
  explanation?: string;
}
interface VocabExercise {
  type: "vocabulary";
  word: string;
  definition?: string;
  example?: string;
}
type Exercise = RepeatExercise | VocabExercise | Record<string, unknown>;

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

  // Weekly leaderboard rank (read-only) for the celebratory reveal.
  let rank: number | null = null;
  let totalPlayers = 0;
  if (session.orgId) {
    const board = await getLeaderboard(session.orgId, "week");
    totalPlayers = board.length;
    const idx = board.findIndex((r) => (r.id as string) === session.userId);
    if (idx >= 0) rank = idx + 1;
  }

  // Badge newly earned during/after this assessment (earned_at >= assessment time).
  const assessedAt = assessment.created_at as string;
  let newBadge: string | null = null;
  const badgeResult = await db.execute({
    sql: `SELECT badge_type FROM badges
          WHERE user_id = ? AND earned_at >= ?
          ORDER BY earned_at DESC LIMIT 1`,
    args: [session.userId, assessedAt],
  });
  if (badgeResult.rows.length > 0) {
    newBadge = badgeResult.rows[0].badge_type as string;
  }

  const topics: string[] = Array.isArray(feedback.topics) ? feedback.topics : [];
  const exercises: Exercise[] = Array.isArray(feedback.exercises) ? feedback.exercises : [];

  const transcriptResult = await db.execute({
    sql: "SELECT role, content FROM messages WHERE session_id = ? ORDER BY created_at ASC",
    args: [sessionId],
  });
  const transcript = transcriptResult.rows.map((r) => ({
    role: r.role as string,
    content: r.content as string,
  }));

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

      <RewardReveal
        points={(points?.total as number) || 0}
        streak={streak}
        rank={rank}
        totalPlayers={totalPlayers}
        newBadge={newBadge}
      />

      {points && (
        <div className="mx-6 mt-4 p-5 bg-white rounded-2xl border border-[var(--card-border)] shadow-sm">
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

      {topics.length > 0 && (
        <div className="mx-6 mt-6">
          <h2 className="text-lg font-semibold mb-3 text-[var(--foreground)]">What you talked about</h2>
          <div className="flex flex-wrap gap-2">
            {topics.map((topic, i) => (
              <span
                key={i}
                className="inline-block px-3 py-1.5 rounded-full text-sm font-medium bg-[var(--indigo-light)] text-[var(--indigo)] border border-[var(--indigo)]"
              >
                {topic}
              </span>
            ))}
          </div>
        </div>
      )}

      {exercises.length > 0 && (
        <div className="mx-6 mt-6">
          <h2 className="text-lg font-semibold mb-3 text-[var(--foreground)]">Practice these</h2>
          <div className="space-y-3">
            {exercises.map((ex, i) => {
              if ((ex as RepeatExercise).type === "repeat_after_me") {
                const r = ex as RepeatExercise;
                return (
                  <div
                    key={i}
                    className="p-4 bg-white rounded-xl border border-[var(--card-border)] shadow-sm"
                  >
                    <p className="text-[10px] uppercase tracking-wide text-[var(--muted)] mb-1">
                      Repeat after me
                    </p>
                    <div className="flex items-start gap-3">
                      <p className="flex-1 text-sm font-medium text-[var(--foreground)] leading-relaxed">
                        {r.sentence}
                      </p>
                      <SpeakLine text={r.sentence} />
                    </div>
                    {r.explanation && (
                      <p className="mt-2 text-xs text-[var(--muted)]">{r.explanation}</p>
                    )}
                  </div>
                );
              }
              if ((ex as VocabExercise).type === "vocabulary") {
                const v = ex as VocabExercise;
                const spoken = v.example || v.word;
                return (
                  <div
                    key={i}
                    className="p-4 bg-white rounded-xl border border-[var(--card-border)] shadow-sm"
                  >
                    <p className="text-[10px] uppercase tracking-wide text-[var(--muted)] mb-1">
                      New word
                    </p>
                    <div className="flex items-start gap-3">
                      <div className="flex-1">
                        <p className="text-sm font-semibold text-[var(--foreground)]">{v.word}</p>
                        {v.definition && (
                          <p className="text-xs text-[var(--muted)] mt-0.5">{v.definition}</p>
                        )}
                        {v.example && (
                          <p className="text-sm text-[var(--foreground)] mt-1 italic">
                            &ldquo;{v.example}&rdquo;
                          </p>
                        )}
                      </div>
                      {spoken && <SpeakLine text={spoken} />}
                    </div>
                  </div>
                );
              }
              return null;
            })}
          </div>
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

      {transcript.length > 0 && (
        <div className="mx-6 mt-6">
          <h2 className="text-lg font-semibold mb-3 text-[var(--foreground)]">Full Transcript</h2>
          <div className="space-y-2">
            {transcript.map((m, i) => (
              <div
                key={i}
                className={`max-w-[85%] px-4 py-2.5 rounded-2xl text-sm leading-relaxed ${
                  m.role === "user"
                    ? "ml-auto bg-[var(--accent)] text-white rounded-br-sm"
                    : "bg-white border border-[var(--card-border)] text-[var(--foreground)] rounded-bl-sm"
                }`}
              >
                <p className="text-[10px] uppercase tracking-wide opacity-60 mb-0.5">
                  {m.role === "user" ? "You" : "Coach"}
                </p>
                {m.content}
              </div>
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
