import { describe, it, expect } from "vitest";
import {
  SKELETONS,
  pickSkeleton,
  rankWeakestSkills,
  validateGeneratedLesson,
} from "./lessons-core";

describe("SKELETONS catalog", () => {
  it("has at least 15 skeletons each with required fields", () => {
    expect(SKELETONS.length).toBeGreaterThanOrEqual(15);
    for (const s of SKELETONS) {
      expect(s.id).toBeTruthy();
      expect(s.theme).toBeTruthy();
      expect(s.level).toBeGreaterThanOrEqual(1);
      expect(s.level).toBeLessThanOrEqual(5);
      expect(s.targetSkills.length).toBeGreaterThan(0);
      expect(s.promptSkeleton).toBeTruthy();
    }
  });
});

describe("pickSkeleton", () => {
  it("only returns skeletons at or below the user level", () => {
    const s = pickSkeleton(1, undefined, [], SKELETONS);
    expect(s.level).toBeLessThanOrEqual(1);
  });

  it("prefers a skeleton targeting the requested skill when available", () => {
    const s = pickSkeleton(5, "rhetoric", [], SKELETONS);
    expect(s.targetSkills).toContain("rhetoric");
  });

  it("avoids recently used template ids when alternatives exist", () => {
    const all = pickSkeleton(3, undefined, [], SKELETONS);
    const next = pickSkeleton(3, undefined, [all.id], SKELETONS);
    expect(next.id).not.toBe(all.id);
  });

  it("falls back to any eligible skeleton if all are recently used", () => {
    const eligibleIds = SKELETONS.filter((s) => s.level <= 1).map((s) => s.id);
    const s = pickSkeleton(1, undefined, eligibleIds, SKELETONS);
    expect(s).toBeTruthy();
    expect(s.level).toBeLessThanOrEqual(1);
  });
});

describe("rankWeakestSkills", () => {
  it("returns skills sorted ascending by score", () => {
    const ranked = rankWeakestSkills([
      { skill: "grammar", score: 80 },
      { skill: "fluency", score: 40 },
      { skill: "clarity", score: 60 },
    ]);
    expect(ranked[0]).toBe("fluency");
    expect(ranked[2]).toBe("grammar");
  });

  it("returns empty array when no progress", () => {
    expect(rankWeakestSkills([])).toEqual([]);
  });
});

describe("validateGeneratedLesson", () => {
  it("accepts a well-formed lesson and strips emojis from opening", () => {
    const v = validateGeneratedLesson({
      topic: "Quarterly planning",
      opening_message: "Hey! What did you plan today? 😊",
      system_prompt_addition: "Push for structured thinking.",
    });
    expect(v).not.toBeNull();
    expect(v!.openingMessage).not.toMatch(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u);
    expect(v!.topic).toBe("Quarterly planning");
  });

  it("returns null when required fields are missing", () => {
    expect(validateGeneratedLesson({ topic: "x" })).toBeNull();
    expect(validateGeneratedLesson(null)).toBeNull();
  });
});
