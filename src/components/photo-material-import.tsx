"use client";

import { useEffect, useRef, useState } from "react";
import { Camera, Check, LoaderCircle } from "lucide-react";
import { api } from "@/lib/client";
import { prepareStudyPhoto } from "@/lib/photo-client";
import { MAX_MATERIAL_CHARACTERS } from "@/lib/material-limits";

export function PhotoMaterialImport({
  aiReady,
  onSaved,
}: {
  aiReady: boolean;
  onSaved: (material: { id: string; filename: string }) => void;
}) {
  const [files, setFiles] = useState<File[]>([]);
  const [draft, setDraft] = useState("");
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");
  const [reading, setReading] = useState(false);
  const [saving, setSaving] = useState(false);
  const processed = useRef<string[]>([]);

  useEffect(() => {
    const warn = (event: BeforeUnloadEvent) => {
      if (reading || saving || draft.trim()) {
        event.preventDefault();
        event.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [reading, saving, draft]);

  function selectFiles(selected: File[]) {
    setFiles(selected);
    processed.current = [];
    setDraft("");
    setError("");
    setStatus("");
  }

  async function readPhotos() {
    if (!files.length || files.length > 8 || reading || saving) return;
    setReading(true);
    setError("");
    try {
      for (let index = processed.current.length; index < files.length; index++) {
        setStatus("Reading photo " + (index + 1) + " of " + files.length + "…");
        const image = await prepareStudyPhoto(files[index]);
        const data = await api<{ text: string }>("/api/materials/photo", {
          method: "POST",
          body: JSON.stringify({ requestId: crypto.randomUUID(), image }),
        });
        processed.current.push("Photo " + (index + 1) + " — " + files[index].name + "\n" + data.text);
        setDraft(processed.current.join("\n\n"));
      }
      setStatus("Photos transcribed. Review and correct the extracted text before creating a test.");
    } catch (cause) {
      setError((cause as Error).message + " Earlier photos are kept in this tab. Retry continues from the failed photo.");
    } finally {
      setReading(false);
    }
  }

  async function save() {
    if (!draft.trim() || reading || saving) return;
    setSaving(true);
    setError("");
    try {
      const result = await api<{ id: string; filename: string }>("/api/materials", {
        method: "POST",
        body: JSON.stringify({
          filename: "Photos of class notes — study material.txt",
          text: draft,
        }),
      });
      setDraft("");
      onSaved(result);
    } catch (cause) {
      setError((cause as Error).message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="interpreter">
      <label className="upload-zone">
        <Camera size={24} />
        <strong>{files.length ? files.length + " photos selected" : "Choose photos of notes or worksheets"}</strong>
        <span>JPG, PNG, or other supported phone photos · up to 8 images</span>
        <span>Photograph each page clearly and keep all important writing in frame.</span>
        <input
          type="file"
          accept="image/*"
          multiple
          disabled={reading || saving}
          onChange={(event) => selectFiles(Array.from(event.currentTarget.files ?? []))}
        />
      </label>
      <p className="helper">StudyPredict will transcribe your photos into editable study material. The photos are sent to the AI provider for reading but are not saved with your study guide. Each photo uses AI credits; check formulas and handwriting carefully.</p>
      {files.length > 8 && <p role="alert">Select no more than 8 photos at a time.</p>}
      <button
        type="button"
        className="button secondary"
        disabled={!aiReady || !files.length || files.length > 8 || reading || saving || processed.current.length === files.length}
        onClick={() => void readPhotos()}
      >
        {reading ? <LoaderCircle size={16} className="spin" /> : <Camera size={16} />}
        {reading ? "Reading photos…" : processed.current.length ? "Resume reading photos" : "Read photos"}
      </button>
      {!aiReady && <p className="helper">The AI connection must be ready to read photos.</p>}
      {status && <p role="status">{status}</p>}
      {draft && (
        <div>
          <label>
            <strong>Review and edit your photo notes</strong>
            <textarea
              rows={13}
              value={draft}
              maxLength={MAX_MATERIAL_CHARACTERS}
              disabled={reading || saving}
              onChange={(event) => setDraft(event.target.value)}
              placeholder="Transcribed notes appear here…"
            />
          </label>
          <p className="helper">Your test will use this text, so fix missing symbols, names, and equations before saving.</p>
          <button type="button" className="button" disabled={!draft.trim() || reading || saving} onClick={() => void save()}>
            <Check size={16} /> {saving ? "Saving…" : "Save photo notes & use for test"}
          </button>
        </div>
      )}
      {error && <p role="alert" className="interpreter-warning">{error}</p>}
    </div>
  );
}
