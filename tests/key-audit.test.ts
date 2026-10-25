import { it, expect, vi } from "vitest";
vi.mock("../src/lib/ai", () => ({ structured: vi.fn() }));
import { structured } from "../src/lib/ai";
import { auditKeys } from "../src/lib/key-audit";
it("computes a replacement key and flags mismatch without revealing proposed keys to the independent pass", async () => {
  vi.mocked(structured).mockResolvedValue({
    checks: [
      {
        index: 0,
        supported: true,
        reason: "Addition",
        evidence: "Add two and three",
        answer: "5",
        calculation: { operation: "sum", values: [2, 3] },
      },
    ],
  });
  const q = {
    kind: "math",
    prompt: "Add two and three",
    answer_key: "6",
    options: null,
    position: 0,
    topic: "Numbers",
    max_points: 1,
    explanation: "",
    rubric: "",
  } as const;
  const result = await auditKeys([q], "Add two and three", "Math");
  expect(result[0].answer_key).toBe("5");
  expect(result[0].keyAudit.status).toBe("mismatch");
  expect(
    JSON.stringify(vi.mocked(structured).mock.calls.at(-1)?.[2]),
  ).not.toContain("answer_key");
});
it("flags unsupported source evidence instead of claiming verification", async () => {
  vi.mocked(structured).mockResolvedValue({
    checks: [
      {
        index: 0,
        supported: true,
        reason: "Claim",
        evidence: "Absent quotation",
        answer: "Rome",
        calculation: null,
      },
    ],
  });
  const result = await auditKeys(
    [
      {
        kind: "short_answer",
        prompt: "Which city?",
        answer_key: "Rome",
        options: null,
        position: 0,
        topic: "History",
        max_points: 1,
        explanation: "",
        rubric: "",
      },
    ],
    "Different source",
    "History",
  );
  expect(result[0].keyAudit.status).toBe("unverified");
});
