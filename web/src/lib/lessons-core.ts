export type Skill =
  | "grammar"
  | "vocabulary"
  | "sentence_length"
  | "sentence_variety"
  | "fluency"
  | "clarity"
  | "rhetoric"
  | "narrative"
  | "delivery";

export interface Skeleton {
  id: string;
  theme: string;
  level: number;
  targetSkills: Skill[];
  promptSkeleton: string;
}

export interface GeneratedLessonContent {
  topic: string;
  openingMessage: string;
  systemPromptAddition: string;
}

export const SKELETONS: Skeleton[] = [
  { id: "daily-update-l1", theme: "daily-update", level: 1, targetSkills: ["vocabulary", "grammar"], promptSkeleton: "Ask what the user worked on today using simple, short questions. Offer vocabulary help naturally when they struggle." },
  { id: "daily-update-l2", theme: "daily-update", level: 2, targetSkills: ["grammar", "fluency"], promptSkeleton: "Ask what the user worked on today and follow up on details. Encourage them to describe processes and outcomes in full sentences." },
  { id: "small-talk-l1", theme: "small-talk", level: 1, targetSkills: ["fluency", "vocabulary"], promptSkeleton: "Make friendly small talk about everyday life. Keep it light and use simple sentences to build the user's confidence." },
  { id: "describe-routine-l2", theme: "routine", level: 2, targetSkills: ["sentence_length", "grammar"], promptSkeleton: "Ask the user to describe a routine or a typical day at work. Encourage sequencing words and complete sentences." },
  { id: "opinion-l2", theme: "opinions", level: 2, targetSkills: ["vocabulary", "clarity"], promptSkeleton: "Ask the user for a simple opinion and why. Encourage them to give one clear reason." },
  { id: "problem-solving-l3", theme: "problem-solving", level: 3, targetSkills: ["clarity", "sentence_variety"], promptSkeleton: "Ask the user to explain a challenge they faced and how they approached it. Push for cause-and-effect language and structured explanation." },
  { id: "process-explanation-l3", theme: "process-explanation", level: 3, targetSkills: ["clarity", "sentence_length"], promptSkeleton: "Ask the user to explain a process step-by-step. Encourage sequential language and precise vocabulary." },
  { id: "storytelling-l3", theme: "storytelling", level: 3, targetSkills: ["narrative", "sentence_variety"], promptSkeleton: "Ask the user to tell a short story about something that happened at work. Encourage a clear beginning, middle, and end." },
  { id: "customer-call-l3", theme: "customer-call", level: 3, targetSkills: ["clarity", "fluency"], promptSkeleton: "Role-play a customer with a question or mild complaint. Push the user to respond clearly and helpfully." },
  { id: "decision-defense-l4", theme: "decision-defense", level: 4, targetSkills: ["rhetoric", "clarity"], promptSkeleton: "Ask about a recent decision, then respectfully play devil's advocate. Push the user to articulate reasoning and weigh tradeoffs." },
  { id: "proposal-pitch-l4", theme: "proposal-pitch", level: 4, targetSkills: ["rhetoric", "delivery"], promptSkeleton: "Ask the user to pitch an idea or improvement, then challenge them with a skeptical stakeholder's questions. Push for clarity and conviction." },
  { id: "negotiation-l4", theme: "negotiation", level: 4, targetSkills: ["rhetoric", "delivery"], promptSkeleton: "Role-play a negotiation (deadline, scope, or budget). Push the user to make and defend a position while staying collaborative." },
  { id: "interview-l4", theme: "interview", level: 4, targetSkills: ["narrative", "clarity"], promptSkeleton: "Conduct a mock job interview. Ask behavioral questions and push for structured, evidence-backed answers (situation, action, result)." },
  { id: "conflict-resolution-l4", theme: "conflict-resolution", level: 4, targetSkills: ["clarity", "delivery"], promptSkeleton: "Role-play a disagreement with a teammate. Push the user to de-escalate, acknowledge the other side, and propose a path forward." },
  { id: "executive-brief-l5", theme: "executive-brief", level: 5, targetSkills: ["delivery", "clarity"], promptSkeleton: "Ask the user to brief you as if you were the CEO with 60 seconds. Push for conciseness, impact-first framing, and confident delivery." },
  { id: "team-motivation-l5", theme: "team-motivation", level: 5, targetSkills: ["narrative", "delivery"], promptSkeleton: "Ask the user to motivate a hypothetical team through a setback. Push for empathy, vision, and inspiring language." },
  { id: "vision-pitch-l5", theme: "vision-pitch", level: 5, targetSkills: ["rhetoric", "narrative"], promptSkeleton: "Ask the user to pitch a bold vision for their team or product. Push for a compelling narrative that blends logic and emotion." },
  { id: "handle-objections-l5", theme: "objection-handling", level: 5, targetSkills: ["rhetoric", "delivery"], promptSkeleton: "Pitch back hard objections to the user's idea. Push them to anticipate concerns, stay composed, and respond persuasively." },
];

