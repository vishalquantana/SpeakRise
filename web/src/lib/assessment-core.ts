export type Sentiment = "positive" | "neutral" | "negative";

export interface WorkNote {
  worked_on: string;
  blockers: string;
  highlights: string;
  sentiment: Sentiment;
}

export interface ParsedAssessment {
  overallLevel: number;
  skills: Record<string, number>;
  feedbackJson: string;
  workNote: WorkNote;
  topics: string[];
}

function normalizeTopics(t: unknown): string[] {
  if (!Array.isArray(t)) return [];
  return t.filter((x): x is string => typeof x === "string" && x.trim().length > 0);
}

const DEFAULT_SKILLS: Record<string, number> = {
  grammar: 60,
  vocabulary: 60,
  sentence_length: 60,
  sentence_variety: 60,
  fluency: 60,
  clarity: 60,
};

/**
 * Builds a guaranteed-valid assessment object that parseAssessmentResponse
 * will accept, used as a graceful fallback when the grading LLM is slow,
 * unreachable, or returns malformed output. Never throws.
 */
export function buildFallbackAssessment(userLevel: number): ParsedAssessment {
  return parseAssessmentResponse(
    JSON.stringify({
      overall_level: userLevel,
      skills: { ...DEFAULT_SKILLS },
      feedback: {
        went_well: ["You completed the session and kept the conversation going."],
        improve: ["Keep practicing to build fluency and confidence."],
      },
      exercises: [],
      topics: [],
    }),
    userLevel
  );
}

function normalizeSentiment(s: unknown): Sentiment {
  if (s === "positive" || s === "negative") return s;
  return "neutral";
}

function emptyWorkNote(): WorkNote {
  return { worked_on: "", blockers: "", highlights: "", sentiment: "neutral" };
}

export function parseAssessmentResponse(
  rawText: string,
  userLevel: number
): ParsedAssessment {
  const cleaned = rawText.replace(/```json\s*|\s*```/g, "").trim();
  try {
    const parsed = JSON.parse(cleaned);
    const wn = parsed.work_note || {};
    const workNote: WorkNote = {
      worked_on: typeof wn.worked_on === "string" ? wn.worked_on : "",
      blockers: typeof wn.blockers === "string" ? wn.blockers : "",
      highlights: typeof wn.highlights === "string" ? wn.highlights : "",
      sentiment: normalizeSentiment(wn.sentiment),
    };
    const topics = normalizeTopics(parsed.topics);
    // Ensure topics is persisted on feedback_json.topics as a normalized string[].
    parsed.topics = topics;
    return {
      overallLevel: typeof parsed.overall_level === "number" ? parsed.overall_level : userLevel,
      skills: parsed.skills && typeof parsed.skills === "object" ? parsed.skills : {},
      feedbackJson: JSON.stringify(parsed),
      workNote,
      topics,
    };
  } catch {
    return {
      overallLevel: userLevel,
      skills: {},
      feedbackJson: JSON.stringify({
        overall_level: userLevel,
        skills: {},
        feedback: { went_well: ["Session completed"], improve: ["Keep practicing"] },
        exercises: [],
        topics: [],
        raw_response: rawText,
      }),
      workNote: emptyWorkNote(),
      topics: [],
    };
  }
}
