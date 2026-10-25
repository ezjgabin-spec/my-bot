"use client";
import { useEffect, useState } from "react";
import { api } from "@/lib/client";
import { PracticeComparison } from "./practice-comparison";
import { EssayComparison } from "./essay-comparison";
type Source = {
  id: string;
  kind: "test" | "essay";
  name: string;
  className: string;
  teacher: string;
  locked: boolean;
  graded: boolean;
};
export function AssessmentContexts() {
  const [sources, setSources] = useState<Source[]>([]),
    [selected, setSelected] = useState(""),
    [className, setClass] = useState(""),
    [teacher, setTeacher] = useState(""),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [saved, setSaved] = useState(0);
  useEffect(() => {
    let active = true;
    api<{ sources: Source[] }>("/api/readiness/context")
      .then((d) => {
        if (active) setSources(d.sources);
      })
      .catch((e) => {
        if (active) setError(e.message);
      });
    return () => {
      active = false;
    };
  }, [saved]);
  const source = sources.find((s) => `${s.kind}:${s.id}` === selected);
  return (
    <section className="panel form-panel" id="assessment-context">
      <h2>Class and teacher history</h2>
      <p>
        Tag current assessments and older graded work to unlock personal
        comparisons. Older results are historical context and do not count as
        predictions made before the real grade.
      </p>
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          if (!source) return;
          setBusy(true);
          setError("");
          try {
            await api("/api/readiness/context", {
              method: "POST",
              body: JSON.stringify({
                sourceId: source.id,
                kind: source.kind,
                className,
                teacher,
              }),
            });
            setSaved((n) => n + 1);
          } catch (e) {
            setError((e as Error).message);
          } finally {
            setBusy(false);
          }
        }}
      >
        <fieldset disabled={busy} className="form-grid">
          <label>
            Assessment to tag
            <select
              value={selected}
              required
              onChange={(e) => {
                setSelected(e.target.value);
                const s = sources.find(
                  (s) => `${s.kind}:${s.id}` === e.target.value,
                );
                setClass(s?.className ?? "");
                setTeacher(s?.teacher ?? "");
              }}
            >
              <option value="">Select current or older work</option>
              {sources.map((s) => (
                <option key={`${s.kind}:${s.id}`} value={`${s.kind}:${s.id}`}>
                  {s.kind}: {s.name}
                  {s.graded ? " · graded" : ""}
                </option>
              ))}
            </select>
          </label>
          <label>
            Class for comparisons
            <input
              required
              maxLength={100}
              value={className}
              disabled={source?.locked}
              onChange={(e) => setClass(e.target.value)}
            />
          </label>
          <label>
            Teacher for comparisons
            <input
              required
              maxLength={100}
              value={teacher}
              disabled={source?.locked}
              onChange={(e) => setTeacher(e.target.value)}
            />
          </label>
          <button
            className="button secondary"
            disabled={!source || source.locked}
          >
            Save class and teacher
          </button>
        </fieldset>
      </form>
      {source?.locked && (
        <p>These tags were frozen with your readiness prediction.</p>
      )}
      {saved > 0 && (
        <p role="status">
          Tags saved. Comparisons use matching class and teacher history.
        </p>
      )}
      {error && <p role="alert">{error}</p>}
      {source?.kind === "test" && (
        <PracticeComparison
          key={`${selected}:${saved}`}
          examId={source.id}
          className={className}
          teacher={teacher}
        />
      )}
      {source?.kind === "essay" && (
        <EssayComparison
          essayId={source.id}
          className={className}
          teacher={teacher}
          refreshKey={String(saved)}
        />
      )}
    </section>
  );
}
