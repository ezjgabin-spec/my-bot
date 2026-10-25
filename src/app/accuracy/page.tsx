"use client";
import { useEffect, useState } from "react";
export default function Accuracy() {
  const [data, setData] = useState<Record<string, unknown> | null>(null);
  useEffect(() => {
    void fetch("/api/accuracy")
      .then((r) => {
        if (!r.ok) throw new Error();
        return r.json();
      })
      .then(setData)
      .catch(() => setData({ message: "Accuracy report unavailable" }));
  }, []);
  return (
    <main className="panel form-panel">
      <h1>StudyPredict accuracy</h1>
      <p>
        Prospective, student-reported school outcomes. These are observational
        results, not a guarantee of any student’s grade. Target interval
        coverage: 80%.
      </p>
      {!data ? (
        <p>Loading…</p>
      ) : !data.ready ? (
        <p>{String(data.message)}</p>
      ) : (
        <>
          <p>
            {String(data.count)} matched predictions · Observed coverage{" "}
            {(Number(data.coverage) * 100).toFixed(1)}% · Mean interval width{" "}
            {Number(data.meanWidth).toFixed(1)} percentage points
          </p>
          <pre style={{ whiteSpace: "pre-wrap" }}>
            {JSON.stringify(data.methods, null, 2)}
          </pre>
        </>
      )}
      <p>
        Only aggregate results are published. No class, teacher, essay, name or
        individual grade is exposed. Errors use interval midpoints; comparison
        sample sizes may differ.
      </p>
    </main>
  );
}
