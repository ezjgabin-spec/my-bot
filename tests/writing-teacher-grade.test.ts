import { describe, expect, it } from "vitest";
import { teacherGradeSchema } from "../src/lib/writing-teacher-grade";

const essayId = "4c22b955-6e22-41e6-b1bd-8e53d3626e8c";

describe("teacher essay grade input", () => {
  it("accepts letter-only teacher results", () => {
    expect(teacherGradeSchema.parse({ essayId, letter: "B-" })).toEqual({
      essayId, letter: "B-", teacherNotes: "",
    });
  });
  it("accepts exact percentages, with or without a letter", () => {
    expect(teacherGradeSchema.parse({ essayId, grade: 81.5, letter: "B-" }).grade).toBe(81.5);
    expect(teacherGradeSchema.parse({ essayId, grade: 0 }).grade).toBe(0);
    expect(teacherGradeSchema.parse({ essayId, grade: 100 }).grade).toBe(100);
  });
  it("does not silently replace a missing teacher result with zero", () => {
    expect(teacherGradeSchema.safeParse({ essayId }).success).toBe(false);
    expect(teacherGradeSchema.safeParse({ essayId, grade: -1 }).success).toBe(false);
    expect(teacherGradeSchema.safeParse({ essayId, grade: 101 }).success).toBe(false);
    expect(teacherGradeSchema.safeParse({ essayId, letter: "Z" }).success).toBe(false);
  });
});
