"use client";

import { use, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, Camera, Check, Printer, Save, Send } from "lucide-react";
import { useWorkspace } from "@/components/workspace";
import { api } from "@/lib/client";
import { prepareStudyPhoto } from "@/lib/photo-client";
import { ErrorMessage, PageHeader } from "@/components/ui";
import type { AttemptView, PublicQuestion } from "@/lib/types";
import "./paper.css";

type PhotoResult = { transcription: string };
type ScanResult = { answers: { questionId: string; number: number; answer: string }[]; skipped: number };
const letter = (index: number) => String.fromCharCode(65 + index);


export default function PaperAttemptPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const router = useRouter();
  const { refresh } = useWorkspace();
  const [view, setView] = useState<AttemptView | null>(null);
  const [responses, setResponses] = useState<Record<string, string>>({});
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState(false);
  const [photoBusy, setPhotoBusy] = useState("");
  const [scanBusy, setScanBusy] = useState(false);
  const [scanNeedsReview, setScanNeedsReview] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  useEffect(() => {
    let active = true;
    void api<AttemptView>("/api/attempts/" + id).then((data) => {
      if (!active) return;
      setView(data);
      setResponses(data.attempt.responses);
    }).catch((cause: Error) => { if (active) setError(cause.message); });
    return () => { active = false; };
  }, [id]);

  const expired = Boolean(view?.attempt.deadline_at && Date.now() >= Date.parse(view.attempt.deadline_at));
  const editable = view?.attempt.status === "in_progress" && !expired;
  const answers = view?.questions ?? [];
  const answered = answers.filter((q) => Boolean(responses[q.id]?.trim())).length;

  useEffect(() => {
    const warn = (event: BeforeUnloadEvent) => {
      if (dirty || scanBusy) { event.preventDefault(); event.returnValue = ""; }
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty, scanBusy]);

  async function scanPages(list: FileList | null) {
    const files = Array.from(list ?? []);
    if (!files.length || !editable || busy || scanBusy || photoBusy) return;
    if (files.length > 5) { setError("Choose up to 5 photos per batch. You can scan another batch afterward."); return; }
    setScanBusy(true);
    setError("");
    setMessage("");
    let next = { ...responses };
    let imported = 0;
    let skipped = 0;
    let conflicts = 0;
    try {
      for (let i = 0; i < files.length; i++) {
        setMessage("Reading page " + (i + 1) + " of " + files.length + "…");
        const image = await prepareStudyPhoto(files[i]);
        const result = await api<ScanResult>("/api/attempts/" + id + "/scan", {
          method: "POST",
          body: JSON.stringify({ requestId: crypto.randomUUID(), image }),
        });
        skipped += result.skipped;
        for (const item of result.answers) {
          const question = answers.find((q) => q.id === item.questionId);
          if (!question) continue;
          const existing = next[item.questionId]?.trim() ?? "";
          if (!existing) {
            next[item.questionId] = item.answer;
            imported++;
          } else if (question.kind !== "multiple_choice" && !existing.includes(item.answer)) {
            const merged = existing + "\n\n" + item.answer;
            if (merged.length > 12000) { conflicts++; continue; }
            next[item.questionId] = merged;
            imported++;
          } else if (existing !== item.answer) {
            conflicts++;
          }
        }
        setResponses({ ...next });
        if (imported > 0) { setDirty(true); setScanNeedsReview(true); }
      }
      setMessage(imported
        ? "Imported " + imported + " answers/sections. Review every detected letter and written response below before grading." +
          (conflicts ? " " + conflicts + " duplicate/conflicting answers were kept unchanged." : "") +
          (skipped ? " " + skipped + " unclear/unmatched answers were skipped." : "")
        : "No new answers detected. Try clear, well-lit photos or enter your answers manually.");
    } catch (cause) {
      setError((cause as Error).message + (imported ? " Earlier pages were imported; review and save them." : ""));
      setMessage("");
    } finally {
      setScanBusy(false);
    }
  }

  function change(questionId: string, answer: string) {
    setResponses((current) => ({ ...current, [questionId]: answer }));
    setDirty(true);
    setMessage("");
  }

  async function save() {
    if (!view || !editable) return;
    await api("/api/attempts/" + id, {
      method: "PATCH",
      body: JSON.stringify({ responses, flags: view.attempt.flags }),
    });
    setDirty(false);
    setMessage("Answers saved.");
  }

  async function saveClick() {
    setBusy(true);
    setError("");
    try { await save(); }
    catch (cause) { setError((cause as Error).message); }
    finally { setBusy(false); }
  }

  async function readPhoto(question: PublicQuestion, file?: File) {
    if (!file || !editable) return;
    setPhotoBusy(question.id);
    setError("");
    setMessage("");
    try {
      const image = await prepareStudyPhoto(file);
      const result = await api<PhotoResult>("/api/attempts/" + id + "/photo", {
        method: "POST",
        body: JSON.stringify({
          questionId: question.id,
          requestId: crypto.randomUUID(),
          image,
        }),
      });
      change(question.id, result.transcription);
      setScanNeedsReview(true);
      setMessage("Photo transcribed for question " + (question.position + 1) + ". Review and correct the text before submitting.");
    } catch (cause) {
      setError((cause as Error).message);
    } finally {
      setPhotoBusy("");
    }
  }

  async function submit() {
    if (!view || !editable || busy || photoBusy || scanBusy) return;
    if (scanNeedsReview) { setError("Review the scanned answers and confirm that you checked them before grading."); return; }
    if (!window.confirm("Submit your paper test? Unanswered questions get zero points. Check all photo transcriptions first.")) return;
    setBusy(true);
    setError("");
    try {
      await save();
      await api("/api/attempts/" + id + "/submit", { method: "POST" });
      await refresh();
      router.push("/attempts/" + id);
    } catch (cause) {
      setError((cause as Error).message);
    } finally {
      setBusy(false);
    }
  }

  if (!view) return (
    <section className="panel form-panel">
      <h1>{error ? "Unable to open paper test" : "Loading paper test…"}</h1>
      <ErrorMessage message={error} />
      <Link href="/history">Back to tests</Link>
    </section>
  );

  return (
    <div className="paper-test">
      <div className="paper-mode-controls">
        <Link href={"/attempts/" + id} className="back-link" onClick={(event) => {
          if (dirty && !window.confirm("Unsaved paper answers will be lost. Leave anyway?")) event.preventDefault();
        }}><ArrowLeft size={16} /> Digital test</Link>
        <PageHeader eyebrow="PAPER TEST MODE" title={view.exam.name} description="Print the questions, work offline, then enter answer letters and upload photos of written answers." />
        {view.test.time_limit_minutes !== null && (
          <p className="notice">This is a timed test. Its original countdown keeps running while you are on paper. For take-home paper tests, generate an untimed test.</p>
        )}
        <div className="paper-actions">
          <button type="button" className="button" disabled={scanBusy} onClick={() => window.print()}><Printer size={17} /> Print / Save PDF</button>
          <span className="helper">{answers.length} questions. The answer key is not printed.</span>
        </div>
        {view.attempt.status !== "in_progress" && <p className="notice">This attempt has already been submitted. You can print the questions, but not change the answers.</p>}
        {expired && view.attempt.status === "in_progress" && <p className="notice">The timer expired. Open the digital test to submit the answers already saved.</p>}
        <ErrorMessage message={error} />
        {message && <p className="success-text" role="status">{message}</p>}
        <section className="panel form-panel">
          <h2>Submit your completed paper test</h2>
          <div className="paper-scan-section">
            <h3>Upload photos of your completed pages</h3>
            <p className="helper">Take clear photos showing the printed question numbers and handwritten answers. Select up to 5 pages at once. StudyPredict will read marked A/B/C/D choices and written work, then fill in the answer form for you to verify. Scanning uses AI credits; the photos are not saved.</p>
            <label className="paper-photo-label paper-scan-label">
              <Camera size={17} /> {scanBusy ? "Reading your pages…" : "Choose photos of completed test"}
              <input type="file" accept="image/*" multiple disabled={!editable || busy || scanBusy || Boolean(photoBusy)} onChange={(event) => {
                const files = event.currentTarget.files;
                void scanPages(files);
                event.currentTarget.value = "";
              }} />
            </label>
            <p className="helper">If some answers are missed, select the multiple-choice letters or upload a closer photo for individual written answers below.</p>
          </div>
          <h3>Check your answers before grading</h3>
          {scanNeedsReview && (
            <div className="notice paper-review-notice" role="status">
              <p>Photo reading can mistake handwriting or marked letters. Check the answers below, then confirm you reviewed them.</p>
              <button type="button" className="button secondary small" disabled={scanBusy || Boolean(photoBusy)} onClick={() => {
                setScanNeedsReview(false);
                setMessage("Scanned answers reviewed. You can now save or grade.");
              }}><Check size={16} /> I've reviewed my scanned answers</button>
            </div>
          )}
          <p className="helper">Tap A/B/C/D for multiple choice. For written questions, type your answer or upload a clear photo of one question&apos;s work. Photo text is AI-transcribed, may be wrong, and must be checked before grading. Original photos are not saved.</p>
          <p><strong>{answered} of {answers.length}</strong> questions answered {dirty ? "· Unsaved changes" : ""}</p>
          <div className="paper-entry-list">
            {answers.map((q, index) => (
              <div className="paper-entry" key={q.id}>
                <div className="paper-entry-title"><strong>Question {index + 1}</strong><span>{q.topic}</span></div>
                {q.kind === "multiple_choice" ? (
                  <fieldset className="paper-letter-choices" disabled={!editable || busy || scanBusy || Boolean(photoBusy)}>
                    <legend className="sr-only">Choose answer to question {index + 1}</legend>
                    {(q.options ?? []).map((option, i) => (
                      <label key={i} className={responses[q.id] === option ? "paper-letter chosen" : "paper-letter"}>
                        <input type="radio" name={"paper-" + q.id} checked={responses[q.id] === option} onChange={() => change(q.id, option)} />
                        {letter(i)}
                      </label>
                    ))}
                  </fieldset>
                ) : (
                  <div className="paper-written-answer">
                    <label className="paper-photo-label">
                      <Camera size={16} /> {photoBusy === q.id ? "Reading photo…" : "Upload photo of answer"}
                      <input type="file" accept="image/*" disabled={!editable || busy || scanBusy || Boolean(photoBusy)} onChange={(event) => {
                        const file = event.currentTarget.files?.[0];
                        event.currentTarget.value = "";
                        void readPhoto(q, file);
                      }} />
                    </label>
                    <label className="helper">Check / edit transcribed answer
                      <textarea rows={4} maxLength={12000} disabled={!editable || busy || scanBusy || Boolean(photoBusy)} value={responses[q.id] ?? ""} onChange={(event) => change(q.id, event.target.value)} placeholder="Type an answer or upload a photo of your handwritten response." />
                    </label>
                  </div>
                )}
              </div>
            ))}
          </div>
          <div className="paper-actions">
            <button type="button" className="button secondary" disabled={!editable || busy || scanBusy || Boolean(photoBusy)} onClick={() => void saveClick()}><Save size={16} /> {busy ? "Saving…" : "Save answers"}</button>
            <button type="button" className="button" disabled={!editable || busy || scanBusy || scanNeedsReview || Boolean(photoBusy)} onClick={() => void submit()}><Send size={16} /> Grade paper test</button>
            {!dirty && message && <span className="helper"><Check size={14} /> {message}</span>}
          </div>
        </section>
      </div>

      <section className="paper-print-test" aria-label="Printable practice test">
        <header className="paper-print-header">
          <strong>StudyPredict · Practice Test</strong>
          <h1>{view.exam.name}</h1>
          <p>{view.subject} · {view.test.difficulty} · {answers.length} questions</p>
          <div className="paper-name-line"><span>Name: _______________________</span><span>Date: _________________</span></div>
          <p className="paper-print-instructions">Write your answers on this sheet. Return to StudyPredict to enter your letter choices and submit photos of your work.</p>
        </header>
        {answers.map((q, index) => (
          <article key={q.id} className="paper-print-question">
            <div className="paper-print-number"><strong>{index + 1}.</strong> <span>{q.max_points} pts</span></div>
            {q.passage && <div className="paper-print-passage"><strong>Reading passage</strong><p>{q.passage}</p></div>}
            <p className="paper-print-prompt">{q.prompt}</p>
            {q.kind === "multiple_choice" ? (
              <div className="paper-print-options">{(q.options ?? []).map((option, i) => (
                <p key={i}><span className="paper-option-letter">{letter(i)}.</span> {option}</p>
              ))}
                <div className="paper-print-answer-row">
                  <strong>Mark your answer:</strong>
                  {(q.options ?? []).map((_, i) => (
                    <span className="paper-print-choice" key={i}><i aria-hidden="true" /> {letter(i)}</span>
                  ))}
                </div>
              </div>
            ) : (
              <div className={q.kind === "math" ? "paper-work-space math" : "paper-work-space"} aria-label="Space to write your answer" />
            )}
          </article>
        ))}
        <p className="paper-print-footer">Submit answer letters and photos in the same StudyPredict test. Do not include an answer key on your printout.</p>
      </section>
    </div>
  );
}
