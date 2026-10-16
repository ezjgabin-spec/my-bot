"use client";
import { use, useState } from "react";
import Link from "next/link";
import { ArrowLeft, Plus, Save, Target } from "lucide-react";
import { useWorkspace } from "@/components/workspace";
import { PageHeader, Empty, ErrorMessage, Badge } from "@/components/ui";
import { api, dateLabel, percent } from "@/lib/client";
import { pairedOutcomes } from "@/lib/prediction";
export default function ExamPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const { state, connection, refresh } = useWorkspace();
  const [value, setValue] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);
  const exam = state.exams.find((e) => e.id === id);
  const grade = state.grades.find((g) => g.exam_id === id);
  const predictions = state.predictions
    .filter((p) => p.exam_id === id)
    .sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at));
  const pair = pairedOutcomes(
    state.predictions,
    state.grades,
    state.exams,
  ).find((p) => p.grade.exam_id === id);
  const latest = predictions[0];
  async function save(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    setSaved(false);
    try {
      await api(`/api/exams/${id}/grade`, {
        method: "PUT",
        body: JSON.stringify({ grade: Number(value) }),
      });
      await refresh();
      setSaved(true);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  if (!exam)
    return (
      <section className="panel">
        <Empty
          title={
            connection === "loading" ? "Loading exam…" : "Exam unavailable"
          }
          text="Select an exam from your history."
          href="/history"
          action="View history"
        />
      </section>
    );
  return (
    <>
      <Link href="/history" className="back-link">
        <ArrowLeft size={16} />
        Back to history
      </Link>
      <PageHeader
        eyebrow={
          state.subjects
            .find((s) => s.id === exam.subject_id)
            ?.name.toUpperCase() || "SCHOOL EXAM"
        }
        title={exam.name}
        description={`School exam · ${dateLabel(exam.exam_date)}`}
        action={
          !grade && (
            <Link className="button" href={`/create?exam=${id}`}>
              <Plus size={16} />
              New practice test
            </Link>
          )
        }
      />
      <div className="exam-detail-grid">
        <section className="panel form-panel">
          <span className="summary-icon">
            <Target size={24} />
          </span>
          <h2>Close the feedback loop.</h2>
          <p className="muted">
            Enter your real school grade to compare it with your saved forecast
            and calibrate predictions for future exams.
          </p>
          <form onSubmit={save}>
            <label>
              Actual school grade (%)
              <input
                type="number"
                min="0"
                max="100"
                step="0.01"
                required
                placeholder={grade ? String(grade.grade) : "e.g. 91"}
                value={value}
                onChange={(e) => {
                  setValue(e.target.value);
                  setSaved(false);
                }}
              />
            </label>
            <ErrorMessage message={error} />
            {saved && (
              <p className="success-text" role="status">
                Grade saved. Future predictions will use this result.
              </p>
            )}
            <button className="button" disabled={busy}>
              <Save size={16} />
              {busy
                ? "Saving…"
                : grade
                  ? "Update actual grade"
                  : "Save actual grade"}
            </button>
          </form>
          <p className="helper">
            Your original predictions stay unchanged. Entering a result closes
            this exam to new practice tests; create a new exam for later study.
          </p>
        </section>
        <section className="panel form-panel">
          <h2>Your forecast vs. reality</h2>
          <div className="result-numbers">
            <div>
              <span>Saved prediction</span>
              <strong>
                {percent(pair?.prediction.predicted ?? latest?.predicted)}
              </strong>
            </div>
            <div>
              <span>Actual grade</span>
              <strong className="mint">{percent(grade?.grade)}</strong>
            </div>
          </div>
          {pair ? (
            <div className="calibration-note">
              <strong>
                {Math.abs(pair.error).toFixed(1)} percentage points{" "}
                {pair.error > 0
                  ? "higher than predicted"
                  : pair.error < 0
                    ? "lower than predicted"
                    : "from your prediction"}
              </strong>
              <p>
                Compared with the latest forecast saved before the school exam
                and before your actual grade was recorded. This counts as one
                school result for calibration.
              </p>
            </div>
          ) : (
            <p className="helper">
              {grade
                ? "No eligible pre-result forecast exists for this exam, so it won’t count toward prediction accuracy."
                : "Add the actual grade after your school exam to measure the prediction error."}
            </p>
          )}
          {latest && (
            <p className="helper">
              Estimated range: {latest.lower}–{latest.upper}% ·{" "}
              {latest.confidence} confidence
            </p>
          )}
        </section>
      </div>
      <section className="panel">
        <div className="panel-heading">
          <div>
            <h2>Prediction snapshots</h2>
            <p>Each forecast is saved exactly as it was made.</p>
          </div>
        </div>
        {!predictions.length ? (
          <Empty
            title="No forecasts yet"
            text="Finish a practice test to get your first prediction."
            href={`/create?exam=${id}`}
          />
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Created</th>
                  <th>Practice score</th>
                  <th>Prediction</th>
                  <th>Range</th>
                  <th>Confidence</th>
                  <th>Result</th>
                </tr>
              </thead>
              <tbody>
                {predictions.map((p) => (
                  <tr key={p.id}>
                    <td>{dateLabel(p.created_at)}</td>
                    <td>
                      {percent(
                        state.attempts.find((a) => a.id === p.attempt_id)
                          ?.score,
                      )}
                    </td>
                    <td className="score-cell">{percent(p.predicted)}</td>
                    <td>
                      {p.lower}–{p.upper}%
                    </td>
                    <td>
                      <Badge tone="purple">{p.confidence}</Badge>
                    </td>
                    <td>
                      <Link
                        className="text-link"
                        href={`/attempts/${p.attempt_id}`}
                      >
                        Review →
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </>
  );
}
