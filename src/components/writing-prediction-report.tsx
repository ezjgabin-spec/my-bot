import { ArrowDown, BookOpenCheck, CircleHelp, TrendingUp } from "lucide-react";
import type { GradeFeedback } from "@/lib/writing-types";
import styles from "./writing-prediction-report.module.css";

type Props = {
  feedback: GradeFeedback;
  actualGrade?: number;
};

export function WritingPredictionReport({ feedback, actualGrade }: Props) {
  const lower = Math.max(0, Math.min(100, feedback.lower));
  const upper = Math.max(lower, Math.min(100, feedback.upper));
  const midpoint = (lower + upper) / 2;
  const rangeWidth = Math.max(1.5, upper - lower);

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
          <div className={styles.window} style={{left: String(lower) + "%", width: String(rangeWidth) + "%"}} />
          <i className={styles.center} style={{left: String(midpoint) + "%"}} />
        </div>
        <div className={styles.scaleLabels}><span>0%</span><span>50%</span><span>100%</span></div>
      </div>
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
          <h3><BookOpenCheck size={18} /> Criteria-by-criteria feedback</h3>
          <div className={styles.criteria}>
            {feedback.criteria.map((criterion, index) => (
              <article className={styles.criterion} key={index}>
                <strong>{criterion.name}</strong>
                <p>{criterion.feedback}</p>
              </article>
            ))}
          </div>
        </section>
      )}
      {typeof actualGrade === "number" && Number.isFinite(actualGrade) && (
        <div className={styles.actual}>
          <strong>Teacher result: {actualGrade.toFixed(1)}%</strong>
          <span>{actualGrade >= lower && actualGrade <= upper ? "Inside the predicted range" : "Outside the predicted range"} · Saved teacher outcome</span>
        </div>
      )}
      <p className={styles.disclaimer}><CircleHelp size={15} /> {feedback.limitations} This is an estimate, not a promised teacher grade. Rubric explanations are qualitative, not separate numeric scores.</p>
    </div>
  );
}
