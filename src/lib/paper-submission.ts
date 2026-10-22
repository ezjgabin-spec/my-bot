import { z } from "zod";
import type { PublicQuestion } from "./types";

// The AI only reports handwriting and marks it can see; it never grades here.
export const extractedPaperAnswersSchema = z.object({
  answers: z.array(z.object({
    number: z.number().int().min(1).max(40),
    answer: z.string().max(12000),
  })).max(40),
});

export type PaperAnswer = { questionId: string; number: number; answer: string };

export function mapExtractedPaperAnswers(
  extracted: z.infer<typeof extractedPaperAnswersSchema>,
  questions: PublicQuestion[],
): { answers: PaperAnswer[]; skipped: number } {
  const mapped: PaperAnswer[] = [];
  let skipped = 0;
  const seen = new Set<number>();
  for (const item of extracted.answers) {
    const question = questions[item.number - 1];
    const raw = item.answer.trim();
    if (!question || !raw || seen.has(item.number)) {
      skipped++;
      continue;
    }
    let answer = raw;
    if (question.kind === "multiple_choice") {
      const choice = raw.replace(/^(?:answer|option|choice)\s*[:.\-]?\s*/i, "").trim();
      if (!/^[A-D]$/i.test(choice) || !question.options?.[choice.toUpperCase().charCodeAt(0) - 65]) {
        skipped++;
        continue;
      }
      answer = question.options[choice.toUpperCase().charCodeAt(0) - 65];
    }
    seen.add(item.number);
    mapped.push({ questionId: question.id, number: item.number, answer });
  }
  return { answers: mapped, skipped };
}
