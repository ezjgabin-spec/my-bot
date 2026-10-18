"use client";
import Link from "next/link";
import { useState } from "react";
import { Target, ArrowUpRight, Sparkles } from "lucide-react";
import { useWorkspace } from "@/components/workspace";
import { useAppearance } from "@/components/appearance-provider";
import { AdvancedAnalytics } from "@/components/advanced-analytics";
import { PageHeader, Empty, Badge } from "@/components/ui";
import { PerformanceChart } from "@/components/charts";
import { StudySignals } from "@/components/study-signals";
import { mean, pairedOutcomes } from "@/lib/prediction";
import { dateLabel, percent } from "@/lib/client";
export default function Analytics() {
  const { state } = useWorkspace();
  const { appearance } = useAppearance();
  const [subject, setSubject] = useState("all");
  const pairs = pairedOutcomes(state.predictions, state.grades, state.exams)
    .filter((p) => subject === "all" || p.prediction.subject === subject)
    .sort(
      (a, b) =>
        Date.parse(a.grade.recorded_at) - Date.parse(b.grade.recorded_at),
    );
  const mae = pairs.length ? mean(pairs.map((p) => Math.abs(p.error))) : null;
  const recent = pairs.slice(-5);
  const previous = pairs.slice(-10, -5);
  const change =
    previous.length === 5 && recent.length === 5
      ? mean(previous.map((p) => Math.abs(p.error))) -
        mean(recent.map((p) => Math.abs(p.error)))
      : null;
  const topics = new Map<
    string,
    {
      earned: number;
      possible: number;
      count: number;
      subject: string;
      topic: string;
    }
  >();
  state.answers.forEach((a) => {
    const attempt = state.attempts.find((x) => x.id === a.attempt_id);
    const exam = state.exams.find((e) => e.id === attempt?.exam_id);
    const subjectName =
      state.subjects.find((s) => s.id === exam?.subject_id)?.name ??
      "Unknown subject";
    if (subject !== "all" && subject !== subjectName) return;
    const key = subjectName + "::" + a.topic;
    const entry = topics.get(key) ?? {
      earned: 0,
      possible: 0,
      count: 0,
      subject: subjectName,
      topic: a.topic,
    };
    entry.earned += a.points;
    entry.possible += a.max_points;
    entry.count++;
    topics.set(key, entry);
  });
  const weak = [...topics.values()]
    .filter((t) => t.earned / t.possible < 0.7)
    .sort((a, b) => a.earned / a.possible - b.earned / b.possible)
    .slice(0, 8);
  if (appearance.dashboard === "advanced") return <AdvancedAnalytics />;
  return (
    <>
      <PageHeader
        eyebrow="PREDICTIONS, MEET REALITY"
        title="Better data. Clearer expectations."
        description="See how your forecasts compare with real school results."
        action={
          <Link href="/history" className="button secondary">
            <Target size={16} />
            Enter actual grades
          </Link>
        }
      />
      <StudySignals />
      <div className="filter-row">
        <label>
          Subject
          <select value={subject} onChange={(e) => setSubject(e.target.value)}>
            <option value="all">All subjects</option>
            {state.subjects.map((s) => (
              <option key={s.id}>{s.name}</option>
            ))}
          </select>
        </label>
        <span className="muted">One outcome per school exam</span>
      </div>
      <div className="stats-grid analytics-stats">
        <article className="stat-card">
          <span>Mean absolute prediction error</span>
          <strong>{mae === null ? "—" : `${mae.toFixed(1)} pp`}</strong>
          <p>Percentage points · lower is better</p>
        </article>
        <article className="stat-card">
          <span>Paired school exams</span>
          <strong>{pairs.length}</strong>
          <p>Repeated attempts count as one outcome</p>
        </article>
        <article className="stat-card">
          <span>Recent accuracy trend</span>
          <strong>
            {change === null
              ? "Not enough data"
              : `${Math.abs(change).toFixed(1)} pp ${change >= 0 ? "better" : "worse"}`}
          </strong>
          <p>Last 5 vs. previous 5 school exams</p>
        </article>
      </div>
      <section className="panel">
        <div className="panel-heading">
          <div>
            <h2>Predicted vs. actual</h2>
            <p>Original forecasts, compared with the grades you earned.</p>
          </div>
          <Badge tone="purple">Personal calibration</Badge>
        </div>
        {pairs.length ? (
          <PerformanceChart
            actual
            data={pairs.map((p, i) => ({
              name: `${i + 1} · ${p.prediction.subject}`,
              predicted: p.prediction.predicted,
              actual: p.grade.grade,
            }))}
          />
        ) : (
          <Empty
            title="Let’s give your predictions a reality check"
            text="Complete a practice test, then enter the actual school grade. Your first comparison will appear here."
            href="/history"
            action="View school exams"
          />
        )}
      </section>
      <div className="dashboard-grid analytics-lower">
        <section className="panel">
          <div className="panel-heading">
            <div>
              <h2>Accuracy by subject</h2>
              <p>Mean absolute error from paired exams</p>
            </div>
          </div>
          {pairs.length ? (
            <div className="subject-accuracy">
              {[...new Set(pairs.map((p) => p.prediction.subject))].map((s) => {
                const ps = pairs.filter((p) => p.prediction.subject === s);
                return (
                  <div key={s}>
                    <span>
                      <strong>{s}</strong>
                      <small>{ps.length} school exams</small>
                    </span>
                    <Badge tone="purple">
                      {mean(ps.map((p) => Math.abs(p.error))).toFixed(1)} pp
                    </Badge>
                  </div>
                );
              })}
            </div>
          ) : (
            <Empty
              title="Each subject has its own story"
              text="Add school grades to see subject-level prediction error."
            />
          )}
        </section>
        <section className="panel">
          <div className="panel-heading">
            <div>
              <h2>Where to focus next</h2>
              <p>Topics below 70% in the selected subjects</p>
            </div>
            <Sparkles size={18} />
          </div>
          {weak.length ? (
            <div className="weak-topics">
              {weak.map((t) => (
                <div key={t.subject + "::" + t.topic}>
                  <div>
                    <strong>{t.topic}</strong>
                    <span>
                      {t.subject} · {percent((t.earned / t.possible) * 100)} ·{" "}
                      {t.count} questions
                    </span>
                  </div>
                  <Link
                    aria-label={`Practice ${t.topic}`}
                    href={`/create?subject=${encodeURIComponent(t.subject)}&topics=${encodeURIComponent(t.topic)}`}
                  >
                    <ArrowUpRight size={17} />
                  </Link>
                </div>
              ))}
            </div>
          ) : (
            <Empty
              title="Find your next opportunity"
              text={
                state.answers.length
                  ? "No topics are currently below 70%. Keep practicing to build a fuller picture."
                  : "Complete a test to discover which topics could use more practice."
              }
            />
          )}
        </section>
      </div>
      <section className="panel">
        <div className="panel-heading">
          <div>
            <h2>The evidence behind the estimate</h2>
            <p>
              Only forecasts made before a recorded outcome and on or before the
              school exam date are compared.
            </p>
          </div>
        </div>
        {pairs.length ? (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Exam</th>
                  <th>Latest practice</th>
                  <th>Predicted</th>
                  <th>Actual</th>
                  <th>Error</th>
                  <th>Attempts at forecast</th>
                </tr>
              </thead>
              <tbody>
                {[...pairs]
                  .reverse()
                  .map(({ exam, prediction: p, grade, error }) => (
                    <tr key={grade.exam_id}>
                      <td>
                        <Link href={`/exams/${grade.exam_id}`}>
                          {exam?.name}
                        </Link>
                        <small>{dateLabel(grade.recorded_at)}</small>
                      </td>
                      <td>{percent(p.features.latest)}</td>
                      <td>{percent(p.predicted)}</td>
                      <td className="score-cell">{percent(grade.grade)}</td>
                      <td>
                        {error > 0 ? "+" : ""}
                        {error.toFixed(1)} pp
                      </td>
                      <td>{p.features.attemptCount}</td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="empty-inline">
            <p>
              No paired results yet. We won’t estimate accuracy until there is
              real evidence.
            </p>
          </div>
        )}
      </section>
    </>
  );
}
