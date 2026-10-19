"use client";
import { useRef, useState } from "react";
import Link from "next/link";
import { Plus, Sparkles, Trash2, Save, FileText } from "lucide-react";
import { api } from "@/lib/client";
import {
  smartImport,
  MAX_DECK_CARDS,
  MAX_IMPORT_CHARACTERS,
  MAX_AI_FLASHCARD_CHARACTERS,
  type DraftCard,
} from "@/lib/flashcard-import";
import type { FlashcardDeck } from "@/lib/flashcard-decks";
import { useWorkspace } from "./workspace";
import { ErrorMessage } from "./ui";

type Mode = "smart-import" | "manual" | "ai";
const blank = (): DraftCard => ({ front: "", back: "", topic: "General" });
export function FlashcardBuilder({
  materials,
  onSave,
}: {
  materials: { id: string; filename: string }[];
  onSave: (deck: FlashcardDeck) => void;
}) {
  const { entitlement, aiReady, connection } = useWorkspace();
  const paid = !!(
    entitlement?.family ||
    (entitlement && entitlement.plan !== "free")
  );
  const [mode, setMode] = useState<Mode>("smart-import");
  const [title, setTitle] = useState("My study deck");
  const [text, setText] = useState("");
  const [materialId, setMaterialId] = useState("");
  const [count, setCount] = useState(20);
  const [cards, setCards] = useState<DraftCard[]>([]);
  const [skipped, setSkipped] = useState<{ line: number; text: string }[]>([]);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [sourceMode, setSourceMode] = useState<"text" | "saved">("text");
  const [previewMaterialId, setPreviewMaterialId] = useState<string | null>(
    null,
  );
  const request = useRef<{ key: string; id: string } | null>(null);
  const saveId = useRef<string | null>(null);
  const pending = useRef(false);
  function chooseMode(next: Mode) {
    if (
      cards.length &&
      !window.confirm(
        "Discard the current preview? Saved decks and progress will stay intact.",
      )
    )
      return;
    setMode(next);
    setCards(next === "manual" ? [blank()] : []);
    setSkipped([]);
    setError("");
    setMessage("");
    request.current = null;
    saveId.current = null;
  }
  function parse() {
    try {
      const parsed = smartImport(text);
      setCards(parsed.cards);
      setSkipped(parsed.skipped);
      saveId.current = null;
      setMessage(
        `${parsed.cards.length} cards found. Review and edit them before saving. No AI or credits used.`,
      );
      setError(
        parsed.cards.length
          ? ""
          : "No pairs found. Try Term = Definition, Term: Definition, or a tab between them.",
      );
    } catch (error) {
      setError((error as Error).message);
    }
  }
  async function generate() {
    if (pending.current) return;
    pending.current = true;
    setBusy(true);
    setError("");
    setMessage("");
    const body = {
      ...(sourceMode === "saved" ? { materialId } : { text }),
      count,
      title,
    };
    const key = JSON.stringify(body);
    if (request.current?.key !== key)
      request.current = { key, id: crypto.randomUUID() };
    try {
      const { preview } = await api<{
        preview: {
          cards: DraftCard[];
          title: string;
          materialId: string | null;
          sections: number;
          requestedCount: number;
        };
      }>("/api/flashcards/generate", {
        method: "POST",
        body: JSON.stringify({ ...body, requestId: request.current.id }),
      });
      setCards(preview.cards);
      setTitle(preview.title);
      setSkipped([]);
      saveId.current = null;
      setPreviewMaterialId(preview.materialId);
      setMessage(
        `${preview.cards.length} unique cards from ${preview.sections} source section(s). ${preview.cards.length < preview.requestedCount ? "Duplicates were removed, so fewer cards are shown. " : ""}All sections were processed, but a small deck cannot cover every detail. Review before saving.`,
      );
    } catch (error) {
      setError((error as Error).message);
    } finally {
      pending.current = false;
      setBusy(false);
    }
  }
  async function save() {
    if (pending.current) return;
    pending.current = true;
    setBusy(true);
    setError("");
    saveId.current ??= crypto.randomUUID();
    try {
      const result = await api<{ deck: FlashcardDeck }>("/api/flashcards", {
        method: "POST",
        body: JSON.stringify({
          requestId: saveId.current,
          title,
          materialId: mode === "ai" ? previewMaterialId : materialId || null,
          source: mode,
          cards,
        }),
      });
      onSave(result.deck);
      setCards([]);
      setMessage("Deck saved. Your review progress saves automatically.");
      saveId.current = null;
    } catch (error) {
      setError((error as Error).message);
    } finally {
      pending.current = false;
      setBusy(false);
    }
  }
  function edit(index: number, field: keyof DraftCard, value: string) {
    setCards((current) =>
      current.map((card, i) =>
        i === index ? { ...card, [field]: value } : card,
      ),
    );
  }
  return (
    <section className="panel flash-config">
      <div className="flash-config-heading">
        <div className="flash-icon">
          <FileText size={22} />
        </div>
        <div>
          <h2>Build a study deck</h2>
          <p>
            Import a list for free, write your own cards, or turn a whole guide
            into AI Smart Flashcards.
          </p>
        </div>
      </div>
      <div
        className="flash-builder-modes"
        role="group"
        aria-label="Flashcard creation method"
      >
        {(
          [
            ["smart-import", "Smart Import · Free"],
            ["manual", "Manual · Free"],
            ["ai", "AI Smart Flashcards"],
          ] as const
        ).map(([value, label]) => (
          <button
            className="flash-tool"
            type="button"
            key={value}
            aria-pressed={mode === value}
            disabled={busy}
            onClick={() => chooseMode(value)}
          >
            {label}
          </button>
        ))}
      </div>
      <label>
        Deck title
        <input
          value={title}
          maxLength={150}
          onChange={(e) => setTitle(e.target.value)}
          disabled={busy}
        />
      </label>
      {mode === "ai" && (
        <div
          className="flash-builder-modes"
          role="group"
          aria-label="Source type"
        >
          <button
            type="button"
            className="flash-tool"
            aria-pressed={sourceMode === "text"}
            disabled={busy}
            onClick={() => setSourceMode("text")}
          >
            Paste a guide
          </button>
          <button
            type="button"
            className="flash-tool"
            aria-pressed={sourceMode === "saved"}
            disabled={busy}
            onClick={() => setSourceMode("saved")}
          >
            Saved document
          </button>
        </div>
      )}
      {(mode !== "ai" || sourceMode === "saved") && (
        <label>
          {mode === "ai"
            ? "Saved study material"
            : "Link to study material (optional)"}
          <select
            disabled={busy}
            value={materialId}
            onChange={(e) => setMaterialId(e.target.value)}
          >
            <option value="">
              {mode === "ai" ? "Choose a document…" : "No linked material"}
            </option>
            {materials.map((m) => (
              <option key={m.id} value={m.id}>
                {m.filename}
              </option>
            ))}
          </select>
        </label>
      )}
      {mode !== "manual" && (mode !== "ai" || sourceMode === "text") && (
        <label>
          {mode === "ai"
            ? "Complete study guide or notes"
            : "Vocabulary and definitions"}
          <textarea
            rows={7}
            disabled={busy}
            maxLength={
              mode === "ai"
                ? MAX_AI_FLASHCARD_CHARACTERS
                : MAX_IMPORT_CHARACTERS
            }
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder={
              mode === "ai"
                ? "Paste your guide, including its headings and important details…"
                : "Accolade = An award or recognition\nImpetus: Something that causes an action\nAppraise — To estimate the value of something"
            }
          />
        </label>
      )}
      {mode === "smart-import" && (
        <>
          <p className="helper">
            Equals signs, colons, tabs and spaced dashes are supported. Up to
            500 cards per import; create and review as many decks as you need.
            No AI calls or credits.
          </p>
          <button
            type="button"
            className="flash-btn flash-btn-primary"
            disabled={!text.trim() || busy}
            onClick={parse}
          >
            Preview imported cards
          </button>
        </>
      )}
      {mode === "ai" && (
        <>
          <label>
            Number of cards
            <select
              disabled={busy}
              value={count}
              onChange={(e) => setCount(Number(e.target.value))}
            >
              {[5, 10, 20, 30, 50, 100].map((n) => (
                <option key={n} value={n}>
                  {n} cards
                </option>
              ))}
            </select>
          </label>
          <p className="helper">
            Up to 400,000 characters. Long guides are processed in sections.
            Generation uses credits; creating and reviewing the saved deck is
            free. <Link href="/create">Upload or interpret a document →</Link>
          </p>
          {!paid ? (
            <p className="notice">
              AI Smart Flashcards is included with Study and Plus. Smart Import
              and manual cards are free.{" "}
              <Link href="/pricing">View plans →</Link>
            </p>
          ) : (
            <button
              type="button"
              className="flash-btn flash-btn-primary"
              disabled={
                busy ||
                !aiReady ||
                (sourceMode === "saved" ? !materialId : !text.trim())
              }
              onClick={() => void generate()}
            >
              <Sparkles size={17} />
              {busy ? "Processing your guide…" : "Generate preview"}
            </button>
          )}
          {error && paid && (
            <button
              type="button"
              className="flash-tool"
              disabled={busy}
              onClick={() => {
                request.current = null;
                setError("");
                setMessage(
                  "Ready for a new request. It will use additional credits when you generate.",
                );
              }}
            >
              Start a new generation request
            </button>
          )}
        </>
      )}
      <ErrorMessage message={error} />
      {message && (
        <p className="notice" role="status">
          {message}
        </p>
      )}
      {!!skipped.length && (
        <details className="flash-import-skipped">
          <summary>
            {skipped.length} lines need attention — they were not imported
          </summary>
          {skipped.map((row) => (
            <p key={row.line}>
              <strong>Line {row.line}:</strong> {row.text}
            </p>
          ))}
          <p>
            Edit the source and preview again, or add the missing cards below.
          </p>
        </details>
      )}
      {(cards.length > 0 || mode === "manual") && (
        <div className="flash-preview">
          <h3>Review your cards · {cards.length}</h3>
          <p className="helper">
            Nothing is saved until you choose Save deck. Linked red and yellow
            cards help choose future quiz topics; they do not raise or lower
            grade predictions.
          </p>
          <div className="flash-preview-list">
            {cards.map((card, index) => (
              <fieldset key={index} disabled={busy}>
                <legend>Card {index + 1}</legend>
                <label>
                  Question / term
                  <textarea
                    rows={2}
                    maxLength={500}
                    value={card.front}
                    onChange={(e) => edit(index, "front", e.target.value)}
                  />
                </label>
                <label>
                  Answer / definition
                  <textarea
                    rows={3}
                    maxLength={3000}
                    value={card.back}
                    onChange={(e) => edit(index, "back", e.target.value)}
                  />
                </label>
                <label>
                  Topic
                  <input
                    maxLength={100}
                    value={card.topic}
                    onChange={(e) => edit(index, "topic", e.target.value)}
                  />
                </label>
                <button
                  type="button"
                  className="flash-tool"
                  aria-label={`Remove card ${index + 1}`}
                  onClick={() =>
                    setCards((current) => current.filter((_, i) => i !== index))
                  }
                >
                  <Trash2 size={15} />
                  Remove
                </button>
              </fieldset>
            ))}
          </div>
          <div className="flash-config-actions">
            <button
              type="button"
              className="flash-tool"
              disabled={busy || cards.length >= MAX_DECK_CARDS}
              onClick={() => setCards((current) => [...current, blank()])}
            >
              <Plus size={16} />
              Add card
            </button>
            <button
              type="button"
              className="flash-btn flash-btn-primary"
              disabled={
                busy ||
                connection !== "ready" ||
                !title.trim() ||
                !cards.length ||
                cards.some(
                  (card) =>
                    !card.front.trim() ||
                    !card.back.trim() ||
                    !card.topic.trim(),
                )
              }
              onClick={() => void save()}
            >
              <Save size={16} />
              {busy ? "Working…" : "Save deck"}
            </button>
          </div>
        </div>
      )}
    </section>
  );
}
