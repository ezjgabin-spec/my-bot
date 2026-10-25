"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import type { EssayComparisonResult } from "@/lib/essay-benchmark";
export function EssayComparison({
  essayId,
  className,
  teacher,
  refreshKey = "",
}: {
  essayId: string;
  className?: string;
  teacher?: string;
  refreshKey?: string;
}) {
  const [state, setState] = useState<{
    key: string;
    data?: EssayComparisonResult & { needsTags?: boolean };
    error?: string;
  }>();
  const key = JSON.stringify([essayId, className, teacher, refreshKey]);
  useEffect(() => {
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      try {
        const q = new URLSearchParams({
          essayId,
          ...(className ? { className } : {}),
          ...(teacher ? { teacher } : {}),
        });
        const response = await fetch(`/api/readiness/essay-stage?${q}`, {
          signal: controller.signal,
        });
        const data = await response.json();
        if (!response.ok)
          throw new Error(data.error || "Could not load essay comparisons.");
        setState({ key, data });
      } catch (e) {
        if (!controller.signal.aborted)
          setState({ key, error: (e as Error).message });
      }
    }, 250);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [essayId, className, teacher, key]);
  const data = state?.key === key ? state.data : undefined;
  return (
    <section className="panel form-panel">
      <h3>Your writing at the same draft stage</h3>
      {state?.key === key && state.error ? (
        <p role="alert">{state.error}</p>
      ) : !data ? (
        <p>Loading essay history…</p>
      ) : data.needsTags ? (
        <p>
          <Link href="/analytics#assessment-context">
            Add class and teacher tags
          </Link>{" "}
          to compare this essay with your earlier results.
        </p>
      ) : !data.current ? (
        <p>Grade a draft to start comparing.</p>
      ) : (
        <>
          <p>
            Draft #{data.stage}: {data.current.lower}–{data.current.upper}%.
            Regrading unchanged text counts as the same draft; the first grade
            of each distinct draft is used.
          </p>
          {!data.matches.length ? (
            <p>
              No earlier graded essay matches this draft stage, class, teacher,
              rubric and grading method yet.
            </p>
          ) : (
            data.matches.slice(0, 5).map((m) => (
              <p key={m.recordId}>
                On an{" "}
                <Link href={`/writing?essay=${m.sourceId}`}>earlier essay</Link>
                , draft #{data.stage} was estimated at {m.lower}–{m.upper}% and
                your teacher gave {m.actualGrade}%. This draft’s midpoint is{" "}
                {m.difference === 0
                  ? "the same"
                  : `${Math.abs(m.difference).toFixed(1)} percentage points ${m.difference > 0 ? "higher" : "lower"}`}
                .
              </p>
            ))
          )}
          <p className="helper">
            Matching rubrics provide context; assignments can still differ in
            difficulty. This comparison does not change your locked prediction
            or guarantee your next grade.
          </p>
        </>
      )}
    </section>
  );
}
