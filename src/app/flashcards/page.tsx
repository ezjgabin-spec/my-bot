"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { ArrowLeft, ArrowRight, Check, ChevronRight, Layers3, RotateCcw, Shuffle, Sparkles, Zap, CircleHelp, CheckCheck } from "lucide-react";
import { useWorkspace } from "@/components/workspace";
import { PageHeader, ErrorMessage } from "@/components/ui";
import { api } from "@/lib/client";

type Card = { front: string; back: string; topic: string };
type Rating = "known" | "almost" | "again";
type Motion = Rating | null;
const DELAY = 460;

export default function FlashcardsPage() {
  const { connection, aiReady } = useWorkspace();
  const [materials, setMaterials] = useState<{ id: string; filename: string }[]>([]);
  const [materialId, setMaterialId] = useState("");
  const [count, setCount] = useState<10 | 20 | 30>(10);
  const [cards, setCards] = useState<Card[]>([]);
  const [queue, setQueue] = useState<number[]>([]);
  const [rating, setRating] = useState<Record<number, Rating>>({});
  const [flipped, setFlipped] = useState(false);
  const [motion, setMotion] = useState<Motion>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (connection !== "ready") return;
    api<{ materials: { id: string; filename: string }[] }>("/api/materials")
      .then((data) => setMaterials(data.materials))
      .catch((e: Error) => setError(e.message));
  }, [connection]);
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);

  const currentId = queue[0];
  const current = cards[currentId];
  const known = Object.values(rating).filter((value) => value === "known").length;
  const almost = Object.values(rating).filter((value) => value === "almost").length;
  const again = Object.values(rating).filter((value) => value === "again").length;
  const finished = cards.length > 0 && queue.length === 0;
  const completion = cards.length ? Math.round((known / cards.length) * 100) : 0;

  async function generate() {
    if (!materialId || busy) return;
    if (timer.current) clearTimeout(timer.current);
    setBusy(true); setError(""); setMotion(null);
    try {
      const result = await api<{ cards: Card[]; sampled: boolean }>("/api/flashcards/generate", {
        method: "POST",
        body: JSON.stringify({ materialId, count }),
      });
      setCards(result.cards);
      setQueue(result.cards.map((_, i) => i));
      setRating({});
      setFlipped(false);
      if (result.sampled) setError("This large document was sampled across sections. The deck may not cover every topic.");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  function review(result: Rating) {
    if (!flipped || motion || currentId === undefined) return;
    setMotion(result);
    timer.current = setTimeout(() => {
      setRating((existing) => ({ ...existing, [currentId]: result }));
      setQueue((existing) => {
        const remaining = existing.slice(1);
        if (result === "known") return remaining;
        if (result === "almost") return [...remaining, currentId];
        // "Again" comes back soon, but not immediately.
        const next = [...remaining];
        next.splice(Math.min(2, next.length), 0, currentId);
        return next;
      });
      setFlipped(false);
      setMotion(null);
      timer.current = null;
    }, DELAY);
  }
  function reset() {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    setQueue(cards.map((_, i) => i));
    setRating({});
    setFlipped(false);
    setMotion(null);
  }
  function shuffle() {
    if (motion) return;
    const shuffled = [...queue];
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    setQueue(shuffled);
    setFlipped(false);
  }
  return (
    <>
      <PageHeader eyebrow="YOUR PERSONAL RECALL LAB" title="Flashcard Studio"
        description="Your actual class materials, transformed into a smarter way to remember." />
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
            disabled={!materialId || busy || !aiReady} onClick={generate}>
            <Sparkles size={17} className={busy ? "flash-spin" : ""} />
            {busy ? "Crafting your cards…" : cards.length ? "Generate a fresh deck" : "Generate flashcards"}
            {!busy && <ChevronRight size={16} />}
          </button>
          <Link href="/create" className="flash-text-link">Need to upload notes? <ArrowRight size={15} /></Link>
        </div>
        <p className="helper">AI generation uses your existing study allowance. Your current deck stays available until you leave or refresh this page.</p>
        <ErrorMessage message={error} />
      </section>

      {cards.length > 0 && (
        <section className="panel flash-lab" aria-label="Interactive flashcards">
          <div className="flash-lab-head">
            <div>
              <span className="flash-eyebrow"><Zap size={13} /> ACTIVE RECALL MODE</span>
              <h2>{finished ? "You cleared the deck!" : "Flip. Recall. Improve."}</h2>
              <p>{finished ? "Every card was marked as known." : "Mark what you remember. The tough ones come back around."}</p>
            </div>
            <div className="flash-tools">
              <button type="button" onClick={shuffle} disabled={motion !== null || finished} className="flash-tool" title="Shuffle remaining cards"><Shuffle size={16} /> Shuffle</button>
              <button type="button" onClick={reset} className="flash-tool" title="Restart this deck"><RotateCcw size={16} /> Reset</button>
            </div>
          </div>
          <div className="flash-progress-line"><div style={{ width: `${completion}%` }} /></div>
          <div className="flash-stats">
            <span><i className="flash-dot green" /> {known} mastered</span>
            <span><i className="flash-dot yellow" /> {almost} almost</span>
            <span><i className="flash-dot red" /> {again} need work</span>
            <strong>{completion}% mastered</strong>
          </div>
          {finished ? (
            <div className="flash-finish">
              <div className="flash-finish-icon"><CheckCheck size={34} /></div>
              <h3>All {cards.length} cards mastered</h3>
              <p>Nice work. Test your understanding with fresh practice questions to make sure it sticks.</p>
              <div className="flash-finish-actions">
                <button className="flash-btn flash-btn-primary" type="button" onClick={reset}><RotateCcw size={17} /> Study again</button>
                <Link className="flash-btn flash-btn-outline" href="/create"><ArrowRight size={17} /> Build a practice test</Link>
              </div>
            </div>
          ) : current ? (
            <>
              <div className="flash-card-stage">
                <button type="button" key={currentId} onClick={() => { if (!motion) setFlipped(!flipped); }}
                  disabled={motion !== null}
                  aria-label={flipped ? "Flip to the question" : "Reveal flashcard answer"}
                  aria-pressed={flipped}
                  className={`flash-card ${flipped ? "is-flipped" : ""} ${motion ? `flash-${motion}` : ""}`}>
                  <span className="flash-card-shine" aria-hidden="true" />
                  <span className="flash-card-top"><span className="flash-card-category">{current.topic}</span><span>{flipped ? "ANSWER" : "QUESTION"}</span></span>
                  <span className="flash-card-content">{flipped ? current.back : current.front}</span>
                  <span className="flash-card-bottom"><Layers3 size={16} /> Tap anywhere to flip <span className="flash-card-number">{cards.length - queue.length + 1} / {cards.length} mastered path</span></span>
                  {motion && <span className={`flash-feedback flash-feedback-${motion}`}>{motion === "known" ? <Check size={30} /> : motion === "almost" ? <Zap size={30} /> : <RotateCcw size={30} />}{motion === "known" ? "MASTERED" : motion === "almost" ? "BACK IN THE DECK" : "TRY AGAIN SOON"}</span>}
                </button>
              </div>
              <div className="flash-review-controls">
                {flipped ? (
                  <>
                    <button type="button" disabled={motion !== null} className="flash-btn flash-rate flash-rate-again" onClick={() => review("again")}><RotateCcw size={18} /><span>Again<small>Bring it back soon</small></span></button>
                    <button type="button" disabled={motion !== null} className="flash-btn flash-rate flash-rate-almost" onClick={() => review("almost")}><CircleHelp size={19} /><span>Almost<small>Move to back of deck</small></span></button>
                    <button type="button" disabled={motion !== null} className="flash-btn flash-rate flash-rate-known" onClick={() => review("known")}><Check size={20} /><span>Know it<small>Master this card</small></span></button>
                  </>
                ) : <button className="flash-btn flash-btn-primary flash-reveal" onClick={() => setFlipped(true)} type="button">Reveal answer <ArrowRight size={17} /></button>}
              </div>
              <p className="flash-microcopy">Green removes the card · Yellow sends it to the back · Red brings it back soon</p>
            </>
          ) : null}
        </section>
      )}
    </>
  );
}
