import { z } from "zod";
import { DIFFICULTIES, type Difficulty, type Attempt } from "./types";
export const advancedSettingsSchema = z.object({
  multipleChoice: z.number().int().min(0).max(40),
  written: z.number().int().min(0).max(40),
  writtenKind: z.enum(["short_answer", "math"]),
  reading: z.enum(["none", "shared_passage"]),
  teacherInstructions: z.string().trim().max(4000),
  gradingExpectations: z.string().trim().max(2000),
  additionalInstructions: z.string().trim().max(2000),
  workingRequired: z.boolean(),
  mode: z.enum(["exam", "adaptive"]),
});
export type AdvancedSettings = z.infer<typeof advancedSettingsSchema>;
export const defaultAdvanced: AdvancedSettings = { multipleChoice: 10, written: 10, writtenKind: "short_answer", reading: "none", teacherInstructions: "", gradingExpectations: "", additionalInstructions: "", workingRequired: false, mode: "exam" };
export function effectiveDifficulty(base: Difficulty, mode: AdvancedSettings["mode"], attempts: Attempt[]) {
  if (mode !== "adaptive" || base === "Teacher-Level") return base;
  const recent = attempts.filter(a => a.status === "completed" && a.score !== null).sort((a,b) => (b.completed_at ?? "").localeCompare(a.completed_at ?? "")).slice(0, 2);
  if (recent.length < 2 || recent.some(a => a.score! < 85)) return base;
  return DIFFICULTIES[Math.min(2, DIFFICULTIES.indexOf(base) + 1)];
}
