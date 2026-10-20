"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ArrowRight, ClipboardCheck, FilePenLine, Sparkles } from "lucide-react";
import { useWorkspace } from "@/components/workspace";
import type { GradeFeedback } from "@/lib/writing-types";
import styles from "./recent-assignments.module.css";

type EssaySummary = {
  essayId: string;
  essayTitle: string;
  createdAt: string;
  feedback: GradeFeedback;
  actualTeacherGrade?: number;
  actualTeacherLetter?: string;
};
type FeedEntry = {
  kind: "essay" | "test";
  id: string;
  createdAt: string;
  title: string;
  href: string;
  score: string;
  scoreLabel: string;
  subline: string;
  note: string;
  actual?: string;
};

export function RecentAssignments() {
  const { state, connection, entitlement } = useWorkspace();
  const [essays, setEssays] = useState<EssaySummary[]>([]);
  const allowed = Boolean(entitlement && (entitlement.family || entitlement.plan !== "free"));

  useEffect(() => {
    if (connection !== "ready" || !allowed) return;
    let cancelled = false;
    fetch("/api/writing/summary", { cache: "no-store", credentials: "same-origin" })
      .then((r) => {
        if (!r.ok) throw new Error("Cannot load essays");
        return r.json() as Promise<{ history?: EssaySummary[]; latest?: EssaySummary | null }>;
      })
      .then((r) => { if (!cancelled) setEssays(r.history ?? (r.latest ? [r.latest] : [])); })
      .catch(() => { if (!cancelled) setEssays([]); });
    return () => { cancelled = true; };
  }, [connection, allowed]);

  const feed = useMemo(() => {
    const essayRows: FeedEntry[] = essays.map((essay) => ({
      kind: "essay",
      id: essay.essayId + essay.createdAt,
      createdAt: essay.createdAt,
      title: essay.essayTitle,
      href: "/writing?essay=" + encodeURIComponent(essay.essayId),
      score: essay.feedback.lower.toFixed(0) + "–" + essay.feedback.upper.toFixed(0) + "%",
      scoreLabel: essay.feedback.likelyLetter,
      subline: "Essay estimate · " + essay.feedback.confidence + " confidence",
      note: essay.feedback.overview,
      actual: [
        essay.actualTeacherLetter,
        typeof essay.actualTeacherGrade === "number" ? essay.actualTeacherGrade.toFixed(1) + "%" : null,
      ].filter(Boolean).join(" · ") || undefined,
    }));
    const completed: FeedEntry[] = state.attempts
      .filter((a) => a.status === "completed" && a.completed_at)
      .map((attempt) => {
        const forecast = [...state.predictions]
          .filter((p) => p.attempt_id === attempt.id)
          .sort((a, b) => b.created_at.localeCompare(a.created_at))[0];
        const exam = state.exams.find((e) => e.id === attempt.exam_id);
        const subject = state.subjects.find((s) => s.id === exam?.subject_id)?.name;
        const actual = state.grades.find((g) => g.exam_id === attempt.exam_id);
        return {
          kind: "test" as const,
          id: attempt.id,
          createdAt: forecast?.created_at ?? attempt.completed_at!,
          title: exam?.name ?? "Practice test",
          href: "/attempts/" + encodeURIComponent(attempt.id),
          score: forecast ? forecast.lower.toFixed(0) + "–" + forecast.upper.toFixed(0) + "%" : (attempt.score?.toFixed(1) ?? "—") + "%",
          scoreLabel: forecast ? "Forecast" : "Practice",
          subline: [subject, forecast ? "School grade forecast" : "Practice score"].filter(Boolean).join(" · "),
          note: forecast?.explanation ?? "Review your answers and detailed feedback.",
          actual: typeof actual?.grade === "number" ? actual.grade.toFixed(1) + "% teacher grade" : undefined,
        };
      });
    return [...essayRows, ...completed]
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .slice(0, 5);
  }, [essays, state]);

  if (!feed.length) return null;
  return (
    <section className={styles.section} aria-label="Recent assignments newest first">
      <div className={styles.heading}>
        <span><Sparkles size={15} /> RECENT WORK</span>
        <h2>Your latest assignments</h2>
        <p>Essays and practice tests together, newest first.</p>
      </div>
      <div className={styles.list}>
        {feed.map((entry, index) => (
          <Link key={entry.id} href={entry.href} className={index === 0 ? styles.featured : styles.item}>
            <div className={styles.topline}>
              <span className={styles.type}>{entry.kind === "essay" ? <FilePenLine size={15} /> : <ClipboardCheck size={15} />}{entry.kind === "essay" ? "ESSAY" : "PRACTICE TEST"}</span>
              <time dateTime={entry.createdAt}>{new Date(entry.createdAt).toLocaleDateString(undefined, { month: "short", day: "numeric" })}</time>
            </div>
            <div className={styles.row}>
              <div className={styles.info}>
                <h3>{entry.title}</h3>
                <span>{entry.subline}</span>
                {index === 0 && <p>{entry.note}</p>}
              </div>
              <div className={styles.score}>
                <strong>{entry.score}</strong>
                <small>{entry.scoreLabel}</small>
              </div>
              <ArrowRight className={styles.arrow} size={19} />
            </div>
            {entry.actual && <div className={styles.actual}>Teacher result: {entry.actual}</div>}
          </Link>
        ))}
      </div>
    </section>
  );
}
