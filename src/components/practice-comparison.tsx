"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import type { StageComparison } from "@/lib/practice-benchmark";
type Result = StageComparison & {
  needsTags?: boolean;
  className?: string;
  teacher?: string;
};
export function PracticeComparison({
  examId,
  className,
  teacher,
}: {
  examId: string;
  className?: string;
  teacher?: string;
}) {
  const [state, setState] = useState<{
    key: string;
    data?: Result;
    error?: string;
  } | null>(null);
  const params = new URLSearchParams({
    examId,
    ...(className ? { className } : {}),
    ...(teacher ? { teacher } : {}),
  }).toString();
  useEffect(() => {
    const controller = new AbortController();
    const timer = setTimeout(() => {
      void fetch(`/api/readiness/stage?${params}`, {
        signal: controller.signal,
      })
        .then(async (r) => {
          const data = await r.json();
          if (!r.ok)
            throw Error(data.error || "Could not compare practice results.");
          return data;
        })
        .then((data) => setState({ key: params, data }))
        .catch((e) => {
          if (!controller.signal.aborted)
            setState({ key: params, error: e.message });
        });
    }, 250);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [params]);
  const data = state?.key === params ? state.data : undefined;
  return (
    <section
      className="panel form-panel"
      aria-label="Same-stage practice comparison"
    >
      <h3>Your readiness compared with last time</h3>
      {state?.key === params && state.error ? (
        <p role="alert">{state.error}</p>
      ) : !data ? (
        <p>Finding comparable practice results…</p>
      ) : data.needsTags ? (
        <p>
          <Link href="/analytics#assessment-context">
            Set this exam’s class and teacher in readiness analytics
          </Link>{" "}
          to compare it with past exams.
        </p>
      ) : !data.current ? (
        <p>Complete a practice test to start comparing.</p>
      ) : (
        <>
          <p>
            {data.className} · {data.teacher} · Practice test #{data.stage}:{" "}
            <strong>{data.current.score}%</strong> · {data.current.difficulty} ·{" "}
            {data.current.format.replaceAll("_", " ")}
          </p>
          {!data.matches.length ? (
            <p>
              No earlier exam with a known real grade has a comparable practice
              test #{data.stage} in this class. Comparisons require matching
              teacher, format and difficulty.
            </p>
          ) : (
            <>
              <p>
                {data.matches.length} comparable earlier exam
                {data.matches.length === 1 ? "" : "s"}.
              </p>
              {data.matches.slice(0, 5).map((m) => (
                <div key={m.recordId}>
                  <p>
                    On an earlier exam, you scored{" "}
                    <strong>{m.previousScore}%</strong> on practice test #
                    {data.stage} and earned <strong>{m.actualGrade}%</strong> on
                    the real test. This time, you scored{" "}
                    <strong>{data.current!.score}%</strong> at the same stage—
                    <strong>
                      {m.difference === 0
                        ? "the same score"
                        : `${Math.abs(m.difference)} percentage points ${m.difference > 0 ? "higher" : "lower"}`}
                    </strong>
                    .
                  </p>
                  <p>
                    {m.difference > 0
                      ? "This is an encouraging sign of stronger readiness at this stage."
                      : m.difference < 0
                        ? "Your practice score is lower at this stage; review the missed topics."
                        : "Your practice performance is similar at this stage."}{" "}
                    <Link href={`/exams/${m.sourceId}`}>View earlier exam</Link>
                  </p>
                </div>
              ))}
            </>
          )}
          <p className="helper">
            Matching tags do not prove equal test difficulty. Different topics
            and question quality can affect scores. This comparison does not
            predict the same increase in your real grade or change your locked
            range. Retaking the same generated test does not count as a new
            stage.
          </p>
        </>
      )}
    </section>
  );
}
