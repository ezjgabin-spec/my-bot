"use client";
import Link from "next/link";
import { useState } from "react";
import {
  Plus,
  ArrowUpRight,
  Target,
  ClipboardCheck,
  TrendingUp,
  Crosshair,
  Sparkles,
  CalendarDays,
  ArrowRight,
} from "lucide-react";
import { useWorkspace } from "@/components/workspace";
import { PageHeader, Empty, Badge } from "@/components/ui";
import { PerformanceChart } from "@/components/charts";
import { mean, pairedOutcomes } from "@/lib/prediction";
import { dateLabel, percent } from "@/lib/client";
export default function Dashboard() {
  const { state } = useWorkspace();
  const [subjectFilter, setSubjectFilter] = useState("all");
  const completed = state.attempts
    .filter((a) => a.status === "completed")
    .sort((a, b) => Date.parse(b.completed_at!) - Date.parse(a.completed_at!));
  const pairs = pairedOutcomes(state.predictions, state.grades, state.exams);
  const upcoming = state.exams
    .filter((e) => !state.grades.some((g) => g.exam_id === e.id))
    .sort((a, b) =>
      (a.exam_date ?? "9999").localeCompare(b.exam_date ?? "9999"),
    );
  const filtered = completed.filter(
    (a) =>
      subjectFilter === "all" ||
      state.exams.find((e) => e.id === a.exam_id)?.subject_id === subjectFilter,
  );
  const chart = filtered
    .slice(0, 10)
    .reverse()
    .map((a, i) => ({
      name: `${i + 1} · ${new Date(a.completed_at!).toLocaleDateString(undefined, { month: "short", day: "numeric" })}`,
      practice: a.score!,
    }));
  const stats = [
    {
      label: "Practice tests completed",
      value: String(completed.length),
      detail: "Every attempt is a step forward",
      icon: ClipboardCheck,
      tone: "purple",
    },
    {
      label: "Average practice score",
      value: completed.length
        ? percent(mean(completed.map((a) => a.score!)))
        : "—",
      detail: "Across your completed attempts",
      icon: TrendingUp,
      tone: "blue",
    },
    {
      label: "Average school grade",
      value: state.grades.length
        ? percent(mean(state.grades.map((g) => g.grade)))
        : "—",
      detail: "From actual results you enter",
      icon: Target,
      tone: "green",
    },
    {
      label: "Prediction error",
      value: pairs.length
        ? `${mean(pairs.map((p) => Math.abs(p.error))).toFixed(1)} pp`
        : "—",
      detail: pairs.length
        ? `${pairs.length} paired exams · lower is better`
        : "Add actual grades to measure accuracy",
      icon: Crosshair,
      tone: "orange",
    },
  ];
  return (
    <>
      <PageHeader
        eyebrow="YOUR LEARNING, IN FOCUS"
        title="Make your next exam your best."
        description="A little more practice. A lot more clarity."
        action={
          <Link href="/create" className="button">
            <Plus size={18} />
            Create practice test
          </Link>
        }
      />
      <section className="hero-card">
        <div className="hero-copy">
          <Badge tone="purple">
            <Sparkles size={13} /> BUILT AROUND YOU
          </Badge>
          <h2>
            Less guessing.
            <br />
            <span>More knowing.</span>
          </h2>
          <p>
            Practice from your own notes, find what needs work, and see an
            honest estimate of your next exam grade.
          </p>
          <Link href="/create" className="button light">
            Let’s get practicing <ArrowRight size={17} />
          </Link>
          <span className="hero-footnote">
            Your materials. Your pace. Your progress.
          </span>
        </div>
        <div className="hero-art" aria-hidden="true">
          <div className="orbit orbit-one" />
          <div className="orbit orbit-two" />
          <div className="orbit orbit-three" />
          <span className="star star-one">✦</span>
          <span className="star star-two">✦</span>
          <div className="art-card art-back">
            <span className="art-icon">
              <ClipboardCheck size={22} />
            </span>
            <span className="art-line" />
            <span className="art-line short" />
            <div className="art-bars">
              {[35, 50, 45, 70, 60, 82, 95].map((h, i) => (
                <i key={i} style={{ height: `${h}%` }} />
              ))}
            </div>
          </div>
          <div className="art-chip">
            <span>
              <Target size={21} />
            </span>
            <div>
              Practice with purpose<strong>Progress you can see</strong>
            </div>
            <Sparkles size={16} />
          </div>
        </div>
      </section>
      <section className="stats-grid" aria-label="Study statistics">
        {stats.map(({ label, value, detail, icon: Icon, tone }) => (
          <article className="stat-card" key={label}>
            <div className="stat-top">
              <span>{label}</span>
              <span className={`stat-icon ${tone}`}>
                <Icon size={18} />
              </span>
            </div>
            <strong>{value}</strong>
            <p>{detail}</p>
          </article>
        ))}
      </section>
      <div className="dashboard-grid">
        <section className="panel">
          <div className="panel-heading">
            <div>
              <h2>Your progress, over time</h2>
              <p>Small steps add up.</p>
            </div>
            <select
              aria-label="Filter progress by subject"
              value={subjectFilter}
              onChange={(e) => setSubjectFilter(e.target.value)}
            >
              <option value="all">All subjects</option>
              {state.subjects.map((s) => (
                <option value={s.id} key={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </div>
          {chart.length ? (
            <PerformanceChart data={chart} />
          ) : (
            <Empty
              title="Your progress starts here"
              text="Complete your first practice test to see your scores grow over time."
              href="/create"
              action="Create your first test"
            />
          )}
        </section>
        <section className="panel">
          <div className="panel-heading">
            <div>
              <h2>On the horizon</h2>
              <p>Your upcoming school exams</p>
            </div>
            <CalendarDays size={19} className="muted" />
          </div>
          {upcoming.length ? (
            <div className="exam-list">
              {upcoming.slice(0, 4).map((e) => (
                <Link href={`/exams/${e.id}`} key={e.id} className="exam-row">
                  <span className="subject-symbol">
                    {state.subjects
                      .find((s) => s.id === e.subject_id)
                      ?.name.slice(0, 2)}
                  </span>
                  <span>
                    <strong>{e.name}</strong>
                    <small>
                      {state.subjects.find((s) => s.id === e.subject_id)?.name}{" "}
                      · {dateLabel(e.exam_date)}
                    </small>
                  </span>
                  <ArrowUpRight size={16} />
                </Link>
              ))}
            </div>
          ) : (
            <Empty
              title="Room for your next goal"
              text="Add a school exam when you create a practice test. We’ll keep it here."
              href="/create"
              action="Plan your next exam"
            />
          )}
        </section>
      </div>
      <section className="panel recent-panel">
        <div className="panel-heading">
          <div>
            <h2>Recent practice</h2>
            <p>Pick up where you left off, or see how you did.</p>
          </div>
          <Link href="/history" className="text-link">
            View all <ArrowUpRight size={16} />
          </Link>
        </div>
        {state.attempts.length ? (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>School exam</th>
                  <th>Subject</th>
                  <th>Date</th>
                  <th>Status</th>
                  <th>Score</th>
                  <th>
                    <span className="sr-only">View</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {[...state.attempts]
                  .sort(
                    (a, b) =>
                      Date.parse(b.started_at) - Date.parse(a.started_at),
                  )
                  .slice(0, 5)
                  .map((a) => {
                    const exam = state.exams.find((e) => e.id === a.exam_id);
                    return (
                      <tr key={a.id}>
                        <td>
                          <Link href={`/attempts/${a.id}`}>{exam?.name}</Link>
                        </td>
                        <td>
                          {
                            state.subjects.find(
                              (s) => s.id === exam?.subject_id,
                            )?.name
                          }
                        </td>
                        <td>{dateLabel(a.started_at)}</td>
                        <td>
                          <Badge
                            tone={a.status === "completed" ? "green" : "purple"}
                          >
                            {a.status.replaceAll("_", " ")}
                          </Badge>
                        </td>
                        <td className="score-cell">{percent(a.score)}</td>
                        <td>
                          <Link
                            href={`/attempts/${a.id}`}
                            aria-label={`Open ${exam?.name}`}
                          >
                            <ArrowUpRight size={18} />
                          </Link>
                        </td>
                      </tr>
                    );
                  })}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="empty-inline">
            <ClipboardCheck size={30} />
            <div>
              <h3>A fresh start, full of possibility.</h3>
              <p>Your completed tests and saved attempts will appear here.</p>
            </div>
            <Link href="/create" className="button secondary small">
              Create a test <Plus size={16} />
            </Link>
          </div>
        )}
      </section>
    </>
  );
}
