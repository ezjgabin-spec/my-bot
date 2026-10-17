"use client";
import Link from "next/link";
import { useSyncExternalStore } from "react";
import { Activity, ArrowUpRight, Layers, Radar, Timer } from "lucide-react";
import { useWorkspace } from "./workspace";
import { mean } from "@/lib/prediction";
import { percent } from "@/lib/client";
const subscribeClock = () => () => {};

export function ForecastOrbit() {
  const { state } = useWorkspace();
  const latest = [...state.predictions].sort(
    (a, b) => Date.parse(b.created_at) - Date.parse(a.created_at),
  )[0];
  return (
    <div className="forecast-orbit">
      <div className="orbital-ring ring-a" aria-hidden="true" />
      <div className="orbital-ring ring-b" aria-hidden="true" />
      <div className="orbital-ring ring-c" aria-hidden="true" />
      <div className="orbit-core">
        <span className="signal-label">LATEST FORECAST</span>
        <strong>{latest ? percent(latest.predicted) : "—"}</strong>
        <span>{latest ? latest.subject : "Your next chapter"}</span>
        <small>
          {latest
            ? `${latest.lower}–${latest.upper}% estimated range`
            : "Complete a test to unlock"}
        </small>
      </div>
      <div className="orbit-caption">
        <Radar size={14} />{" "}
        {latest
          ? `${latest.confidence} confidence · ${latest.sample_size} paired exams`
          : "Built from practice, calibrated with results"}
      </div>
    </div>
  );
}

export function StudySignals() {
  const { state } = useWorkspace();
  const mounted = useSyncExternalStore(
    subscribeClock,
    () => true,
    () => false,
  );
  const completed = state.attempts.filter((a) => a.status === "completed");
  const minutes = Math.round(
    completed.reduce((sum, a) => sum + (a.time_spent_seconds ?? 0), 0) / 60,
  );
  const subjects = state.subjects
    .map((subject) => {
      const exams = new Set(
        state.exams.filter((e) => e.subject_id === subject.id).map((e) => e.id),
      );
      const attempts = completed.filter((a) => exams.has(a.exam_id));
      return {
        ...subject,
        count: attempts.length,
        score: attempts.length ? mean(attempts.map((a) => a.score!)) : null,
      };
    })
    .filter((s) => s.count)
    .sort((a, b) => b.count - a.count);
  const today = new Date();
  const days = Array.from({ length: mounted ? 28 : 0 }, (_, index) => {
    const date = new Date(
      today.getFullYear(),
      today.getMonth(),
      today.getDate() - 27 + index,
    );
    const count = completed.filter(
      (a) => new Date(a.completed_at!).toDateString() === date.toDateString(),
    ).length;
    return {
      label: date.toLocaleDateString(undefined, {
        month: "short",
        day: "numeric",
      }),
      count,
    };
  });
  const activeDays = days.filter((d) => d.count).length;
  const recent = [...completed].sort(
    (a, b) => Date.parse(b.completed_at!) - Date.parse(a.completed_at!),
  );
  const change =
    recent.length >= 2 ? recent[0].score! - recent[1].score! : null;
  return (
    <>
      <div className="signal-strip" aria-label="Study activity summary">
        <span>
          <span className="signal-beacon" aria-hidden="true" /> YOUR STUDY
          SIGNALS
        </span>
        <span>
          <Timer size={14} />
          <b>{minutes}</b> minutes practiced
        </span>
        <span>
          <Layers size={14} />
          <b>{state.answers.length}</b> questions graded
        </span>
        <span>
          <Activity size={14} />
          <b>
            {change === null
              ? "—"
              : `${change > 0 ? "+" : ""}${change.toFixed(1)} pp`}
          </b>{" "}
          latest score change
        </span>
      </div>
      <div className="signals-grid">
        <section className="panel activity-panel">
          <div className="panel-heading">
            <div>
              <span className="signal-label">CONSISTENCY</span>
              <h2>Your practice rhythm</h2>
            </div>
            <Activity className="cyan" size={20} />
          </div>
          <div className="activity-summary">
            <strong>
              {activeDays}
              <small>/ 28 days</small>
            </strong>
            <p>
              Days with a completed test
              <br />
              Over the past four weeks
            </p>
          </div>
          <div
            className="activity-map"
            aria-label="Practice activity for the last 28 days"
          >
            {days.map((day) => (
              <span
                key={day.label}
                tabIndex={0}
                className={`activity-cell level-${Math.min(day.count, 3)}`}
                aria-label={`${day.label}: ${day.count} completed tests`}
                data-tooltip={`${day.label} · ${day.count} tests`}
              />
            ))}
          </div>
          <div className="activity-legend">
            <span>28 days ago</span>
            <span>Today</span>
          </div>
          <p className="helper">
            Each illuminated cell is a day you showed up.
          </p>
        </section>
        <section className="panel subject-panel">
          <div className="panel-heading">
            <div>
              <span className="signal-label">SUBJECT PERFORMANCE</span>
              <h2>Your knowledge spectrum</h2>
            </div>
            <Link
              href="/analytics"
              className="icon-button"
              aria-label="Explore subject analytics"
            >
              <ArrowUpRight size={19} />
            </Link>
          </div>
          {subjects.length ? (
            <div className="spectrum-list">
              {subjects.slice(0, 5).map((s) => (
                <div key={s.id} className="spectrum-row">
                  <div>
                    <strong>{s.name}</strong>
                    <span>
                      {percent(s.score)} <small>· {s.count} tests</small>
                    </span>
                  </div>
                  <div
                    className="spectrum-track"
                    role="meter"
                    aria-label={`${s.name} average practice score`}
                    aria-valuemin={0}
                    aria-valuemax={100}
                    aria-valuenow={s.score!}
                  >
                    <i style={{ width: `${s.score}%` }} />
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="spectrum-empty">
              <div className="spectrum-decoration" aria-hidden="true">
                <i />
                <i />
                <i />
                <i />
                <i />
              </div>
              <h3>A clearer picture is coming.</h3>
              <p>Complete a practice test to reveal your subject scores.</p>
              <Link className="text-link" href="/create">
                Start your first test <ArrowUpRight size={14} />
              </Link>
            </div>
          )}
        </section>
      </div>
    </>
  );
}
