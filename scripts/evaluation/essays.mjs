import {z} from "zod";
import {gradeFeedbackSchema} from "../../src/lib/writing-types.ts";
import { readdir, readFile } from "node:fs/promises";
import { gradeSystem } from "../../src/lib/writing-grade-prompt.mjs";
import Anthropic from "@anthropic-ai/sdk";
if (!process.argv.includes("--run"))
  throw Error(
    "Usage: node scripts/evaluation/essays.mjs FOLDER --run. Makes three paid Claude calls per essay using ANTHROPIC_API_KEY.",
  );
const folder = process.argv[2];
const client = new Anthropic({ maxRetries: 0 });
const results = [];
for (const name of (await readdir(folder)).filter((n) => n.endsWith(".json"))) {
  const sample = JSON.parse(await readFile(`${folder}/${name}`, "utf8"));
  if (
    typeof sample.essay !== "string" ||
    !Number.isFinite(sample.actualGrade) ||
    sample.actualGrade < 0 ||
    sample.actualGrade > 100
  )
    throw Error(`Invalid sample: ${name}`);
  const runs = [];
  for (let i = 0; i < 3; i++) {
    const message = await client.messages.create({
      model: process.env.ANTHROPIC_MODEL || "claude-sonnet-4-6",
      max_tokens: 3500,
      system: gradeSystem,
      tools: [
        {
          name: "grade",
          description: "Grade interval",
          input_schema: z.toJSONSchema(gradeFeedbackSchema),
        },
      ],
      tool_choice: { type: "tool", name: "grade" },
      messages: [
        {
          role: "user",
          content: JSON.stringify({
            essay: sample.essay,
            assignment: sample.assignment ?? "",
            rubric:
              sample.rubric ??
              "Generic: thesis, evidence, reasoning, structure, grammar, clarity.",
          }),
        },
      ],
    });
    const g = message.content.find((b) => b.type === "tool_use")?.input;
    if (
      message.stop_reason === "max_tokens" ||
      !g ||
      !Number.isFinite(g.lower) ||
      !Number.isFinite(g.upper) ||
      g.lower < 0 ||
      g.upper > 100 ||
      g.lower > g.upper
    )
      throw Error(`Invalid grade response for ${name}`);
    gradeFeedbackSchema.parse(g);
    runs.push({ ...g, usage: message.usage });
  }
  const centers = runs.map((g) => (g.lower + g.upper) / 2),
    estimate = (Math.min(...runs.map(r=>r.lower))+Math.max(...runs.map(r=>r.upper)))/2;
  results.push({
    file: name,
    className: sample.className ?? "unspecified",
    actual: sample.actualGrade,
    estimate,
    absoluteError: Math.abs(estimate - sample.actualGrade),
    spread: Math.max(...centers) - Math.min(...centers),
    lowConfidence: Math.max(...centers) - Math.min(...centers) > 10,
    runs,
  });
}
console.log(
  JSON.stringify(
    {
      version: "plain-essay-eval-v1",
      model: process.env.ANTHROPIC_MODEL || "claude-sonnet-4-6",
      count: results.length,
      mae: results.length
        ? results.reduce((s, r) => s + r.absoluteError, 0) / results.length
        : null,
      results,
    },
    null,
    2,
  ),
);
