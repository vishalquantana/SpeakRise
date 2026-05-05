import { redirect } from "next/navigation";
import { getSession } from "@/lib/session";
import { db } from "@/lib/db";
import Link from "next/link";
import ProgressBar from "@/components/progress-bar";
import Nav from "@/components/nav";

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

  const messagesResult = await db.execute({
    sql: "SELECT role, content FROM messages WHERE session_id = ? ORDER BY created_at",
    args: [sessionId],
  });

  return (
    <div className="min-h-screen pb-20">
      <header className="px-6 pt-6 pb-4">
        <Link href="/dashboard" className="text-gray-400 text-sm hover:text-white transition">
          &larr; Back to dashboard
        </Link>
        <h1 className="text-xl font-bold mt-2">Session Report</h1>
      </header>

      <div className="mx-6 p-5 bg-gray-900 rounded-2xl border border-gray-800">
        <p className="text-gray-400 text-xs uppercase tracking-wide">Your Level</p>
        <p className="text-3xl font-bold mt-1">
          L{level} — {LEVEL_NAMES[level]}
        </p>
      </div>

      {feedback.feedback?.went_well?.length > 0 && (
        <div className="mx-6 mt-4 p-4 bg-green-900/20 border border-green-800/50 rounded-xl">
          <h2 className="text-green-400 font-semibold text-sm mb-2">What went well</h2>
          <ul className="space-y-1">
            {feedback.feedback.went_well.map((item: string, i: number) => (
              <li key={i} className="text-sm text-gray-300">{item}</li>
            ))}
          </ul>
        </div>
      )}

      {feedback.feedback?.improve?.length > 0 && (
        <div className="mx-6 mt-3 p-4 bg-orange-900/20 border border-orange-800/50 rounded-xl">
          <h2 className="text-orange-400 font-semibold text-sm mb-2">Areas to improve</h2>
          <ul className="space-y-1">
            {feedback.feedback.improve.map((item: string, i: number) => (
              <li key={i} className="text-sm text-gray-300">{item}</li>
            ))}
          </ul>
        </div>
      )}

      {feedback.skills && Object.keys(feedback.skills).length > 0 && (
        <div className="mx-6 mt-6">
          <h2 className="text-lg font-semibold mb-3">Skill Scores</h2>
          <div className="space-y-3">
            {Object.entries(feedback.skills).map(([skill, score]) => (
              <ProgressBar key={skill} label={skill} score={score as number} />
            ))}
          </div>
        </div>
      )}

      {feedback.exercises?.length > 0 && (
        <div className="mx-6 mt-6">
          <h2 className="text-lg font-semibold mb-3">Practice Exercises</h2>
          <div className="space-y-3">
            {feedback.exercises.map((ex: any, i: number) => (
              <div key={i} className="p-4 bg-gray-900 rounded-xl border border-gray-800">
                {ex.type === "repeat_after_me" ? (
                  <>
                    <p className="text-xs text-indigo-400 uppercase tracking-wide mb-1">Repeat after me</p>
                    <p className="text-white font-medium">"{ex.sentence}"</p>
                    <p className="text-sm text-gray-400 mt-1">{ex.explanation}</p>
                  </>
                ) : (
                  <>
                    <p className="text-xs text-indigo-400 uppercase tracking-wide mb-1">Vocabulary</p>
                    <p className="text-white font-medium">{ex.word}</p>
                    <p className="text-sm text-gray-400">{ex.definition}</p>
                    <p className="text-sm text-gray-500 mt-1 italic">"{ex.example}"</p>
                  </>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="mx-6 mt-6">
        <h2 className="text-lg font-semibold mb-3">Conversation Transcript</h2>
        <div className="space-y-2">
          {messagesResult.rows.map((m, i) => (
            <div key={i} className={`text-sm p-3 rounded-xl ${
              m.role === "user" ? "bg-indigo-900/30 text-indigo-200" : "bg-gray-900 text-gray-300"
            }`}>
              <span className="text-xs text-gray-500 uppercase">{m.role as string}: </span>
              {m.content as string}
            </div>
          ))}
        </div>
      </div>

      <div className="mx-6 mt-6 mb-6">
        <Link
          href="/dashboard"
          className="block w-full py-3 bg-indigo-600 hover:bg-indigo-700 rounded-xl text-center font-semibold transition"
        >
          Back to Dashboard
        </Link>
      </div>

      <Nav />
    </div>
  );
}
