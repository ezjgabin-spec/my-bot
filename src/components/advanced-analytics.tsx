"use client";
import Link from "next/link";
import { useState } from "react";
import {
  Activity, ArrowLeft, ArrowRight, ArrowUpRight, BrainCircuit, CheckCircle2,
  CircleDot, Gauge, Radar, ShieldCheck, Sparkles, Target,
} from "lucide-react";
import { useWorkspace } from "./workspace";
import { PerformanceChart } from "./charts";
import { mean, pairedOutcomes } from "@/lib/prediction";
import { dateLabel, percent } from "@/lib/client";

export function AdvancedAnalytics() {
  const { state } = useWorkspace();
  const [subject, setSubject] = useState("all");
  const latest = [...state.predictions]
    .filter((p) => subject === "all" || p.subject === subject)
    .sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at))[0];
  const pairs = pairedOutcomes(state.predictions, state.grades, state.exams)
    .filter((p) => subject === "all" || p.prediction.subject === subject)
    .sort((a, b) => Date.parse(a.grade.recorded_at) - Date.parse(b.grade.recorded_at));
  const error = pairs.length ? mean(pairs.map((p) => Math.abs(p.error))) : null;
  const topicMap = new Map<string, { topic: string; subject: string; earned: number; possible: number; count: number }>();
  for (const answer of state.answers) {
    const attempt = state.attempts.find((a) => a.id === answer.attempt_id);
    const exam = state.exams.find((e) => e.id === attempt?.exam_id);
    const name = state.subjects.find((s) => s.id === exam?.subject_id)?.name ?? "Unknown";
    if (subject !== "all" && name !== subject) continue;
    const key = `${name}::${answer.topic}`;
    const current = topicMap.get(key) ?? { topic: answer.topic, subject: name, earned: 0, possible: 0, count: 0 };
    current.earned += answer.points;
    current.possible += answer.max_points;
    current.count++;
    topicMap.set(key, current);
  }
  const topicRows = [...topicMap.values()].filter((x) => x.possible > 0)
    .sort((a, b) => a.earned / a.possible - b.earned / b.possible);
  const focus = topicRows.filter((x) => x.earned / x.possible < 0.7);
  const predicted = latest ? Math.max(0, Math.min(100, latest.predicted)) : 0;
  const subjects = [...new Set(state.subjects.map((s) => s.name))];
  return (
    <div className="advanced-dashboard advanced-deep-dive">
      <div className="advanced-topline">
        <Link href="/"><ArrowLeft size={14}/> COMMAND CENTER</Link>
        <span><CircleDot size={14} /> FORECAST INTELLIGENCE / ANALYSIS</span>
      </div>
      <div className="advanced-deep-header">
        <div>
          <span className="advanced-kicker"><BrainCircuit size={15}/> PERFORMANCE INTELLIGENCE</span>
          <h1>Know your <span className="gradient-ink">numbers.</span></h1>
          <p>Explore estimates, real outcomes, and skill-level signals. Every value comes from your recorded work.</p>
        </div>
        <label className="advanced-filter-label">Subject
          <select value={subject} onChange={(e) => setSubject(e.target.value)}>
            <option value="all">All subjects</option>
            {subjects.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
        </label>
      </div>
      <div className="advanced-deep-grid">
        <section className="advanced-card advanced-gauge-card">
          <div className="advanced-card-header"><div><span className="advanced-kicker">LATEST ESTIMATE</span><h2>School grade forecast</h2></div><Radar size={20}/></div>
          <div className="advanced-gauge" style={{ "--progress": `${predicted}%` } as React.CSSProperties}>
            <div><strong>{latest ? percent(latest.predicted) : "—"}</strong><span>{latest ? latest.confidence + " confidence" : "No prediction yet"}</span></div>
          </div>
          <div className="advanced-gauge-details">
            <span><small>Estimated range</small><strong>{latest ? `${latest.lower}–${latest.upper}%` : "—"}</strong></span>
            <span><small>Calibration outcomes</small><strong>{pairs.length}</strong></span>
          </div>
          <p className="advanced-disclaimer">Forecasts are heuristic estimates, not statistically guaranteed school grades. Accuracy improves only when real results are recorded.</p>
        </section>
        <section className="advanced-card advanced-analysis advanced-forecast-history">
          <div className="advanced-card-header"><div><span className="advanced-kicker">CALIBRATION</span><h2>Predicted vs. actual</h2><p>How your previous estimates compare with school grades</p></div><Activity size={19}/></div>
          {pairs.length ? <PerformanceChart actual data={pairs.map((p, i) => ({
            name: `E${i + 1}`, predicted: p.prediction.predicted, actual: p.grade.grade,
          }))} /> : <div className="advanced-no-data"><Gauge size={30}/><strong>No paired outcomes yet.</strong><span>Record a real school grade after taking a practice test to unlock calibration.</span></div>}
          <div className="advanced-three-stats">
            <span><small>Mean absolute error</small><strong>{error === null ? "—" : `${error.toFixed(1)} pp`}</strong></span>
            <span><small>Paired exams</small><strong>{pairs.length}</strong></span>
            <span><small>Best next step</small><strong>{pairs.length ? "Keep tracking" : "Record a grade"}</strong></span>
          </div>
        </section>
      </div>
      <div className="advanced-columns">
        <section className="advanced-card advanced-analysis">
          <div className="advanced-card-header"><div><span className="advanced-kicker">MASTERY BREAKDOWN</span><h2>Topic-level performance</h2><p>Based on graded practice questions</p></div><Target size={20}/></div>
          {topicRows.length ? <div className="advanced-bars">
            {topicRows.slice(0, 10).map((row) => {
              const mastery = (100 * row.earned) / row.possible;
              return <div key={row.subject + "::" + row.topic} className="advanced-bar-row">
                <div><strong>{row.topic}</strong><span>{row.subject} · {percent(mastery)} · {row.count} questions</span></div>
                <div role="meter" aria-label={`${row.topic} score`} aria-valuemin={0} aria-valuemax={100} aria-valuenow={mastery} className="advanced-bar-track"><i style={{ width: `${Math.max(0, Math.min(100, mastery))}%` }}/></div>
              </div>;
            })}
          </div> : <div className="advanced-no-data"><span>Topic strengths and gaps appear after grading your first practice test.</span></div>}
        </section>
        <section className="advanced-card advanced-analysis">
          <div className="advanced-card-header"><div><span className="advanced-kicker">ACTION ENGINE</span><h2>What to work on next</h2><p>Topics currently under 70%</p></div><Sparkles size={19}/></div>
          {focus.length ? <div className="advanced-list">
            {focus.slice(0, 7).map((row) => <Link key={row.subject + "::" + row.topic} href={`/create?subject=${encodeURIComponent(row.subject)}&topics=${encodeURIComponent(row.topic)}`} className="advanced-list-row">
              <span className="advanced-list-icon"><Target size={17}/></span>
              <span><strong>{row.topic}</strong><small>{row.subject} · {percent((row.earned / row.possible) * 100)}</small></span>
              <ArrowUpRight size={17}/>
            </Link>)}
          </div> : <div className="advanced-no-data"><CheckCircle2 size={28}/><strong>No flagged topics yet.</strong><span>Continue practicing to build a more complete picture of your skills.</span></div>}
          <Link className="advanced-card-foot" href="/create">Make a targeted practice test <ArrowRight size={15}/></Link>
        </section>
      </div>
      <section className="advanced-card advanced-analysis">
        <div className="advanced-card-header"><div><span className="advanced-kicker">TRANSPARENT FORECASTING</span><h2>Calibration history</h2><p>Only recorded exam results are used to measure forecast error</p></div><ShieldCheck size={19}/></div>
        {pairs.length ? <div className="advanced-table-wrap"><table><thead><tr><th>School exam</th><th>Predicted</th><th>Actual</th><th>Error</th><th>Date</th><th></th></tr></thead>
          <tbody>{[...pairs].reverse().map((p) => <tr key={p.grade.exam_id}>
            <td>{p.exam?.name ?? p.prediction.subject}</td>
            <td>{percent(p.prediction.predicted)}</td>
            <td>{percent(p.grade.grade)}</td>
            <td>{p.error > 0 ? "+" : ""}{p.error.toFixed(1)} pp</td>
            <td>{dateLabel(p.grade.recorded_at)}</td>
            <td><Link href={`/exams/${p.grade.exam_id}`} aria-label="Open school exam"><ArrowUpRight size={16}/></Link></td>
          </tr>)}</tbody></table></div> : <div className="advanced-no-data"><span>Add actual school grades to compare them against your forecasts.</span><Link href="/history" className="text-link">Open exam history <ArrowUpRight size={14}/></Link></div>}
      </section>
    </div>
  );
}
