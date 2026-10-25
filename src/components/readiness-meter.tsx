"use client";
import { useEffect, useState, useCallback } from "react";
import { api } from "@/lib/client";
import { readinessMetrics, type ReadinessRecord } from "@/lib/readiness";
export function ReadinessMeter() {
  const [records, setRecords] = useState<ReadinessRecord[]>([]),
    [sources, setSources] = useState<
      { id: string; kind: string; name: string }[]
    >([]),
    [source, setSource] = useState(""),
    [className, setClass] = useState(""),
    [teacher, setTeacher] = useState(""),
    [running, setRunning] = useState(""),
    [guess, setGuess] = useState(""),
    [filter, setFilter] = useState("all"),
    [kind, setKind] = useState("all"),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  const load = useCallback(async () => {
    const d = await api<{
      records: ReadinessRecord[];
      sources: typeof sources;
    }>("/api/readiness");
    setRecords(d.records);
    setSources(d.sources);
  }, []);
  useEffect(() => {
    void Promise.resolve()
      .then(load)
      .catch((e) => setError(e.message));
  }, [load]);
  async function run(fn: () => Promise<unknown>) {
    setBusy(true);
    setError("");
    try {
      await fn();
      await load();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  const selected = records.filter(
    (r) =>
      (filter === "all" || r.className === filter) &&
      (kind === "all" || r.kind === kind),
  );
  const metrics = readinessMetrics(selected);
  return (
    <section className="panel form-panel">
      <h2>Real-world readiness</h2>
      <p>
        Lock an estimate before receiving your actual grade. Target coverage is
        80%; early ranges are provisional, not validated confidence claims.
      </p>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          const s = sources.find((s) => s.id === source);
          if (s)
            void run(() =>
              api("/api/readiness", {
                method: "POST",
                body: JSON.stringify({
                  id: crypto.randomUUID(),
                  sourceId: source,
                  kind: s.kind,
                  className,
                  teacher,
                  runningGrade: Number(running),
                  guess: Number(guess),
                }),
              }),
            );
        }}
      >
        <fieldset disabled={busy} className="form-grid">
          <label>
            Assessment
            <select
              required
              value={source}
              onChange={(e) => setSource(e.target.value)}
            >
              <option value="">Select test or essay</option>
              {sources.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.kind}: {s.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            Class
            <input
              required
              maxLength={100}
              value={className}
              onChange={(e) => setClass(e.target.value)}
            />
          </label>
          <label>
            Teacher
            <input
              required
              maxLength={100}
              value={teacher}
              onChange={(e) => setTeacher(e.target.value)}
            />
          </label>
          <label>
            Current running grade (%)
            <input
              required
              type="number"
              min={0}
              max={100}
              step="any"
              value={running}
              onChange={(e) => setRunning(e.target.value)}
            />
          </label>
          <label>
            Your own guess (%)
            <input
              required
              type="number"
              min={0}
              max={100}
              step="any"
              value={guess}
              onChange={(e) => setGuess(e.target.value)}
            />
          </label>
          <button className="button">Lock readiness range</button>
        </fieldset>
      </form>
      <div className="form-grid">
        <label>
          Class filter
          <select value={filter} onChange={(e) => setFilter(e.target.value)}>
            <option value="all">All classes</option>
            {[...new Set(records.map((r) => r.className))].map((c) => (
              <option key={c}>{c}</option>
            ))}
          </select>
        </label>
        <label>
          Assessment type
          <select value={kind} onChange={(e) => setKind(e.target.value)}>
            <option value="all">All types</option>
            <option value="test">Tests</option>
            <option value="essay">Essays</option>
          </select>
        </label>
      </div>
      <p>
        {metrics.count} linked outcomes · Range coverage{" "}
        {metrics.coverage === null
          ? "not available"
          : (metrics.coverage * 100).toFixed(1) + "%"}{" "}
        (target 80%)
      </p>
      {metrics.methods.map((m) => (
        <p key={m.method}>
          {m.method}: MAE {m.mae?.toFixed(1) ?? "—"} percentage points ·{" "}
          {m.count} comparisons
        </p>
      ))}
      <p>
        Point-error comparisons use interval midpoints. Missing Claude
        comparisons are excluded, never filled in after outcomes.
      </p>
      {selected.map((r) => (
        <article key={r.id}>
          <h3>
            {r.className} · {r.teacher} · {r.kind}: {r.lower.toFixed(1)}–
            {r.upper.toFixed(1)}%
          </h3>
          <p>
            {r.at} · {r.version} · {r.calibrationCount} prior matched outcomes ·
            Running grade {r.runningGrade}% · Your guess {r.guess}%
          </p>
          {r.calibrationCount < 30 && (
            <p>
              Provisional interval: not enough class-specific calibration data.
            </p>
          )}
          {r.actual ? (
            <p>Actual: {r.actual.grade}%</p>
          ) : (
            <>
              <button
                className="button secondary"
                disabled={busy || !!r.comparison}
                onClick={() =>
                  void run(() =>
                    api("/api/readiness", {
                      method: "PUT",
                      body: JSON.stringify({ id: r.id }),
                    }),
                  )
                }
              >
                {r.comparison
                  ? "Claude comparison saved"
                  : "Run plain Claude comparison · uses credits"}
              </button>
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  const grade = Number(
                    new FormData(e.currentTarget).get("grade"),
                  );
                  void run(() =>
                    api("/api/readiness", {
                      method: "PATCH",
                      body: JSON.stringify({ id: r.id, grade }),
                    }),
                  );
                }}
              >
                <label>
                  Real grade (%)
                  <input
                    required
                    name="grade"
                    type="number"
                    min={0}
                    max={100}
                    step="any"
                  />
                </label>
                <button disabled={busy} className="button">
                  Record real result
                </button>
              </form>
            </>
          )}
        </article>
      ))}
      {error && <p role="alert">{error}</p>}
    </section>
  );
}
