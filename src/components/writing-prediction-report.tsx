import { ArrowDown, BookOpenCheck, CircleHelp, TrendingUp, BarChart3 } from "lucide-react";
import type { GradeFeedback } from "@/lib/writing-types";
import styles from "./writing-prediction-report.module.css";

type Props = {
  feedback: GradeFeedback;
  actualGrade?: number;
  actualLetter?: string;
};

const bounded = (n: number) => Math.min(100, Math.max(0, n));
export function WritingPredictionReport({ feedback, actualGrade, actualLetter }: Props) {
  const lower = bounded(feedback.lower);
  const upper = Math.max(lower, bounded(feedback.upper));
  const midpoint = (lower + upper) / 2;
  const hasNumericTeacherResult = typeof actualGrade === "number" && Number.isFinite(actualGrade);
  const difference = hasNumericTeacherResult ? actualGrade - midpoint : null;
  const teacherLabel = [
    actualLetter,
    hasNumericTeacherResult ? actualGrade.toFixed(1) + "%" : undefined,
  ].filter(Boolean).join(" · ");

  return (
    <div className={styles.report}>
      <div className={styles.hero}>
        <div>
          <span className={styles.eyebrow}>PREDICTED ESSAY RESULT</span>
          <div className={styles.range}>{lower.toFixed(0)}–{upper.toFixed(0)}<span>%</span></div>
          <p>Estimated grade range · {feedback.confidence} confidence</p>
        </div>
        <div className={styles.letter}>
          <span>Likely letter</span>
          <strong>{feedback.likelyLetter}</strong>
          <small>Teacher grading can differ</small>
        </div>
      </div>
      <div className={styles.scale} role="img" aria-label={"Predicted score from " + lower.toFixed(0) + " to " + upper.toFixed(0) + " percent"}>
        <div className={styles.track}>
          <div className={styles.window} style={{ left: lower + "%", width: Math.max(1.5, upper - lower) + "%" }} />
          <i className={styles.center} style={{ left: midpoint + "%" }} />
        </div>
        <div className={styles.scaleLabels}><span>0%</span><span>50%</span><span>100%</span></div>
      </div>

      <section className={styles.block} aria-label="Prediction breakdown">
        <h3><BarChart3 size={18} /> Prediction vs. teacher result</h3>
        <div className={styles.comparisonLegend}>
          <span><i className={styles.predictedKey} /> Predicted midpoint: {midpoint.toFixed(1)}%</span>
          <span><i className={styles.actualKey} /> Teacher: {teacherLabel || "Not recorded"}</span>
        </div>
        <div className={styles.barLabel}>Estimated midpoint</div>
        <div className={styles.comparisonTrack} role="img" aria-label={"Predicted midpoint " + midpoint.toFixed(1) + " percent"}>
          <span className={styles.predictedBar} style={{ width: midpoint + "%" }} />
        </div>
        <div className={styles.barLabel}>Actual teacher percentage</div>
        {hasNumericTeacherResult ? (
          <div className={styles.comparisonTrack} role="img" aria-label={"Teacher grade " + actualGrade.toFixed(1) + " percent"}>
            <span className={styles.actualBar} style={{ width: bounded(actualGrade) + "%" }} />
          </div>
        ) : <p className={styles.noPercent}>
          {actualLetter ? "Letter grade saved. Add the exact percentage if your teacher provides one to unlock a numeric comparison." : "Add your teacher result below to compare it with this estimate."}
        </p>}
        {difference !== null && actualGrade !== undefined && (
          <p className={styles.difference}>
            {Math.abs(difference).toFixed(1)} percentage points {difference < 0 ? "below" : difference > 0 ? "above" : "from"} the forecast midpoint.
            {" "}{actualGrade >= lower && actualGrade <= upper ? "Inside the predicted range." : "Outside the predicted range."}
          </p>
        )}
        <p className={styles.graphNote}>The midpoint is only the center of the saved range, not a second AI prediction. Rubric criteria are qualitative; numerical sub-scores are not invented.</p>
      </section>

      <section className={styles.block}>
        <h3><BookOpenCheck size={18} /> Why the essay received this estimate</h3>
        <p>{feedback.overview}</p>
      </section>
      <div className={styles.twoColumns}>
        <section className={styles.block}>
          <h3><TrendingUp size={18} /> What is working</h3>
          <ol>{feedback.strengths.map((item, index) => <li key={index}>{item}</li>)}</ol>
        </section>
        <section className={styles.block}>
          <h3><ArrowDown size={18} /> Highest-impact improvements</h3>
          <ol>{feedback.priorities.map((item, index) => <li key={index}>{item}</li>)}</ol>
        </section>
      </div>
      {feedback.criteria.length > 0 && (
        <section className={styles.block}>
          <h3><BookOpenCheck size={18} /> Criteria-by-criteria breakdown</h3>
          <div className={styles.criteria}>
            {feedback.criteria.map((criterion, index) => (
              <article className={styles.criterion} key={index}>
                <strong><span className={styles.criterionNumber}>{index + 1}</span>{criterion.name}</strong>
                <p>{criterion.feedback}</p>
              </article>
            ))}
          </div>
        </section>
      )}
      {teacherLabel && <div className={styles.actual}><strong>Recorded teacher result: {teacherLabel}</strong>
        <span>{hasNumericTeacherResult ? (actualGrade >= lower && actualGrade <= upper ? "Inside" : "Outside") + " the predicted range" : "Letter-only result; numerical error unavailable"}</span></div>}
      <p className={styles.disclaimer}><CircleHelp size={15} /> {feedback.limitations} This is an estimate, not a promised teacher grade.</p>
    </div>
  );
}
