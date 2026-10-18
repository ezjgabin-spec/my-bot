"use client";
import { useEffect, useRef, useState } from "react";
import { api } from "@/lib/client";
import { readStudyFile } from "@/lib/browser-documents";
import { splitStudyText } from "@/lib/interpreter-limits";
import { MAX_MATERIAL_CHARACTERS } from "@/lib/material-limits";

type Phase = "idle" | "reading" | "ready" | "working" | "paused" | "review";
export function FileInterpreter({
  onSaved,
  aiReady,
}: {
  onSaved: (material: { id: string; filename: string }) => void;
  aiReady: boolean;
}) {
  const [file, setFile] = useState<File | null>(null);
  const [phase, setPhase] = useState<Phase>("idle");
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");
  const [warnings, setWarnings] = useState<string[]>([]);
  const [guide, setGuide] = useState("");
  const [count, setCount] = useState({ done: 0, total: 0 });
  const [saving, setSaving] = useState(false);
  const job = useRef({
    inputs: [] as string[],
    summaries: [] as string[],
    pass: 0,
  });
  const controller = useRef<AbortController | null>(null);
  const pause = useRef(false);
  const active = useRef(false);
  useEffect(
    () => () => {
      controller.current?.abort();
    },
    [],
  );
  useEffect(() => {
    if (phase === "idle") return;
    const warn = (event: BeforeUnloadEvent) => {
      event.preventDefault();
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [phase]);

  async function read() {
    if (!file || active.current) return;
    active.current = true;
    controller.current?.abort();
    const control = new AbortController();
    controller.current = control;
    setError("");
    setWarnings([]);
    setGuide("");
    setPhase("reading");
    setStatus("Opening your file on this device…");
    try {
      const extracted = await readStudyFile(file, setStatus, control.signal);
      job.current = { inputs: extracted.chunks, summaries: [], pass: 0 };
      setWarnings(extracted.warnings);
      setCount({ done: 0, total: extracted.chunks.length });
      setPhase("ready");
      setStatus(`Ready: ${extracted.chunks.length} sections of readable text.`);
    } catch (e) {
      if (!control.signal.aborted) setError((e as Error).message);
      setPhase("idle");
    } finally {
      active.current = false;
    }
  }

  async function summarize() {
    if (active.current) return;
    active.current = true;
    pause.current = false;
    setError("");
    setPhase("working");
    const control = new AbortController();
    controller.current = control;
    try {
      while (true) {
        const current = job.current;
        while (current.summaries.length < current.inputs.length) {
          if (pause.current) {
            setPhase("paused");
            setStatus("Paused. Completed sections are kept in this tab.");
            return;
          }
          control.signal.throwIfAborted();
          const n = current.summaries.length;
          setStatus(
            `${current.pass ? "Condensing guide" : "Summarizing"}: section ${n + 1} of ${current.inputs.length}…`,
          );
          const result = await api<{ summary: string }>(
            "/api/materials/interpret",
            {
              method: "POST",
              signal: control.signal,
              body: JSON.stringify({ text: current.inputs[n] }),
            },
          );
          current.summaries.push(result.summary);
          setCount({
            done: current.summaries.length,
            total: current.inputs.length,
          });
        }
        const combined = current.summaries.join("\n\n");
        if (combined.length <= MAX_MATERIAL_CHARACTERS) {
          setGuide(combined);
          setPhase("review");
          setStatus(
            "Your study guide is ready. Review and edit it before saving.",
          );
          return;
        }
        // Condense all sections rather than dropping the end of a long book.
        job.current = {
          inputs: splitStudyText(combined),
          summaries: [],
          pass: current.pass + 1,
        };
        setCount({ done: 0, total: job.current.inputs.length });
      }
    } catch (e) {
      if (!control.signal.aborted) {
        setError(
          `${(e as Error).message} Completed sections are kept; retry continues from this section.`,
        );
        setPhase("paused");
      }
    } finally {
      active.current = false;
    }
  }

  async function save() {
    setSaving(true);
    setError("");
    try {
      const result = await api<{ id: string; filename: string }>(
        "/api/materials",
        {
          method: "POST",
          body: JSON.stringify({
            filename: `${file?.name.replace(/\.[^.]+$/, "").slice(0, 140) || "Study"} — study guide.txt`,
            text: guide,
          }),
        },
      );
      onSaved(result);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  }

  function download() {
    const url = URL.createObjectURL(
      new Blob([guide], { type: "text/plain;charset=utf-8" }),
    );
    const a = document.createElement("a");
    a.href = url;
    a.download = "study-guide.txt";
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  const busy = phase === "reading" || phase === "working" || saving;
  return (
    <div className="interpreter">
      <label className="upload-zone">
        <strong>File interpreter</strong>
        <span>
          PDF, Word (.docx), or TXT — including PDFs larger than 100 MB
        </span>
        <input
          type="file"
          accept=".pdf,.docx,.txt"
          disabled={busy}
          onChange={(event) => {
            setFile(event.target.files?.[0] ?? null);
            setPhase("idle");
            setError("");
            setStatus("");
            setGuide("");
            setWarnings([]);
            job.current = { inputs: [], summaries: [], pass: 0 };
          }}
        />
        <span>
          Read on your device. Only small sections of text are sent for AI
          summarizing.
        </span>
      </label>
      <p className="helper">
        More readable material usually makes a better study guide. Scanned pages
        need OCR first; images and diagrams aren’t read. Very large files depend
        on your device’s memory. Keep this tab open until you save; progress is
        kept here while you work.
      </p>
      {phase === "idle" && (
        <button
          type="button"
          className="button secondary"
          disabled={!file}
          onClick={read}
        >
          Read file
        </button>
      )}
      {phase === "reading" && (
        <button
          type="button"
          className="button secondary"
          onClick={() => controller.current?.abort()}
        >
          Cancel reading
        </button>
      )}
      {status && <p role="status">{status}</p>}
      {warnings.map((warning) => (
        <p className="interpreter-warning" key={warning}>
          {warning}
        </p>
      ))}
      {(phase === "ready" || phase === "paused") && (
        <>
          <p className="helper">
            Claude will summarize every readable section using your connected
            account’s API credits. Completed sections won’t be requested again
            when you resume.
          </p>
          <button
            type="button"
            className="button"
            disabled={!aiReady}
            onClick={summarize}
          >
            {phase === "paused" ? "Resume interpretation" : "Summarize file"}
          </button>
          {!aiReady && (
            <p className="helper">Connect Claude before summarizing.</p>
          )}
        </>
      )}
      {(phase === "working" || phase === "paused") && (
        <>
          <progress
            aria-label="Interpretation progress"
            value={count.done}
            max={count.total || 1}
          />
          <p className="helper">
            {count.done} / {count.total} sections completed
          </p>
        </>
      )}
      {phase === "working" && (
        <button
          type="button"
          className="button secondary"
          onClick={() => {
            pause.current = true;
            setStatus("Pausing after the current section finishes…");
          }}
        >
          Pause after this section
        </button>
      )}
      {phase === "review" && (
        <>
          <label>
            Review your study guide
            <textarea
              rows={14}
              value={guide}
              maxLength={MAX_MATERIAL_CHARACTERS}
              onChange={(event) => setGuide(event.target.value)}
            />
          </label>
          <p className="helper">
            Summaries can miss details. Check important facts, equations, and
            page references against the original. Tests will use this guide.{" "}
            {guide.length.toLocaleString()} characters.
          </p>
          <div className="interpreter-actions">
            <button
              type="button"
              className="button"
              disabled={saving || !guide.trim()}
              onClick={save}
            >
              {saving ? "Saving…" : "Save guide & use for test"}
            </button>
            <button
              type="button"
              className="button secondary"
              onClick={download}
            >
              Download text
            </button>
          </div>
        </>
      )}
      {error && (
        <p role="alert" className="interpreter-warning">
          {error}
        </p>
      )}
    </div>
  );
}
