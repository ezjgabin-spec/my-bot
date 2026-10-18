"use client";
import { useEffect, useState, type FormEvent } from "react";
import Link from "next/link";
import { PageHeader, ErrorMessage } from "@/components/ui";
import { AppearanceSettings } from "@/components/appearance-settings";
import { useWorkspace } from "@/components/workspace";
import type { DesktopSettings } from "@/lib/desktop";
import { CloudSettings } from "@/components/cloud-settings";
import { CodeRedemption } from "@/components/code-redemption";
export default function Settings() {
  if (process.env.NEXT_PUBLIC_STUDYPREDICT_CLOUD === "1")
    return <CloudSettings />;
  return <DesktopSettingsPage />;
}
function DesktopSettingsPage() {
  const { refresh } = useWorkspace();
  const [settings, setSettings] = useState<DesktopSettings | null>(null);
  const [key, setKey] = useState("");
  const [model, setModel] = useState("claude-sonnet-4-6");
  const [startup, setStartup] = useState(true);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [desktop, setDesktop] = useState(true);
  useEffect(() => {
    Promise.resolve()
      .then(async () => {
        if (!window.studyDesktop) {
          setDesktop(false);
          return;
        }
        const value = await window.studyDesktop.settings();
        setSettings(value);
        setModel(value.model);
        setStartup(value.startAtLogin);
      })
      .catch(() =>
        setError("Settings could not be loaded. Reopen StudyPredict."),
      );
  }, []);
  async function save(event?: FormEvent, removeKey = false) {
    event?.preventDefault();
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const value = await window.studyDesktop!.save({
        apiKey: key,
        removeKey,
        model,
        startAtLogin: startup,
      });
      setSettings(value);
      setKey("");
      await refresh();
      setMessage(
        removeKey
          ? "API key removed."
          : "Settings saved. You can start practicing.",
      );
    } catch (e) {
      const raw =
        e instanceof Error ? e.message : "Settings could not be saved.";
      setError(
        raw.replace(/^Error invoking remote method '[^']+': Error: /, ""),
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <PageHeader
        eyebrow="YOUR WINDOWS APP"
        title="One key. Ready to study."
        description="Your tests and grades stay on this computer. No Supabase account or website setup is needed."
      />
      <AppearanceSettings />
      <CodeRedemption />
      <section className="panel form-panel" style={{ maxWidth: 760 }}>
        <h2>Connect Claude</h2>
        <p className="muted">
          Claude creates questions from your notes and grades written answers.
          These requests send the relevant notes or answers to Anthropic and use
          paid API credits.
        </p>
        {!desktop ? (
          <p className="notice">
            Open the StudyPredict desktop app to save your API key. This browser
            view is for development.
          </p>
        ) : (
          <form onSubmit={save}>
            <label htmlFor="api-key">
              Anthropic API key {settings?.hasKey ? "(saved)" : ""}
            </label>
            <input
              id="api-key"
              type="password"
              value={key}
              onChange={(e) => setKey(e.target.value)}
              placeholder={
                settings?.hasKey
                  ? "Leave empty to keep your saved key"
                  : "sk-ant-…"
              }
              autoComplete="off"
              spellCheck={false}
              maxLength={512}
            />
            <p className="helper">
              Paste only the key. Windows encrypts it for your Windows account.
              The saved key is never displayed.
            </p>
            <button
              className="button secondary small"
              type="button"
              onClick={() =>
                window
                  .studyDesktop!.openKeys()
                  .catch(() => setError("Could not open your browser."))
              }
            >
              Get an Anthropic API key
            </button>
            <details style={{ margin: "24px 0" }}>
              <summary>Model settings</summary>
              <label htmlFor="model">Claude model</label>
              <input
                id="model"
                value={model}
                onChange={(e) => setModel(e.target.value)}
                required
                pattern="[a-zA-Z0-9._-]{1,100}"
              />
            </details>
            <h2>Keep StudyPredict available</h2>
            <label style={{ display: "flex", alignItems: "center", gap: 12 }}>
              <input
                type="checkbox"
                style={{ width: "auto" }}
                checked={startup}
                disabled={!settings?.startupAvailable}
                onChange={(e) => setStartup(e.target.checked)}
              />
              Start when I sign in to Windows
            </label>
            <p className="helper">
              Closing the window keeps the app in the system tray. Click its
              tray icon to reopen it, or right-click and choose Quit. Your PC
              must be awake and signed in for the app to run.
            </p>
            <ErrorMessage message={error} />
            {message && (
              <p role="status" className="success-text">
                {message}
              </p>
            )}
            <div
              style={{
                display: "flex",
                flexWrap: "wrap",
                gap: 12,
                marginTop: 20,
              }}
            >
              <button className="button" disabled={busy || !settings}>
                {busy ? "Saving…" : "Save settings"}
              </button>
              {settings?.hasKey && (
                <button
                  type="button"
                  className="button secondary"
                  disabled={busy}
                  onClick={() => save(undefined, true)}
                >
                  Remove API key
                </button>
              )}
              <Link href="/create" className="button secondary">
                Create a practice test
              </Link>
            </div>
          </form>
        )}
      </section>
      <section
        className="panel form-panel"
        style={{ maxWidth: 760, marginTop: 24 }}
      >
        <h2>Your study data</h2>
        <p className="muted">
          Notes extracted from your uploads, practice tests, answers, and grades
          are saved locally. Each successful save keeps the previous version as
          a backup. Original PDF and DOCX files are not copied.
        </p>
        <p className="helper">
          To make your own backup, quit StudyPredict and copy the data folder
          somewhere safe. The API key is stored separately and is tied to your
          Windows account.
        </p>
        {desktop && (
          <button
            className="button secondary"
            onClick={() =>
              window
                .studyDesktop!.openData()
                .catch(() => setError("Could not open the data folder."))
            }
          >
            Open data folder
          </button>
        )}
      </section>
    </>
  );
}
