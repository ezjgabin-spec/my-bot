import { z } from "zod";
import { targetGrades } from "./writing-types";

// A teacher may return only a letter. Never invent a numeric equivalent.
export const teacherGradeSchema = z.object({
  essayId: z.string().uuid(),
  grade: z.number().finite().min(0).max(100).optional(),
  letter: z.enum(targetGrades).optional(),
  teacherNotes: z.string().max(8000).default(""),
}).strict().refine(
  (input) => input.grade !== undefined || input.letter !== undefined,
  { message: "Enter a teacher letter grade or an exact percentage." },
);
export type TeacherGradeInput = z.infer<typeof teacherGradeSchema>;
