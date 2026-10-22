"use client";
import { use, useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  ArrowRight,
  Flag,
  Clock,
  Check,
  Send,
  Sparkles,
  Target,
  LoaderCircle,
  Printer,
} from "lucide-react";
import { MathWorkspace } from "@/components/math-workspace";
import { api, percent } from "@/lib/client";
import { useWorkspace } from "@/components/workspace";
import { PageHeader, ErrorMessage, Badge } from "@/components/ui";
import type { AttemptView, Question } from "@/lib/types";
export default function AttemptPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const { refresh, entitlement } = useWorkspace();
  const [mathPending, setMathPending] = useState(false);
  const [view, setView] = useState<AttemptView | null>(null);
  const [responses, setResponses] = useState<Record<string, string>>({});
  const [flags, setFlags] = useState<string[]>([]);
  const [index, setIndex] = useState(0);
  const [error, setError] = useState("");
  const [saveStatus, setSaveStatus] = useState("All answers saved");
  const [busy, setBusy] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const queue = useRef<Promise<unknown>>(Promise.resolve());
  const revision = useRef(0);
  const autoSubmitted = useRef(false);
  const submitting = useRef(false);
  const draft = useRef({
    responses: {} as Record<string, string>,
    flags: [] as string[],
  });
  const load = useCallback(
    async (initial = false) => {
      const data = await api<AttemptView>(`/api/attempts/${id}`);
      setView(data);
      if (initial) {
        setResponses(data.attempt.responses);
        setFlags(data.attempt.flags);
        draft.current = {
          responses: data.attempt.responses,
          flags: data.attempt.flags,
        };
      }
    },
    [id],
  );
  useEffect(() => {
    void Promise.resolve()
      .then(() => load(true))
      .catch((e) => setError(e.message));
    const clock = setInterval(() => setNow(Date.now()), 1000);
    return () => {
      clearInterval(clock);
      if (timer.current) clearTimeout(timer.current);
    };
  }, [load]);
  const persist = useCallback(async () => {
    if (timer.current) clearTimeout(timer.current);
    const version = revision.current;
    const body = JSON.stringify(draft.current);
    setSaveStatus("Saving…");
    const task = queue.current
      .catch(() => {})
      .then(() => api(`/api/attempts/${id}`, { method: "PATCH", body }));
    queue.current = task;
    try {
      await task;
      if (revision.current === version) setSaveStatus("All answers saved");
    } catch (e) {
      setSaveStatus("Not saved — retry before leaving");
      throw e;
    }
  }, [id]);
  function edit(nextResponses: Record<string, string>, nextFlags: string[]) {
    setResponses(nextResponses);
    setFlags(nextFlags);
    draft.current = { responses: nextResponses, flags: nextFlags };
    revision.current++;
    setSaveStatus("Unsaved changes");
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      void persist().catch((e) => setError(e.message));
    }, 500);
  }
  const submit = useCallback(
    async (automatic = false) => {
      if (!view || submitting.current) return;
      if (
        !automatic &&
        view.attempt.status === "in_progress" &&
        !window.confirm(
          "Submit this test? Unanswered questions receive zero points. You won’t be able to change answers after submission.",
        )
      )
        return;
      submitting.current = true;
      setBusy(true);
      setError("");
      if (timer.current) clearTimeout(timer.current);
      try {
        const expired =
          !!view.attempt.deadline_at &&
          Date.now() >= Date.parse(view.attempt.deadline_at);
        if (view.attempt.status === "in_progress" && !expired) {
          try {
            await persist();
          } catch (e) {
            if (
              !view.attempt.deadline_at ||
              Date.now() < Date.parse(view.attempt.deadline_at)
            )
              throw e;
          }
        } else await queue.current.catch(() => {});
        await api(`/api/attempts/${id}/submit`, { method: "POST" });
        await load();
        await refresh();
      } catch (e) {
        setError((e as Error).message);
        await load().catch(() => {});
      } finally {
        setBusy(false);
        submitting.current = false;
      }
    },
    [id, load, persist, refresh, view],
  );
  useEffect(() => {
    if (
      view?.attempt.status === "in_progress" &&
      view.attempt.deadline_at &&
      now >= Date.parse(view.attempt.deadline_at) &&
      !autoSubmitted.current
    ) {
      autoSubmitted.current = true;
      void submit(true);
    }
  }, [now, view, submit]);
  useEffect(() => {
    if (view?.attempt.status !== "grading" || busy) return;
    const poll = setInterval(() => {
      void load().catch((e) => setError(e.message));
    }, 4000);
    return () => clearInterval(poll);
  }, [view?.attempt.status, busy, load]);
  useEffect(() => {
    const warn = (event: BeforeUnloadEvent) => {
      if (
        saveStatus !== "All answers saved" &&
        view?.attempt.status === "in_progress"
      ) {
        event.preventDefault();
        event.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [saveStatus, view?.attempt.status]);
  if (!view)
    return (
      <section className="panel form-panel">
        <h1>{error ? "Unable to open test" : "Loading your test…"}</h1>
        <ErrorMessage message={error} />
        <Link href="/history" className="text-link">
          Back to your tests →
        </Link>
      </section>
    );
  if (view.attempt.status === "completed") return <Results view={view} />;
  const question = view.questions[index];
  const answered = Object.values(responses).filter((x) => x.trim()).length;
  const remaining = view.attempt.deadline_at
    ? Math.max(
        0,
        Math.ceil((Date.parse(view.attempt.deadline_at) - now) / 1000),
      )
    : null;
  const frozen = busy || view.attempt.status === "grading" || remaining === 0;
  return (
    <>
      <div className="exam-toolbar">
        <Link
          href="/history"
          className="back-link"
          onClick={(e) => {
            if (
              saveStatus !== "All answers saved" &&
              !window.confirm(
                "Some answers are not saved yet. Leave this test?",
              )
            )
              e.preventDefault();
          }}
        >
          <ArrowLeft size={16} />
          Your tests
        </Link>
        <Link href={"/attempts/" + id + "/paper"} className="button secondary small"><Printer size={16} /> Print / paper test</Link>
        <span className="save-status" role="status">
          <Check size={15} />
          {saveStatus}
        </span>
        {remaining !== null && (
          <span className={`timer ${remaining < 60 ? "urgent" : ""}`}>
            <Clock size={16} />
            {Math.floor(remaining / 60)}:
            {String(remaining % 60).padStart(2, "0")}
          </span>
        )}
      </div>
      <PageHeader
        eyebrow={`${view.subject.toUpperCase()} · ${view.test.difficulty.toUpperCase()}`}
        title={view.exam.name}
        description={`${view.questions.length} questions · Work at your own pace${remaining !== null ? ", within the time limit" : ""}`}
      />
      <ErrorMessage message={error} />
      {saveStatus.startsWith("Not saved") && !frozen && (
        <button
          className="button secondary small"
          onClick={() =>
            void persist()
              .then(() => setError(""))
              .catch((e) => setError(e.message))
          }
        >
          Retry saving
        </button>
      )}
      {frozen && (
        <div className="notice" role="status">
          <span>
            <LoaderCircle size={17} className={busy ? "spin" : ""} />{" "}
            {busy
              ? "Grading your answers and calculating your prediction…"
              : view.attempt.status === "grading"
                ? "Your answers are submitted. Grading may be running; retry if it was interrupted."
                : "Time is up. Your last saved answers will be submitted."}
          </span>
          {!busy && (
            <button className="button small" onClick={() => void submit(true)}>
              Retry submission
            </button>
          )}
        </div>
      )}
      <div className="test-layout">
        <section className="panel question-panel">
          <div className="question-heading">
            <Badge tone="purple">
              Question {index + 1} of {view.questions.length}
            </Badge>
            <span className="muted">{question.max_points} points</span>
          </div>
          <div className="progress-track">
            <div
              style={{ width: `${(answered / view.questions.length) * 100}%` }}
            />
          </div>
          <div className="question-topic">{question.topic}</div>
          {question.passage && <section className="panel form-panel"><h3>Shared reading passage</h3><p style={{whiteSpace:"pre-wrap"}}>{question.passage}</p></section>}
          <h2 className="question-prompt">{question.prompt}</h2>
          <fieldset disabled={frozen} className="answer-fieldset">
            <legend className="sr-only">
              Your answer to question {index + 1}
            </legend>
            {question.kind === "multiple_choice" ? (
              <div className="answer-options">
                {question.options?.map((option, i) => (
                  <label
                    className={`answer-option ${responses[question.id] === option ? "selected" : ""}`}
                    key={option}
                  >
                    <input
                      type="radio"
                      name={question.id}
                      value={option}
                      checked={responses[question.id] === option}
                      onChange={() =>
                        edit({ ...responses, [question.id]: option }, flags)
                      }
                    />
                    <span className="option-letter">
                      {String.fromCharCode(65 + i)}
                    </span>
                    <span>{option}</span>
                  </label>
                ))}
              </div>
            ) : (
              <label>
                Your response
                <textarea
                  rows={8}
                  maxLength={12000}
                  value={responses[question.id] ?? ""}
                  onChange={(e) =>
                    edit({ ...responses, [question.id]: e.target.value }, flags)
                  }
                  placeholder={
                    question.kind === "math"
                      ? "Show your steps. Use plain text, e.g. x^2, sqrt(9), or 1/2. Include units where appropriate."
                      : "Write your answer here. Support it with evidence where relevant."
                  }
                />
                <span className="helper">
                  {question.kind === "math"
                    ? "Equivalent expressions and reasonable rounding are accepted. Clear working can earn partial credit."
                    : "Your response will be evaluated against the question’s rubric."}
                </span>
              </label>
            )}
          </fieldset>
          {question.kind !== "multiple_choice" && (entitlement?.family || (entitlement && entitlement.plan !== "free")) && <MathWorkspace key={question.id} attemptId={id} questionId={question.id} readOnly={frozen} onPending={setMathPending} onConfirm={text=>edit({...responses,[question.id]:text},flags)}/>}
          <div className="question-controls">
            <button
              className="button secondary small"
              disabled={index === 0 || mathPending}
              onClick={() => setIndex((i) => i - 1)}
            >
              <ArrowLeft size={16} />
              Previous
            </button>
            <button
              className={`flag-button ${flags.includes(question.id) ? "flagged" : ""}`}
              disabled={frozen}
              aria-pressed={flags.includes(question.id)}
              onClick={() =>
                edit(
                  responses,
                  flags.includes(question.id)
                    ? flags.filter((x) => x !== question.id)
                    : [...flags, question.id],
                )
              }
            >
              <Flag size={16} />
              {flags.includes(question.id) ? "Flagged" : "Flag for review"}
            </button>
            <button
              className="button secondary small"
              disabled={index === view.questions.length - 1 || mathPending}
              onClick={() => setIndex((i) => i + 1)}
            >
              Next
              <ArrowRight size={16} />
            </button>
          </div>
        </section>
        <aside className="panel test-navigation">
          <h3>Your progress</h3>
          <p>
            {answered} of {view.questions.length} answered
          </p>
          <div className="question-grid">
            {view.questions.map((q, i) => (
              <button
                key={q.id}
                aria-label={`Question ${i + 1}${flags.includes(q.id) ? ", flagged" : ""}${responses[q.id]?.trim() ? ", answered" : ""}`}
                aria-current={i === index ? "step" : undefined}
                className={`${i === index ? "current" : ""} ${responses[q.id]?.trim() ? "answered" : ""} ${flags.includes(q.id) ? "is-flagged" : ""}`}
                disabled={mathPending}
                onClick={() => setIndex(i)}
              >
                {i + 1}
              </button>
            ))}
          </div>
          <div className="question-legend">
            <span>
              <i className="legend-answered" />
              Answered
            </span>
            <span>
              <Flag size={12} />
              Flagged
            </span>
          </div>
          <p className="helper">
            Answers and explanations will appear after submission.
          </p>
          <button
            className="button full"
            disabled={busy || mathPending}
            onClick={() => void submit()}
          >
            <Send size={16} />
            {busy
              ? "Submitting…"
              : view.attempt.status === "grading"
                ? "Retry grading"
                : "Submit test"}
          </button>
        </aside>
      </div>
    </>
  );
}
function Results({ view }: { view: AttemptView }) {
  const { entitlement } = useWorkspace();
  const p = view.prediction;
  const weak = [
    ...new Set(
      view.results
        .filter((r) => r.points < r.max_points * 0.7)
        .map((r) => r.topic),
    ),
  ];
  return (
    <>
      <Link href="/history" className="back-link">
        <ArrowLeft size={16} />
        Back to history
      </Link>
      <PageHeader
        eyebrow="PRACTICE COMPLETE"
        title="Every answer is a step forward."
        description={`${view.subject} · ${view.exam.name}`}
        action={
          <Link href={`/exams/${view.exam.id}`} className="button secondary">
            <Target size={17} />
            School exam & actual grade
          </Link>
        }
      />
      <div className="results-grid">
        <section className="panel result-score">
          <Badge tone="green">
            <Check size={14} /> PRACTICE SCORE
          </Badge>
          <div className="big-score">{percent(view.attempt.score)}</div>
          <p>
            {view.attempt.earned_points} of {view.attempt.possible_points}{" "}
            points earned
          </p>
          <span className="helper">
            {Math.floor((view.attempt.time_spent_seconds ?? 0) / 60)}m{" "}
            {(view.attempt.time_spent_seconds ?? 0) % 60}s spent practicing
          </span>
        </section>
        <section className="panel prediction-card">
          <span className="eyebrow">
            <Sparkles size={15} /> SCHOOL GRADE ESTIMATE
          </span>
          {p ? (
            <>
              <div className="prediction-line">
                <strong>{percent(p.predicted)}</strong>
                <Badge tone="purple">{p.confidence} confidence</Badge>
              </div>
              <p className="range-label">
                Estimated range{" "}
                <strong>
                  {p.lower}–{p.upper}%
                </strong>
              </p>
              <div className="range-track">
                <span
                  style={{
                    left: `${p.lower}%`,
                    width: `${p.upper - p.lower}%`,
                  }}
                />
                <i style={{ left: `${p.predicted}%` }} />
              </div>
              <p className="helper">{p.explanation}</p>
              <details>
                <summary>How this forecast was made</summary>
                <p className="helper">
                  {p.features.weightedAverage !== undefined && (
                    <>Recent-weighted practice: {percent(p.features.weightedAverage)} · </>
                  )}
                  Latest practice: {percent(p.features.latest)} · Average:{" "}
                  {percent(p.features.average)} · Improvement:{" "}
                  {p.features.improvement.toFixed(1)} pp ·{" "}
                  {p.features.attemptCount} attempts. Conservative baseline:{" "}
                  {percent(p.baseline)}. Personal adjustment:{" "}
                  {p.adjustment > 0 ? "+" : ""}
                  {p.adjustment} pp from {p.sample_size} distinct school exams.
                  Saved using {p.model_version}.
                </p>
              </details>
            </>
          ) : (
            <p>
              {entitlement && !entitlement.predictions ? <>Your results are saved. <Link href="/pricing">Unlock grade predictions with a paid plan →</Link></> : "No forecast was saved because an actual grade was already recorded for this exam."}
            </p>
          )}
        </section>
      </div>
      {weak.length > 0 && (
        <section className="panel weakness-callout">
          <div>
            <h2>Your next best step</h2>
            <p>Spend a little extra time on these topics:</p>
            <div className="tag-list">
              {weak.map((t) => (
                <Badge tone="orange" key={t}>
                  {t}
                </Badge>
              ))}
            </div>
          </div>
          <Link
            className="button secondary"
            href={`/create?subject=${encodeURIComponent(view.subject)}&material=${view.test.material_id}&topics=${encodeURIComponent(weak.slice(0, 10).join(", "))}`}
          >
            <Sparkles size={16} />
            Practice weak topics
          </Link>
        </section>
      )}
      <section className="panel review-panel">
        <div className="panel-heading">
          <div>
            <h2>Understand every answer</h2>
            <p>
              Review the reasoning, not just the score. Written grading is
              AI-assisted and may need your review.
            </p>
          </div>
        </div>
        {view.questions.map((question, index) => {
          const q = question as Question;
          const r = view.results.find((r) => r.question_id === q.id)!;
          return (
            <article key={q.id} className="answer-review">
              <div className="question-heading">
                <span>
                  Question {index + 1} · {q.topic}
                </span>
                <Badge
                  tone={
                    r.points === r.max_points
                      ? "green"
                      : r.points > 0
                        ? "orange"
                        : "red"
                  }
                >
                  {r.points}/{r.max_points} ·{" "}
                  {r.points === r.max_points
                    ? "Correct"
                    : r.points > 0
                      ? "Partial credit"
                      : "Incorrect"}
                </Badge>
              </div>
              {q.passage && <details><summary>Shared passage</summary><p style={{whiteSpace:"pre-wrap"}}>{q.passage}</p></details>}
              <h3>{q.prompt}</h3>
              <div className="review-columns">
                <div>
                  <span className="tiny-label">YOUR ANSWER</span>
                  <p>{r.response || "No answer submitted"}</p>
                </div>
                <div>
                  <span className="tiny-label">EXPECTED ANSWER</span>
                  <p>{q.answer_key}</p>
                </div>
              </div>
              {q.kind !== "multiple_choice" && <details><summary>Original handwritten work</summary><MathWorkspace readOnly attemptId={view.attempt.id} questionId={q.id}/></details>}
              <div className="feedback">
                <strong>Feedback</strong>
                <p>{r.feedback}</p>
              </div>
              <details>
                <summary>Explanation & grading rubric</summary>
                <p>{q.explanation}</p>
                <p>
                  <strong>Rubric:</strong> {q.rubric}
                </p>
              </details>
            </article>
          );
        })}
      </section>
    </>
  );
}
