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
    return {
      overallLevel: typeof parsed.overall_level === "number" ? parsed.overall_level : userLevel,
      skills: parsed.skills && typeof parsed.skills === "object" ? parsed.skills : {},
      feedbackJson: JSON.stringify(parsed),
      workNote,
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
        raw_response: rawText,
      }),
      workNote: emptyWorkNote(),
    };
  }
}