export function pickSkeleton(
  userLevel: number,
  targetSkill: Skill | string | undefined,
  recentTemplateIds: string[],
  skeletons: Skeleton[] = SKELETONS
): Skeleton {
  const eligible = skeletons.filter((s) => s.level <= userLevel);
  const pool = eligible.length > 0 ? eligible : skeletons;

  let candidates = pool;
  if (targetSkill) {
    const targeted = pool.filter((s) =>
      s.targetSkills.includes(targetSkill as Skill)
    );
    if (targeted.length > 0) candidates = targeted;
  }

  const notRecent = candidates.filter((s) => !recentTemplateIds.includes(s.id));
  const finalPool = notRecent.length > 0 ? notRecent : candidates;

  return finalPool[Math.floor(Math.random() * finalPool.length)];
}

export function rankWeakestSkills(
  progress: { skill: string; score: number }[]
): string[] {
  return [...progress]
    .sort((a, b) => a.score - b.score)
    .map((p) => p.skill);
}

const EMOJI_RE =
  /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{2190}-\u{21FF}\u{2B00}-\u{2BFF}️]/gu;

function stripEmoji(s: string): string {
  return s.replace(EMOJI_RE, "").replace(/\s{2,}/g, " ").trim();
}

export function validateGeneratedLesson(
  raw: unknown
): GeneratedLessonContent | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  const topic = r.topic;
  const opening = r.opening_message;
  const sys = r.system_prompt_addition;
  if (typeof topic !== "string" || !topic.trim()) return null;
  if (typeof opening !== "string" || !opening.trim()) return null;
  if (typeof sys !== "string" || !sys.trim()) return null;
  return {
    topic: topic.trim(),
    openingMessage: stripEmoji(opening),
    systemPromptAddition: sys.trim(),
  };
}

export function buildGeneratorPrompt(
  skeleton: Skeleton,
  userLevel: number,
  recentWorkTopics: string[]
): string {
  const context =
    recentWorkTopics.length > 0
      ? `Recent things this user mentioned working on: ${recentWorkTopics.join("; ")}.`
      : "No prior work context available.";
  return `You design a single short English-practice conversation lesson for a workplace learner.
The learner's level is ${userLevel} (1=beginner ... 5=expert).
Lesson theme: "${skeleton.theme}". Coaching scaffold: ${skeleton.promptSkeleton}
${context}

Produce ONE fresh, specific lesson. Return ONLY valid JSON (no markdown, no code fences) with this exact shape:
{
  "topic": "<a short, fresh, specific topic for today's conversation>",
  "opening_message": "<the first thing the AI partner says out loud to open the conversation, 1-2 sentences, warm and natural>",
  "system_prompt_addition": "<instructions for the AI partner on how to steer this conversation toward the coaching scaffold>"
}

CRITICAL: opening_message will be read aloud by a text-to-speech engine. NEVER use emojis, emoticons, or special symbols anywhere in your output. Keep the topic different from the recent topics listed above.`;
}
