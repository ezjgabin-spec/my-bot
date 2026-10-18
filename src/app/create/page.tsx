"use client";
import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  Sparkles,
  FileText,
  Check,
  ArrowRight,
  LoaderCircle,
} from "lucide-react";
import { useWorkspace } from "@/components/workspace";
import { PageHeader, ErrorMessage } from "@/components/ui";
import { api, formatLabel } from "@/lib/client";
import { MAX_MATERIAL_CHARACTERS } from "@/lib/material-limits";
import { FileInterpreter } from "@/components/file-interpreter";
import {
  SUBJECTS,
  DIFFICULTIES,
  FORMATS,
  type Difficulty,
  type Format,
  type Exam,
} from "@/lib/types";
export default function CreatePage() {
  return (
    <Suspense fallback={<p>Loading test settings…</p>}>
      <CreateTest />
    </Suspense>
  );
}
function CreateTest() {
  const router = useRouter();
  const search = useSearchParams();
  const { state, connection, aiReady, refresh } = useWorkspace();
  const [examId, setExamId] = useState(search.get("exam") ?? "new");
  const [subject, setSubject] = useState(search.get("subject") ?? "Math");
  const [name, setName] = useState("");
  const [date, setDate] = useState("");
  const [notes, setNotes] = useState("");
  const [materialMode, setMaterialMode] = useState(
    search.get("material") ? "existing" : "notes",
  );
  const [materials, setMaterials] = useState<
    { id: string; filename: string }[]
  >([]);
  const [materialId, setMaterialId] = useState(search.get("material") ?? "");
  const [difficulty, setDifficulty] = useState<Difficulty>("Teacher-Level");
  const [format, setFormat] = useState<Format>("mixed");
  const [count, setCount] = useState(20);
  const [time, setTime] = useState("");
  const [focus, setFocus] = useState(search.get("topics") ?? "");
  const [error, setError] = useState("");
  const [stage, setStage] = useState("");
  const [createdTest, setCreatedTest] = useState<string | null>(null);
  useEffect(() => {
    if (connection === "ready")
      api<{ materials: typeof materials }>("/api/materials")
        .then((x) => setMaterials(x.materials))
        .catch((e) => setError(e.message));
  }, [connection]);
  const available = state.exams.filter(
    (e) => !state.grades.some((g) => g.exam_id === e.id),
  );
  const selectedExam = state.exams.find((e) => e.id === examId);
  const selectedSubject = selectedExam
    ? state.subjects.find((s) => s.id === selectedExam.subject_id)?.name
    : subject;
  async function startTest(testId: string) {
    setStage("Opening your practice test…");
    const result = await api<{ attemptId: string }>(
      `/api/tests/${testId}/attempts`,
      { method: "POST" },
    );
    await refresh();
    router.push(`/attempts/${result.attemptId}`);
  }
  async function generate(event: React.FormEvent) {
    event.preventDefault();
    setError("");
    try {
      if (createdTest) {
        await startTest(createdTest);
        return;
      }
      if (materialMode === "file")
        throw new Error("Read your file and save its study guide first.");
      let eid = examId;
      if (eid === "new") {
        setStage("Saving your school exam…");
        const result = await api<{ exam: Exam }>("/api/exams", {
          method: "POST",
          body: JSON.stringify({ subject, name, date: date || null }),
        });
        eid = result.exam.id;
        setExamId(eid);
        await refresh();
      }
      let mid = materialId;
      if (!mid || materialMode !== "existing") {
        setStage("Reading your study material…");
        const upload: RequestInit = {
          method: "POST",
          body: JSON.stringify({
            filename: `${selectedSubject || "Study"} notes.txt`,
            text: notes,
          }),
        };
        const result = await api<{ id: string; filename: string }>(
          "/api/materials",
          upload,
        );
        mid = result.id;
        setMaterialId(mid);
        setMaterials((ms) => [...ms, result]);
        setMaterialMode("existing");
      }
      if (!mid) throw new Error("Choose a saved study material.");
      setStage(
        "Claude is building your questions and rubrics. This can take a minute or two…",
      );
      const result = await api<{ testId: string }>("/api/tests/generate", {
        method: "POST",
        body: JSON.stringify({
          examId: eid,
          materialId: mid,
          difficulty,
          format,
          count,
          timeLimit: time ? Number(time) : null,
          focusTopics: focus
            .split(",")
            .map((t) => t.trim())
            .filter(Boolean),
        }),
      });
      setCreatedTest(result.testId);
      await startTest(result.testId);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setStage("");
    }
  }
  return (
    <>
      <PageHeader
        eyebrow="PRACTICE WITH PURPOSE"
        title="Your notes. Your next challenge."
        description="Build a realistic practice test from what you’re actually studying."
      />
      <form onSubmit={generate} className="create-layout">
        <div className="form-stack">
          <fieldset
            disabled={!!stage || !!createdTest}
            className="panel form-panel"
          >
            <h2>
              <span className="step-number">1</span> Set your goal
            </h2>
            <label>
              School exam
              <select
                value={examId}
                onChange={(e) => setExamId(e.target.value)}
              >
                <option value="new">＋ Create a new school exam</option>
                {available.map((e) => (
                  <option value={e.id} key={e.id}>
                    {e.name}
                  </option>
                ))}
              </select>
            </label>
            {examId === "new" ? (
              <>
                <div className="form-grid">
                  <label>
                    Subject
                    <select
                      value={subject}
                      onChange={(e) => setSubject(e.target.value)}
                    >
                      {SUBJECTS.map((s) => (
                        <option key={s}>{s}</option>
                      ))}
                    </select>
                  </label>
                  <label>
                    Exam date <span className="optional">optional</span>
                    <input
                      type="date"
                      value={date}
                      onChange={(e) => setDate(e.target.value)}
                    />
                  </label>
                </div>
                <label>
                  Exam name
                  <input
                    required
                    maxLength={160}
                    placeholder="e.g. Chapter 4 · Functions & inverses"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                  />
                </label>
              </>
            ) : (
              <p className="helper">
                New attempts will contribute to the same {selectedSubject} exam
                prediction.
              </p>
            )}
          </fieldset>
          <fieldset
            disabled={!!stage || !!createdTest}
            className="panel form-panel"
          >
            <h2>
              <span className="step-number">2</span> Bring your study material
            </h2>
            <div
              className="segmented"
              role="group"
              aria-label="Study material source"
            >
              {[
                ["notes", "Paste notes"],
                ["file", "Interpret a file"],
                ["existing", "Saved materials"],
              ].map(([value, label]) => (
                <button
                  key={value}
                  type="button"
                  className={materialMode === value ? "selected" : ""}
                  onClick={() => setMaterialMode(value)}
                >
                  {label}
                </button>
              ))}
            </div>
            {materialMode === "notes" && (
              <label className="notes-label">
                Study notes
                <textarea
                  required
                  maxLength={MAX_MATERIAL_CHARACTERS}
                  rows={9}
                  placeholder="Paste your study guide, class notes, vocabulary, or review questions here…"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                />
                <span className="helper">
                  More study material usually creates better questions.
                </span>
              </label>
            )}
            {materialMode === "file" && (
              <FileInterpreter
                aiReady={aiReady}
                onSaved={(material) => {
                  setMaterials((items) => [...items, material]);
                  setMaterialId(material.id);
                  setMaterialMode("existing");
                }}
              />
            )}
            {materialMode === "existing" && (
              <label>
                Saved study material
                <select
                  required
                  value={materialId}
                  onChange={(e) => setMaterialId(e.target.value)}
                >
                  <option value="">Choose material…</option>
                  {materials.map((m) => (
                    <option value={m.id} key={m.id}>
                      {m.filename}
                    </option>
                  ))}
                </select>
                {!materials.length && (
                  <span className="helper">
                    No saved materials yet. Paste notes or upload a file to
                    begin.
                  </span>
                )}
              </label>
            )}
          </fieldset>
          <fieldset
            disabled={!!stage || !!createdTest}
            className="panel form-panel"
          >
            <h2>
              <span className="step-number">3</span> Make it your own
            </h2>
            <div className="form-grid">
              <label>
                Number of questions
                <select
                  value={count}
                  onChange={(e) => setCount(Number(e.target.value))}
                >
                  {[10, 15, 20, 30, 40].map((n) => (
                    <option key={n} value={n}>
                      {n} questions
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Question format
                <select
                  value={format}
                  onChange={(e) => setFormat(e.target.value as Format)}
                >
                  {FORMATS.map((f) => (
                    <option key={f} value={f}>
                      {formatLabel(f)}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Difficulty
                <select
                  value={difficulty}
                  onChange={(e) => setDifficulty(e.target.value as Difficulty)}
                >
                  {DIFFICULTIES.map((d) => (
                    <option key={d}>{d}</option>
                  ))}
                </select>
              </label>
              <label>
                Time limit <span className="optional">optional</span>
                <input
                  type="number"
                  min={1}
                  max={240}
                  placeholder="No time limit"
                  value={time}
                  onChange={(e) => setTime(e.target.value)}
                />
              </label>
            </div>
            <label>
              Focus topics <span className="optional">optional</span>
              <input
                value={focus}
                maxLength={1000}
                onChange={(e) => setFocus(e.target.value)}
                placeholder="e.g. Function inverses, domain and range"
              />
              <span className="helper">
                Separate up to 10 topics with commas. Only topics in your notes
                will be used.
              </span>
            </label>
          </fieldset>
        </div>
        <aside className="create-summary panel">
          <span className="summary-icon">
            <Sparkles size={26} />
          </span>
          <h2>A test that fits your goals.</h2>
          <p>
            Built from your material. Graded with clear explanations. Followed
            by a personalized forecast.
          </p>
          <dl>
            <div>
              <dt>Subject</dt>
              <dd>{selectedSubject || "—"}</dd>
            </div>
            <div>
              <dt>Questions</dt>
              <dd>{count}</dd>
            </div>
            <div>
              <dt>Difficulty</dt>
              <dd>{difficulty}</dd>
            </div>
            <div>
              <dt>Time</dt>
              <dd>{time ? `${time} minutes` : "At your own pace"}</dd>
            </div>
          </dl>
          <ul className="check-list">
            <li>
              <Check size={16} />
              Answers hidden until submission
            </li>
            <li>
              <Check size={16} />
              Progress saved as you go
            </li>
            <li>
              <Check size={16} />
              Rubric-based written feedback
            </li>
          </ul>
          <ErrorMessage message={error} />
          {stage && (
            <p className="progress-message" role="status">
              <LoaderCircle className="spin" size={18} />
              {stage}
            </p>
          )}
          <button
            className="button full"
            disabled={
              !!stage ||
              connection !== "ready" ||
              !aiReady ||
              materialMode === "file"
            }
            type="submit"
          >
            {createdTest ? "Open saved test" : "Generate practice test"}
            {stage ? (
              <LoaderCircle size={17} className="spin" />
            ) : (
              <ArrowRight size={17} />
            )}
          </button>
          {(connection !== "ready" || !aiReady) && (
            <p className="helper">
              {process.env.NEXT_PUBLIC_STUDYPREDICT_CLOUD === "1"
                ? "The owner needs to connect Claude before you can generate a test."
                : "Open Settings and add your Anthropic API key to generate your test."}
            </p>
          )}
          <div className="privacy-note">
            <FileText size={15} />
            Your material is stored privately and sent to Claude for generation
            and grading.
          </div>
          <p className="helper">
            Long documents are sampled across sections for each test. Add focus
            topics to prioritize the chapters you want to practice. Scanned PDFs
            still need selectable text or OCR first.
          </p>
        </aside>
      </form>
    </>
  );
}
