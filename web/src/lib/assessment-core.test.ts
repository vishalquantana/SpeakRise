import { describe, it, expect } from "vitest";
import { parseAssessmentResponse } from "./assessment-core";

describe("parseAssessmentResponse", () => {
  it("parses valid JSON with skills, feedback, and work_note", () => {
    const raw = JSON.stringify({
      overall_level: 3,
      skills: { grammar: 70, fluency: 55 },
      feedback: { went_well: ["clear"], improve: ["vary sentences"] },
      exercises: [],
      work_note: {
        worked_on: "Refactored the billing module",
        blockers: "Waiting on API keys",
        highlights: "Shipped the migration",
        sentiment: "positive",
      },
    });
    const r = parseAssessmentResponse(raw, 2);
    expect(r.overallLevel).toBe(3);
    expect(r.skills.grammar).toBe(70);
    expect(r.workNote.worked_on).toBe("Refactored the billing module");
    expect(r.workNote.sentiment).toBe("positive");
  });

  it("strips code fences before parsing", () => {
    const raw = "```json\n" + JSON.stringify({ overall_level: 1, skills: {}, feedback: { went_well: [], improve: [] }, exercises: [] }) + "\n```";
    const r = parseAssessmentResponse(raw, 1);
    expect(r.overallLevel).toBe(1);
  });

  it("falls back to user level and neutral sentiment on invalid JSON", () => {
    const r = parseAssessmentResponse("not json at all", 4);
    expect(r.overallLevel).toBe(4);
    expect(r.workNote.sentiment).toBe("neutral");
    expect(r.skills).toEqual({});
  });

  it("normalizes an out-of-range sentiment to neutral", () => {
    const raw = JSON.stringify({ overall_level: 2, skills: {}, feedback: { went_well: [], improve: [] }, exercises: [], work_note: { worked_on: "x", sentiment: "ecstatic" } });
    const r = parseAssessmentResponse(raw, 2);
    expect(r.workNote.sentiment).toBe("neutral");
  });
});
