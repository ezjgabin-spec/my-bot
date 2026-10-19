import { z } from "zod";
import { advancedSettingsSchema } from "./test-settings";
import { DIFFICULTIES, FORMATS } from "./types";
export const uuid = z.string().uuid();
export const examSchema = z.object({
  subject: z.string().trim().min(1).max(80),
  name: z.string().trim().min(1).max(160),
  date: z.string().date().nullable().optional(),
});
export const generateSchema = z.object({
  examId: uuid,
  materialId: uuid,
  difficulty: z.enum(DIFFICULTIES),
  format: z.enum(FORMATS),
  count: z.number().int().min(1).max(40),
  advanced: advancedSettingsSchema.optional(),
  timeLimit: z.number().int().min(1).max(240).nullable(),
  focusTopics: z.array(z.string().max(120)).max(10).default([]),
}).superRefine((value, ctx) => {
  if (value.advanced && value.advanced.multipleChoice + value.advanced.written !== value.count)
    ctx.addIssue({code:"custom", message:"The question distribution must equal the total count."});
});
export const generatedQuestionSchema = z
  .object({
    kind: z.enum(["multiple_choice", "short_answer", "math"]),
    prompt: z.string().min(10).max(5000),
    topic: z.string().min(1).max(120),
    options: z.array(z.string().min(1).max(1000)).length(4).nullable(),
    max_points: z.number().int().min(1).max(20),
    answer_key: z.string().min(1).max(4000),
    explanation: z.string().min(1).max(4000),
    rubric: z.string().min(1).max(4000),
  })
  .superRefine((q, ctx) => {
    if (
      q.kind === "multiple_choice" &&
      (!q.options ||
        new Set(q.options).size !== 4 ||
        !q.options.includes(q.answer_key))
    )
      ctx.addIssue({
        code: "custom",
        message:
          "Multiple-choice answer must exactly match one of four distinct options.",
      });
    if (q.kind !== "multiple_choice" && q.options !== null)
      ctx.addIssue({
        code: "custom",
        message: "Written questions must have null options.",
      });
  });
export const generatedTestSchema = z.object({
  questions: z.array(generatedQuestionSchema).min(1).max(40),
  passage: z.string().min(100).max(20000).optional(),
});
export const saveAnswersSchema = z.object({
  responses: z.record(uuid, z.string().max(12000)),
  flags: z.array(uuid).max(40),
});
