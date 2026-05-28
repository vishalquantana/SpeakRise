import { db } from "./db";
import { v4 as uuid } from "uuid";
import { chat } from "./ai-client";
import {
  SKELETONS,
  pickSkeleton,
  rankWeakestSkills,
  validateGeneratedLesson,
  buildGeneratorPrompt,
  type Skeleton,
  type GeneratedLessonContent,
} from "./lessons-core";

export interface GeneratedLesson {
  id: string;
  templateId: string;
  level: number;
  targetSkill: string | null;
  topic: string;
  openingMessage: string;
  systemPromptAddition: string;
  source: "auto" | "recommendation" | "nudge";
}

export async function getWeakestSkillsForUser(userId: string): Promise<string[]> {
  const res = await db.execute({
    sql: "SELECT skill, score FROM progress WHERE user_id = ?",
    args: [userId],
  });
  return rankWeakestSkills(
    res.rows.map((r) => ({ skill: r.skill as string, score: r.score as number }))
  );
}

export async function getRecentTemplateIds(
  userId: string,
  limit = 4
): Promise<string[]> {
  const res = await db.execute({
    sql: "SELECT template_id FROM generated_lessons WHERE user_id = ? ORDER BY created_at DESC LIMIT ?",
    args: [userId, limit],
  });
  return res.rows.map((r) => r.template_id as string);
}

async function getRecentWorkTopics(userId: string, limit = 3): Promise<string[]> {
  const res = await db.execute({
    sql: "SELECT summary_text FROM work_entries WHERE user_id = ? ORDER BY created_at DESC LIMIT ?",
    args: [userId, limit],
  });
  return res.rows.map((r) => (r.summary_text as string).slice(0, 120));
}

function skeletonContentFallback(s: Skeleton): GeneratedLessonContent {
  return {
    topic: s.theme,
    openingMessage:
      "Hi there. Let's practice together. To start, what did you work on today?",
    systemPromptAddition: s.promptSkeleton,
  };
}

export async function generateLesson(
  userId: string,
  opts: {
    userLevel: number;
    targetSkill?: string;
    source?: "auto" | "recommendation" | "nudge";
  }
): Promise<GeneratedLesson> {
  const source = opts.source || "auto";
  const recent = await getRecentTemplateIds(userId);
  const skeleton = pickSkeleton(opts.userLevel, opts.targetSkill, recent, SKELETONS);
  const workTopics = await getRecentWorkTopics(userId);
  const prompt = buildGeneratorPrompt(skeleton, opts.userLevel, workTopics);

  let content: GeneratedLessonContent | null = null;
  try {
    const res = await chat(prompt, `lessongen-${uuid()}`);
    const cleaned = res.text.replace(/```json\s*|\s*```/g, "").trim();
    content = validateGeneratedLesson(JSON.parse(cleaned));
  } catch {
    content = null;
  }
  if (!content) content = skeletonContentFallback(skeleton);

  const id = uuid();
  const targetSkill = opts.targetSkill || skeleton.targetSkills[0] || null;
  await db.execute({
    sql: `INSERT INTO generated_lessons
            (id, user_id, template_id, level, target_skill, topic, opening_message, system_prompt_addition, source, status)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'suggested')`,
    args: [
      id,
      userId,
      skeleton.id,
      opts.userLevel,
      targetSkill,
      content.topic,
      content.openingMessage,
      content.systemPromptAddition,
      source,
    ],
  });

  return {
    id,
    templateId: skeleton.id,
    level: opts.userLevel,
    targetSkill,
    topic: content.topic,
    openingMessage: content.openingMessage,
    systemPromptAddition: content.systemPromptAddition,
    source,
  };
}

export async function getLessonById(
  lessonId: string,
  userId: string
): Promise<GeneratedLesson | null> {
  const res = await db.execute({
    sql: "SELECT * FROM generated_lessons WHERE id = ? AND user_id = ?",
    args: [lessonId, userId],
  });
  if (res.rows.length === 0) return null;
  const r = res.rows[0];
  return {
    id: r.id as string,
    templateId: r.template_id as string,
    level: r.level as number,
    targetSkill: (r.target_skill as string) || null,
    topic: r.topic as string,
    openingMessage: r.opening_message as string,
    systemPromptAddition: r.system_prompt_addition as string,
    source: r.source as "auto" | "recommendation" | "nudge",
  };
}

export async function getRecommendedLesson(
  userId: string,
  userLevel: number
): Promise<{ lesson: GeneratedLesson; weakestSkill: string | null }> {
  const existing = await db.execute({
    sql: `SELECT * FROM generated_lessons
          WHERE user_id = ? AND source = 'recommendation' AND status = 'suggested'
          ORDER BY created_at DESC LIMIT 1`,
    args: [userId],
  });
  const weakest = (await getWeakestSkillsForUser(userId))[0] || null;

  if (existing.rows.length > 0) {
    const r = existing.rows[0];
    return {
      weakestSkill: (r.target_skill as string) || weakest,
      lesson: {
        id: r.id as string,
        templateId: r.template_id as string,
        level: r.level as number,
        targetSkill: (r.target_skill as string) || null,
        topic: r.topic as string,
        openingMessage: r.opening_message as string,
        systemPromptAddition: r.system_prompt_addition as string,
        source: "recommendation",
      },
    };
  }

  const lesson = await generateLesson(userId, {
    userLevel,
    targetSkill: weakest || undefined,
    source: "recommendation",
  });
  return { lesson, weakestSkill: weakest };
}

export async function consumeLesson(
  lessonId: string,
  sessionId: string
): Promise<void> {
  await db.execute({
    sql: "UPDATE generated_lessons SET status = 'completed', session_id = ? WHERE id = ?",
    args: [sessionId, lessonId],
  });
}
