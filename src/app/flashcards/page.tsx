"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  ArrowLeft, ArrowRight, Check, ChevronRight, Layers3,
  RotateCcw, Shuffle, Sparkles, Zap, CircleHelp, CheckCheck,
  Archive, BookMarked, Save, Undo2, TriangleAlert,
} from "lucide-react";
import { useWorkspace } from "@/components/workspace";
import { PageHeader, ErrorMessage } from "@/components/ui";
import { api } from "@/lib/client";
import type { FlashcardDeck, FlashcardRating, FlashcardAction } from "@/lib/flashcard-decks";

type DeckSummary = {
  id: string; title: string; created_at: string; updated_at: string;
  total: number; active: number; mastered: number; needs_work: number;
  material_id: string;
};
type Motion = FlashcardRating | null;
const ANIMATION_MS = 460;

function summary(deck: FlashcardDeck): DeckSummary {
  return {
    id: deck.id, title: deck.title, created_at: deck.created_at,
    updated_at: deck.updated_at, material_id: deck.material_id,
    total: deck.cards.length, active: deck.active.length,
    mastered: deck.mastered.length, needs_work: deck.needs_work.length,
  };
}

export default function FlashcardsPage() {
  const { connection, aiReady } = useWorkspace();
  const [materials, setMaterials] = useState<{ id: string; filename: string }[]>([]);
  const [decks, setDecks] = useState<DeckSummary[]>([]);
  const [deck, setDeck] = useState<FlashcardDeck | null>(null);
  const [materialId, setMaterialId] = useState("");
  const [count, setCount] = useState<10 | 20 | 30>(10);
  const [flipped, setFlipped] = useState(false);
  const [motion, setMotion] = useState<Motion>(null);
  const [busy, setBusy] = useState(false);
  const [loadingDeckId, setLoadingDeckId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const pending = useRef(false);

  useEffect(() => {
    if (connection !== "ready") return;
    let cancelled = false;
    Promise.all([
      api<{ materials: { id: string; filename: string }[] }>("/api/materials"),
      api<{ decks: DeckSummary[] }>("/api/flashcards"),
    ]).then(([materialsResponse, decksResponse]) => {
      if (cancelled) return;
      setMaterials(materialsResponse.materials);
      setDecks(decksResponse.decks);
    }).catch((e: Error) => {
      if (!cancelled) setError(e.message);
    }).finally(() => {
      if (!cancelled) setLoading(false);
    });
    return () => { cancelled = true; };
  }, [connection]);

  function saveResult(updated: FlashcardDeck) {
    setDeck(updated);
    setDecks((existing) =>
      [summary(updated), ...existing.filter((item) => item.id !== updated.id)]);
  }

  async function openDeck(id: string) {
    if (pending.current) return;
    setLoadingDeckId(id);
    setError("");
    try {
      const response = await api<{ deck: FlashcardDeck }>(`/api/flashcards/${id}`);
      saveResult(response.deck);
      setFlipped(false);
      setMotion(null);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoadingDeckId(null);
    }
  }

  async function generate() {
    if (!materialId || pending.current) return;
    pending.current = true;
    setBusy(true);
    setError("");
    setMotion(null);
    try {
      const result = await api<{ deck: FlashcardDeck; sampled: boolean }>("/api/flashcards/generate", {
        method: "POST",
        body: JSON.stringify({ materialId, count }),
      });
      saveResult(result.deck);
      setFlipped(false);
      if (result.sampled) setError("The source was sampled across a large document. The deck may not cover every topic.");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      pending.current = false;
      setBusy(false);
    }
  }

  async function action(kind: FlashcardAction, cardId?: string) {
    if (!deck || pending.current) return;
    if ((kind === "known" || kind === "almost" || kind === "again") && (!flipped || !cardId)) return;
    if (kind === "almost" && deck.almost_seen.includes(cardId ?? "")) return;
    if (kind === "restart" && !window.confirm("Restart this deck? This resets your mastered and needs-work groups."))
      return;
    pending.current = true;
    setBusy(true);
    setError("");
    if (kind === "known" || kind === "almost" || kind === "again") setMotion(kind);
    const start = Date.now();
    try {
      const result = await api<{ deck: FlashcardDeck }>(`/api/flashcards/${deck.id}`, {
        method: "POST",
        body: JSON.stringify({ action: kind, cardId }),
      });
      if (kind === "known" || kind === "almost" || kind === "again") {
        await new Promise<void>((resolve) => setTimeout(resolve, Math.max(0, ANIMATION_MS - (Date.now() - start))));
      }
      saveResult(result.deck);
      setFlipped(kind === "undo");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setMotion(null);
      pending.current = false;
      setBusy(false);
    }
  }

  const cardId = deck?.active[0];
  const current = deck?.cards.find((card) => card.id === cardId);
  const secondChance = !!(cardId && deck?.almost_seen.includes(cardId));
  const completed = !!deck && deck.active.length === 0;
  const mastered = deck?.mastered.length ?? 0;
  const active = deck?.active.length ?? 0;
  const needsWork = deck?.needs_work.length ?? 0;
  const total = deck?.cards.length ?? 0;
  const completion = total ? Math.round((mastered / total) * 100) : 0;

  return (
    <>
      <PageHeader eyebrow="YOUR PERSONAL RECALL LAB" title="Flashcard Studio"
        description="Learn what sticks. Save what matters. Pick up exactly where you left off." />

      <section className="panel flash-config">
        <div className="flash-config-heading">
          <div className="flash-icon"><Layers3 size={22} /></div>
          <div><h2>Build a study deck</h2><p>Choose material you already uploaded. No extra typing, no starting over.</p></div>
        </div>
        <div className="form-grid">
          <label>Saved study material
            <select value={materialId} onChange={(e) => setMaterialId(e.target.value)} disabled={busy}>
              <option value="">Choose your notes, PDF, or guide…</option>
              {materials.map((m) => <option key={m.id} value={m.id}>{m.filename}</option>)}
            </select>
          </label>
          <label>Deck size
            <select value={count} onChange={(e) => setCount(Number(e.target.value) as 10 | 20 | 30)} disabled={busy}>
              {[10, 20, 30].map((n) => <option key={n} value={n}>{n} cards</option>)}
            </select>
          </label>
        </div>
        <div className="flash-config-actions">
          <button className="flash-btn flash-btn-primary" type="button"
            disabled={!materialId || busy || !aiReady} onClick={() => void generate()}>
            <Sparkles size={17} className={busy && !motion ? "flash-spin" : ""} />
            {busy && !motion ? "Crafting your cards…" : "Generate a new deck"}
            {!busy && <ChevronRight size={16} />}
          </button>
          <Link href="/create" className="flash-text-link">Need to upload notes? <ArrowRight size={15} /></Link>
        </div>
        <p className="helper">Generated decks and review progress are saved to your private workspace. AI generation uses your study allowance.</p>
        <ErrorMessage message={error} />
      </section>

      <section className="panel flash-library" aria-label="Your saved flashcard decks">
        <div className="flash-section-heading">
          <div><span className="flash-eyebrow"><BookMarked size={14} /> SAVED TO YOUR WORKSPACE</span><h2>Your decks</h2>
            <p>Close the app and return tomorrow. Your active, mastered and needs-work cards will still be here.</p>
          </div>
          <Save size={21} className="muted" />
        </div>
        {loading ? <p className="flash-library-empty">Loading your saved decks…</p> : decks.length === 0 ? (
          <p className="flash-library-empty">No decks yet. Generate one from your saved notes above.</p>
        ) : (
          <div className="flash-library-grid">
            {decks.map((saved) => (
              <button key={saved.id} type="button" disabled={busy || loadingDeckId !== null}
                onClick={() => void openDeck(saved.id)}
                className={`flash-deck-tile ${deck?.id === saved.id ? "selected" : ""}`}>
                <span className="flash-deck-icon"><Layers3 size={19} /></span>
                <strong>{saved.title}</strong>
                <span className="flash-deck-meta">
                  <span>{saved.active} active</span><span>{saved.mastered} mastered</span><span>{saved.needs_work} needs work</span>
                </span>
                <span className="flash-deck-footer">
                  {loadingDeckId === saved.id ? "Opening…" : deck?.id === saved.id ? "Studying now" : "Resume deck"}
                  <ArrowRight size={15} />
                </span>
              </button>
            ))}
          </div>
        )}
      </section>

      {deck && (
        <section className="panel flash-lab" aria-label="Interactive flashcards">
          <div className="flash-lab-head">
            <div>
              <span className="flash-eyebrow"><Zap size={13} /> ACTIVE RECALL MODE</span>
              <h2>{completed ? (needsWork ? "Active deck complete" : "You mastered every card!") : "Flip. Recall. Improve."}</h2>
              <p>{completed ? "Your progress is saved. Mastered and needs-work cards stay in separate groups." :
                "Every rating saves instantly. Work through your active cards at your own pace."}</p>
            </div>
            <div className="flash-tools">
              <button type="button" className="flash-tool flash-undo" onClick={() => void action("undo")} disabled={busy || !deck.previous}
                title="Undo your last rating or action"><Undo2 size={17} /> Back / Undo</button>
              <button type="button" onClick={() => void action("shuffle")} disabled={busy || active < 2} className="flash-tool" title="Shuffle remaining cards"><Shuffle size={16} /> Shuffle</button>
              <button type="button" onClick={() => void action("restart")} disabled={busy} className="flash-tool" title="Start all cards over"><RotateCcw size={16} /> Restart</button>
            </div>
          </div>

          <div className="flash-progress-line" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={completion} aria-label="Cards mastered">
            <div style={{ width: `${completion}%` }} />
          </div>
          <div className="flash-stats flash-group-stats">
            <span><i className="flash-dot purple" /> {active} active</span>
            <span><i className="flash-dot green" /> {mastered} mastered</span>
            <span><i className="flash-dot red" /> {needsWork} needs work</span>
            <strong>{completion}% mastered</strong>
          </div>

          {completed ? (
            <div className="flash-finish">
              <div className="flash-finish-icon">{needsWork ? <Archive size={34} /> : <CheckCheck size={34} />}</div>
              <h3>{mastered} of {total} cards mastered</h3>
              <p>{needsWork ? `The ${needsWork} red cards are saved separately. Come back to those whenever you're ready.` :
                "Every card is in your mastered group. Ready to test your understanding?"}</p>
              <div className="flash-finish-actions">
                {needsWork > 0 && <button className="flash-btn flash-btn-primary" type="button" disabled={busy}
                  onClick={() => void action("retry-red")}><RotateCcw size={17} /> Study the red deck ({needsWork})</button>}
                <Link className="flash-btn flash-btn-outline" href="/create"><ArrowRight size={17} /> Build a practice test</Link>
              </div>
            </div>
          ) : current && (
            <>
              <div className="flash-card-stage">
                <button type="button" key={cardId} onClick={() => { if (!busy) setFlipped(!flipped); }}
                  disabled={busy}
                  aria-label={flipped ? "Flip back to the question" : "Reveal flashcard answer"}
                  aria-pressed={flipped}
                  className={`flash-card ${flipped ? "is-flipped" : ""} ${motion ? `flash-${motion}` : ""}`}>
                  <span className="flash-card-shine" aria-hidden="true" />
                  <span className="flash-card-top"><span className="flash-card-category">{current.topic}</span><span>{flipped ? "ANSWER" : "QUESTION"}</span></span>
                  <span className="flash-card-content">{flipped ? current.back : current.front}</span>
                  <span className="flash-card-bottom"><Layers3 size={16} /> Tap to flip <span className="flash-card-number">{active} card{active === 1 ? "" : "s"} remaining</span></span>
                  {motion && <span className={`flash-feedback flash-feedback-${motion}`}>
                    {motion === "known" ? <Check size={30} /> : motion === "almost" ? <Zap size={30} /> : <RotateCcw size={30} />}
                    {motion === "known" ? "MASTERED" : motion === "almost" ? "BACK OF THE DECK" : "SAVED TO NEEDS WORK"}
                  </span>}
                </button>
              </div>
              <div className="flash-review-controls">
                {flipped ? (
                  <>
                    <button type="button" disabled={busy} className="flash-btn flash-rate flash-rate-again" onClick={() => void action("again", cardId)}>
                      <RotateCcw size={18} /><span>Needs work<small>Move to red deck</small></span>
                    </button>
                    {!secondChance && <button type="button" disabled={busy} className="flash-btn flash-rate flash-rate-almost" onClick={() => void action("almost", cardId)}>
                      <CircleHelp size={19} /><span>Almost<small>Move to back of deck</small></span>
                    </button>}
                    <button type="button" disabled={busy} className="flash-btn flash-rate flash-rate-known" onClick={() => void action("known", cardId)}>
                      <Check size={20} /><span>Know it<small>Move to mastered</small></span>
                    </button>
                  </>
                ) : <button className="flash-btn flash-btn-primary flash-reveal" onClick={() => setFlipped(true)} type="button">Reveal answer <ArrowRight size={17} /></button>}
              </div>
              <p className="flash-microcopy">{secondChance
                ? "Second chance: you already tapped Almost once. Choose green if you know it or red if you still don't."
                : "Almost moves the card to the back once. When it returns, you must choose Know it or Needs work."}</p>
            </>
          )}

          <div className="flash-saved-groups">
            <details className="flash-group-details">
              <summary><span><Check size={16} /> Mastered deck <strong>{mastered}</strong></span><ChevronRight size={16} /></summary>
              <div className="flash-group-list">
                {mastered ? deck.cards.filter((item) => deck.mastered.includes(item.id)).map((item) => (
                  <p key={item.id}><strong>{item.front}</strong><small>{item.topic}</small></p>
                )) : <p>Cards you confidently know will collect here.</p>}
              </div>
            </details>
            <details className="flash-group-details flash-group-red">
              <summary><span><TriangleAlert size={16} /> Needs-work deck <strong>{needsWork}</strong></span><ChevronRight size={16} /></summary>
              <div className="flash-group-list">
                {needsWork ? deck.cards.filter((item) => deck.needs_work.includes(item.id)).map((item) => (
                  <p key={item.id}><strong>{item.front}</strong><small>{item.topic}</small></p>
                )) : <p>Red cards will collect here until you decide to review them.</p>}
                {needsWork > 0 && active > 0 && <button type="button" className="flash-tool flash-red-retry" disabled={busy}
                  onClick={() => void action("retry-red")}><RotateCcw size={15} /> Add red cards to active deck</button>}
              </div>
            </details>
          </div>
          <div className="flash-persistent-note"><Save size={15} /> Your place and ratings are saved automatically. The Back / Undo arrow reverses your last choice.</div>
        </section>
      )}
    </>
  );
}
