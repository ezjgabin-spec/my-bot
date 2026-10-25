import { NextResponse } from "next/server";
import { z } from "zod";
import {
  apiError,
  requireUser,
  protectMutation,
  readJson,
  AppError,
} from "@/lib/server";
import { readLocalData, updateLocalData } from "@/lib/local-store";
import { sourceOutcome } from "@/lib/assessment-context";
export async function GET() {
  try {
    await requireUser();
    const d = await readLocalData();
    const sources = [
      ...d.exams.map((e) => ({
        id: e.id,
        kind: "test" as const,
        name: e.name,
      })),
      ...d.writingDocuments.map((e) => ({
        id: e.id,
        kind: "essay" as const,
        name: e.title,
      })),
    ];
    return NextResponse.json(
      {
        sources: sources.map((s) => {
          const record = d.readinessRecords.find(
            (r) => r.kind === s.kind && r.sourceId === s.id,
          );
          const c =
            record ??
            d.assessmentContexts.find(
              (c) => c.kind === s.kind && c.sourceId === s.id,
            );
          return {
            ...s,
            className: c?.className ?? "",
            teacher: c?.teacher ?? "",
            locked: !!record,
            graded: !!record?.actual || !!sourceOutcome(d, s.kind, s.id),
          };
        }),
      },
      { headers: { "Cache-Control": "private, no-store" } },
    );
  } catch (e) {
    return apiError(e);
  }
}
export async function POST(request: Request) {
  try {
    protectMutation(request);
    await requireUser();
    const input = z
      .object({
        sourceId: z.string().uuid(),
        kind: z.enum(["test", "essay"]),
        className: z.string().trim().min(1).max(100),
        teacher: z.string().trim().min(1).max(100),
      })
      .strict()
      .parse(await readJson(request));
    const result = await updateLocalData((d) => {
      if (
        !(input.kind === "test" ? d.exams : d.writingDocuments).some(
          (e) => e.id === input.sourceId,
        )
      )
        throw new AppError("Assessment not found.", 404);
      const record = d.readinessRecords.find(
        (r) => r.kind === input.kind && r.sourceId === input.sourceId,
      );
      if (
        record &&
        (record.className !== input.className ||
          record.teacher !== input.teacher)
      )
        throw new AppError(
          "Class and teacher are frozen with the saved prediction.",
          409,
        );
      const existing = d.assessmentContexts.find(
        (c) => c.kind === input.kind && c.sourceId === input.sourceId,
      );
      const context = {
        ...input,
        id: existing?.id ?? crypto.randomUUID(),
        updatedAt: new Date().toISOString(),
        outcome:
          existing?.outcome ?? sourceOutcome(d, input.kind, input.sourceId),
      };
      if (existing) Object.assign(existing, context);
      else d.assessmentContexts.push(context);
      return context;
    });
    return NextResponse.json(result);
  } catch (e) {
    return apiError(e);
  }
}
