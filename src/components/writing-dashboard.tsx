"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowRight, FilePenLine, Sparkles } from "lucide-react";
import { useWorkspace } from "@/components/workspace";
import type { GradeFeedback } from "@/lib/writing-types";
import styles from "./writing-dashboard.module.css";

type Snapshot = {
  essayId: string;
  essayTitle: string;
  createdAt: string;
  feedback: GradeFeedback;
  actualTeacherGrade?: number;
};

export function WritingDashboard() {
  const { connection, entitlement } = useWorkspace();
  const [latest, setLatest] = useState<Snapshot | null>(null);
  const [loaded, setLoaded] = useState(false);
  const allowed = Boolean(entitlement && (entitlement.family || entitlement.plan !== "free"));

  useEffect(() => {
    if (connection !== "ready" || !allowed) return;
    let cancelled = false;
    fetch("/api/writing/summary", { credentials: "same-origin", cache: "no-store" })
      .then((response) => {
        if (!response.ok) throw new Error("Writing summary unavailable");
        return response.json() as Promise<{ latest: Snapshot | null }>;
      })
      .then((result) => {
        if (!cancelled) { setLatest(result.latest); setLoaded(true); }
      })
      .catch(() => { if (!cancelled) setLoaded(false); });
    return () => { cancelled = true; };
  }, [connection, allowed]);

  if (!allowed || !loaded || !latest) return null;

  const feedback = latest.feedback;
  const href = "/writing?essay=" + encodeURIComponent(latest.essayId);
  return (
    <section className={styles.card} aria-label="Latest essay grade prediction">
      <div className={styles.header}>
        <div><span className={styles.kicker}><Sparkles size={14} /> WRITING INTELLIGENCE</span><h2>Latest essay forecast</h2><p>{latest.essayTitle}</p></div>
        <Link href={href} className={styles.link}>Full analysis <ArrowRight size={16} /></Link>
      </div>
      <div className={styles.body}>
        <div className={styles.score}><span>Predicted range</span><strong>{feedback.lower.toFixed(0)}–{feedback.upper.toFixed(0)}%</strong><small>{feedback.confidence} confidence</small></div>
        <div className={styles.letter}><span>Likely letter</span><strong>{feedback.likelyLetter}</strong><small>Not a guaranteed grade</small></div>
        <div className={styles.insight}><span><FilePenLine size={14} /> THE REASONING</span><p>{feedback.overview}</p>{feedback.priorities[0] && <small>Next focus: {feedback.priorities[0]}</small>}</div>
      </div>
      {typeof latest.actualTeacherGrade === "number" && <p className={styles.teacher}>Teacher grade recorded: {latest.actualTeacherGrade.toFixed(1)}% · {latest.actualTeacherGrade >= feedback.lower && latest.actualTeacherGrade <= feedback.upper ? "Inside" : "Outside"} the predicted range</p>}
    </section>
  );
}
