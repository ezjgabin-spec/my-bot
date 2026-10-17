"use client";
import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Plus, ArrowUpRight, Play, Trash2 } from "lucide-react";
import { useWorkspace } from "@/components/workspace";
import { PageHeader, Empty, Badge, ErrorMessage } from "@/components/ui";
import { api, dateLabel, percent, formatLabel } from "@/lib/client";
export default function History() {
  const { state, refresh } = useWorkspace();
  const [filter, setFilter] = useState("all");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState("");
  const [message, setMessage] = useState("");
  const router = useRouter();
  async function remove(
    kind: "subjects" | "exams" | "tests",
    id: string,
    name: string,
  ) {
    const description =
      kind === "subjects"
        ? "This removes the subject, its school exams, practice tests, attempts, grades, and predictions."
        : kind === "exams"
          ? "This removes the school exam, its practice tests, attempts, actual grade, and predictions."
          : "This removes this practice test, its attempts, answers, and predictions. The school exam and actual grade stay.";
    if (
      !window.confirm(
        `Delete ${name}?\n\n${description}\nSaved study materials stay in your library. This cannot be undone in the app.`,
      )
    )
      return;
    setBusy(id);
    setError("");
    setMessage("");
    try {
      await api(`/api/${kind}/${id}`, { method: "DELETE" });
      if (kind === "subjects") setFilter("all");
      await refresh();
      setMessage(`${name} deleted.`);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy("");
    }
  }
  async function start(id: string) {
    setBusy(id);
    setError("");
    try {
      const r = await api<{ attemptId: string }>(`/api/tests/${id}/attempts`, {
        method: "POST",
      });
      await refresh();
      router.push(`/attempts/${r.attemptId}`);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy("");
    }
  }
  const exams = state.exams
    .filter((e) => filter === "all" || e.subject_id === filter)
    .sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at));
  return (
    <>
      <PageHeader
        eyebrow="YOUR LEARNING JOURNEY"
        title="Every attempt tells a story."
        description="Resume a test, revisit your results, or add a real school grade."
        action={
          <Link className="button" href="/create">
            <Plus size={17} />
            New practice test
          </Link>
        }
      />
      <div className="filter-row">
        <label>
          Subject
          <select value={filter} onChange={(e) => setFilter(e.target.value)}>
            <option value="all">All subjects</option>
            {state.subjects.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </label>
        <span className="muted">{exams.length} school exams</span>
        {filter !== "all" && (
          <button
            className="button secondary small"
            disabled={!!busy}
            onClick={() =>
              void remove(
                "subjects",
                filter,
                state.subjects.find((s) => s.id === filter)?.name ?? "subject",
              )
            }
          >
            <Trash2 size={14} />
            Delete subject
          </button>
        )}
      </div>
      <ErrorMessage message={error} />
      {message && (
        <p role="status" className="success-text">
          {message}
        </p>
      )}
      {!exams.length ? (
        <section className="panel">
          <Empty
            title="Your study story starts here"
            text="Create a school exam and a practice test to start building your personal history."
            href="/create"
            action="Create a practice test"
          />
        </section>
      ) : (
        <div className="form-stack">
          {exams.map((exam) => {
            const grade = state.grades.find((g) => g.exam_id === exam.id);
            const tests = state.tests.filter((t) => t.exam_id === exam.id);
            return (
              <section className="panel history-card" key={exam.id}>
                <div className="panel-heading">
                  <div>
                    <Badge tone="purple">
                      {
                        state.subjects.find((s) => s.id === exam.subject_id)
                          ?.name
                      }
                    </Badge>
                    <h2>
                      <Link href={`/exams/${exam.id}`}>{exam.name}</Link>
                    </h2>
                    <p>{dateLabel(exam.exam_date)}</p>
                  </div>
                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                    <Link
                      className="button secondary small"
                      href={`/exams/${exam.id}`}
                    >
                      {grade
                        ? `Actual: ${percent(grade.grade)}`
                        : "Enter actual grade"}
                      <ArrowUpRight size={16} />
                    </Link>
                    <button
                      className="button secondary small"
                      disabled={!!busy}
                      aria-label={`Delete exam ${exam.name}`}
                      onClick={() => void remove("exams", exam.id, exam.name)}
                    >
                      <Trash2 size={14} />
                      Delete exam
                    </button>
                  </div>
                </div>
                {!tests.length && (
                  <p className="helper">
                    No practice tests yet.{" "}
                    <Link href={`/create?exam=${exam.id}`}>
                      Generate one for this exam →
                    </Link>
                  </p>
                )}
                {tests.map((test) => {
                  const attempts = state.attempts
                    .filter((a) => a.test_id === test.id)
                    .sort(
                      (a, b) =>
                        Date.parse(b.started_at) - Date.parse(a.started_at),
                    );
                  return (
                    <div key={test.id} className="history-test">
                      <div className="history-test-heading">
                        <div>
                          <strong>
                            {test.question_count} questions · {test.difficulty}
                          </strong>
                          <p>
                            {formatLabel(test.format)} ·{" "}
                            {dateLabel(test.created_at)}
                          </p>
                        </div>
                        <div
                          style={{ display: "flex", gap: 8, flexWrap: "wrap" }}
                        >
                          {!grade && (
                            <button
                              disabled={!!busy}
                              className="button secondary small"
                              onClick={() => void start(test.id)}
                            >
                              <Play size={14} />
                              {busy === test.id
                                ? "Opening…"
                                : attempts.some((a) => a.status !== "completed")
                                  ? "Resume"
                                  : "Practice again"}
                            </button>
                          )}
                          <button
                            className="button secondary small"
                            disabled={!!busy}
                            aria-label={`Delete practice test: ${test.question_count} questions, ${test.difficulty}, ${exam.name}`}
                            onClick={() =>
                              void remove(
                                "tests",
                                test.id,
                                `${test.question_count}-question practice test`,
                              )
                            }
                          >
                            <Trash2 size={14} />
                            Delete test
                          </button>
                        </div>
                      </div>
                      {attempts.map((a, i) => (
                        <Link
                          href={`/attempts/${a.id}`}
                          className="attempt-row"
                          key={a.id}
                        >
                          <span>
                            Attempt {attempts.length - i}
                            <small>{dateLabel(a.started_at)}</small>
                          </span>
                          <Badge
                            tone={a.status === "completed" ? "green" : "purple"}
                          >
                            {a.status.replaceAll("_", " ")}
                          </Badge>
                          <strong>{percent(a.score)}</strong>
                          <ArrowUpRight size={16} />
                        </Link>
                      ))}
                    </div>
                  );
                })}
              </section>
            );
          })}
        </div>
      )}
    </>
  );
}
