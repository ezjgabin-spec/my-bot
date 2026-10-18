import { randomInt } from "node:crypto";

export function shuffled<T>(items: readonly T[]): T[] {
  const result = [...items];
  for (let i = result.length - 1; i > 0; i--) {
    const j = randomInt(i + 1);
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

export const normalizePrompt = (prompt: string) =>
  prompt.normalize("NFKC").toLowerCase().replace(/\s+/g, " ").trim();

// Balanced positions, in a fresh random order, prevent runs of AI-written A keys.
// Persist the result once; grading continues to compare option text, not letters.
export function randomizeChoices<
  T extends { kind: string; options: string[] | null; answer_key: string },
>(questions: T[]): T[] {
  const count = questions.filter((q) => q.kind === "multiple_choice").length;
  const letters = shuffled([0, 1, 2, 3]);
  const positions = shuffled(
    Array.from({ length: count }, (_, i) => letters[i % 4]),
  );
  let next = 0;
  return questions.map((question) => {
    if (question.kind !== "multiple_choice" || !question.options)
      return question;
    const options = shuffled(
      question.options.filter((option) => option !== question.answer_key),
    );
    options.splice(positions[next++], 0, question.answer_key);
    return { ...question, options };
  });
}

export function coveragePriorities(material: string, focusTopics: string[]) {
  const sections = material.match(/[\s\S]{1,2000}/gu) ?? [];
  const terms = focusTopics
    .map((topic) => topic.trim().toLowerCase())
    .filter(Boolean);
  const focused = sections.filter((section) =>
    terms.some((term) => section.toLowerCase().includes(term)),
  );
  return shuffled(focused.length ? focused : sections).slice(0, 6);
}
