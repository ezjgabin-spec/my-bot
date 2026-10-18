"use client";
import Link from "next/link";
import { useState } from "react";
import {
  ArrowRight, ArrowUpRight, Activity, BarChart3, BrainCircuit,
  CalendarDays, ChevronRight, CircleDot, Crosshair,
  Layers3, Plus, Radar, Sparkles, Target, TrendingUp,
} from "lucide-react";
import { useWorkspace } from "./workspace";
import { PerformanceChart } from "./charts";
import { mean, pairedOutcomes } from "@/lib/prediction";
import { dateLabel, percent } from "@/lib/client";

export function AdvancedDashboard() {
  const { state } = useWorkspace();
  const [subjectId, setSubjectId] = useState("all");
  const completed = state.attempts
    .filter((a) => a.status === "completed")
    .sort((a, b) => Date.parse(b.completed_at!) - Date.parse(a.completed_at!));
  const recent = completed.filter(
    (a) => subjectId === "all" ||
      state.exams.find((e) => e.id === a.exam_id)?.subject_id === subjectId,
  );
  const points = [...recent].slice(0, 12).reverse().map((a, i) => ({
    name: `T${i + 1}`,
    practice: a.score!,
  }));
  const latest = [...state.predictions].sort(
    (a, b) => Date.parse(b.created_at) - Date.parse(a.created_at),
  )[0];
  const paired = pairedOutcomes(state.predictions, state.grades, state.exams);
  const nextExams = state.exams
    .filter((e) => !state.grades.some((g) => g.exam_id === e.id))
    .sort((a, b) => (a.exam_date ?? "9999").localeCompare(b.exam_date ?? "9999"));
  const subjectRows = state.subjects.map((subject) => {
    const exams = new Set(state.exams.filter((e) => e.subject_id === subject.id).map((e) => e.id));
    const scores = completed.filter((a) => exams.has(a.exam_id)).map((a) => a.score!);
    return { name: subject.name, count: scores.length, score: scores.length ? mean(scores) : null };
  }).filter((s) => s.count > 0).sort((a, b) => b.count - a.count);

  const metrics = [
    { label: "Average practice", value: completed.length ? percent(mean(completed.map((x) => x.score!))) : "—", detail: "Across completed tests", icon: Target },
    { label: "Tests analyzed", value: String(completed.length), detail: "Completed sessions", icon: Layers3 },
    { label: "Average school grade", value: state.grades.length ? percent(mean(state.grades.map((x) => x.grade))) : "—", detail: "From recorded results", icon: TrendingUp },
    { label: "Prediction error", value: paired.length ? `${mean(paired.map((x) => Math.abs(x.error))).toFixed(1)} pp` : "—", detail: paired.length ? `${paired.length} calibrated outcomes` : "Waiting for school results", icon: Crosshair },
  ];
  return (
    <div className="advanced-dashboard">
      <div className="advanced-topline">
        <span><CircleDot size={14} /> STUDYPREDICT / PERFORMANCE INTELLIGENCE</span>
        <Link href="/settings"><Sparkles size={14} /> Customize dashboard <ChevronRight size={15} /></Link>
      </div>

      <section className="advanced-hero advanced-card">
        <div className="advanced-hero-text">
          <span className="advanced-kicker"><BrainCircuit size={15} /> AI-POWERED LEARNING COMMAND CENTER</span>
          <h1>Turn practice into <span className="gradient-ink">progress.</span></h1>
          <p>See where you stand, find patterns in your results, and prepare smarter for your next exam.</p>
          <div className="advanced-hero-actions">
            <Link className="button" href="/create"><Plus size={16} /> New practice test</Link>
            <Link className="button secondary" href="/analytics">Deep analytics <ArrowUpRight size={16} /></Link>
          </div>
          <div className="advanced-live"><span className="signal-beacon" /> LIVE STUDY INSIGHTS · {completed.length} COMPLETED TESTS</div>
        </div>
        <div className="advanced-forecast">
          <div className="advanced-forecast-top"><Radar size={19} /> LATEST SCHOOL GRADE ESTIMATE <span>FORECAST</span></div>
          <div className="advanced-big-number">{latest ? percent(latest.predicted) : "—"}</div>
          <div className="advanced-forecast-note">
            {latest ? `${latest.subject} · ${latest.confidence} confidence` : "Finish a practice test to unlock a forecast"}
          </div>
          <div className="advanced-range">
            <span>ESTIMATED RANGE</span>
            <strong>{latest ? `${latest.lower}–${latest.upper}%` : "Awaiting results"}</strong>
          </div>
          {latest && <small>Heuristic estimate, not a guaranteed school grade.</small>}
        </div>
      </section>

      <div className="advanced-stats">
        {metrics.map(({ label, value, detail, icon: Icon }, i) => (
          <Link href={i === 1 ? "/history" : "/analytics"} className="advanced-card advanced-metric" key={label}>
            <div><span>{label}</span><Icon size={20} /></div>
            <strong>{value}</strong>
            <small>{detail}</small>
            <ArrowUpRight className="advanced-corner" size={16} />
          </Link>
        ))}
      </div>

      <div className="advanced-columns">
        <section className="advanced-card advanced-analysis">
          <div className="advanced-card-header">
            <div><span className="advanced-kicker">PERFORMANCE TREND</span><h2>Learning trajectory</h2><p>Practice scores across recent sessions</p></div>
            <select value={subjectId} onChange={(e) => setSubjectId(e.target.value)} aria-label="Filter trajectory by subject">
              <option value="all">All subjects</option>
              {state.subjects.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </div>
          {points.length ? <PerformanceChart data={points} /> :
            <div className="advanced-no-data"><BarChart3 size={30} /><strong>Your trajectory will appear here.</strong><span>Complete a test to see your performance over time.</span></div>}
          <Link className="advanced-card-foot" href="/analytics">Explore forecast analytics <ArrowRight size={16} /></Link>
        </section>
        <section className="advanced-card advanced-analysis">
          <div className="advanced-card-header">
            <div><span className="advanced-kicker">KNOWLEDGE MAP</span><h2>Subject performance</h2><p>Average practice score by subject</p></div>
            <Activity size={20} className="advanced-muted-icon" />
          </div>
          {subjectRows.length ? <div className="advanced-bars">
            {subjectRows.slice(0, 6).map((s) => <div className="advanced-bar-row" key={s.name}>
              <div><strong>{s.name}</strong><span>{percent(s.score)} · {s.count} test{s.count !== 1 ? "s" : ""}</span></div>
              <div className="advanced-bar-track" aria-label={`${s.name} average ${percent(s.score)}`} role="meter" aria-valuemin={0} aria-valuemax={100} aria-valuenow={s.score ?? 0}><i style={{ width: `${Math.max(0, Math.min(100, s.score ?? 0))}%` }} /></div>
            </div>)}
          </div> : <div className="advanced-no-data"><BrainCircuit size={30}/><strong>Build your knowledge map.</strong><span>Subject insights appear after you practice.</span></div>}
          <Link className="advanced-card-foot" href="/analytics">View detailed subject analysis <ArrowRight size={16} /></Link>
        </section>
      </div>

      <div className="advanced-columns advanced-bottom">
        <section className="advanced-card advanced-analysis">
          <div className="advanced-card-header"><div><span className="advanced-kicker">RECENT ACTIVITY</span><h2>Latest practice sessions</h2></div><Link href="/history" className="text-link">View all <ArrowUpRight size={15}/></Link></div>
          <div className="advanced-list">
            {completed.length ? completed.slice(0, 5).map((a) => {
              const exam = state.exams.find((e) => e.id === a.exam_id);
              const subject = state.subjects.find((s) => s.id === exam?.subject_id);
              return <Link key={a.id} href={`/attempts/${a.id}`} className="advanced-list-row">
                <span className="advanced-list-icon"><BarChart3 size={17}/></span>
                <span><strong>{exam?.name ?? "Practice test"}</strong><small>{subject?.name ?? "Subject"} · {dateLabel(a.completed_at)}</small></span>
                <b>{percent(a.score)}</b><ChevronRight size={16}/>
              </Link>;
            }) : <div className="advanced-no-data"><span>Your recent tests will appear here.</span></div>}
          </div>
        </section>
        <section className="advanced-card advanced-analysis">
          <div className="advanced-card-header"><div><span className="advanced-kicker">UPCOMING</span><h2>Exams on your radar</h2></div><CalendarDays size={19} className="advanced-muted-icon" /></div>
          <div className="advanced-list">
            {nextExams.length ? nextExams.slice(0, 5).map((e) => <Link key={e.id} href={`/exams/${e.id}`} className="advanced-list-row">
              <span className="advanced-list-icon"><CalendarDays size={17}/></span>
              <span><strong>{e.name}</strong><small>{dateLabel(e.exam_date)}</small></span><ChevronRight size={16}/>
            </Link>) : <div className="advanced-no-data"><span>When you plan an exam, it will appear here.</span><Link className="text-link" href="/create">Add a test <ArrowUpRight size={14}/></Link></div>}
          </div>
        </section>
      </div>
    </div>
  );
}
