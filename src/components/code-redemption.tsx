"use client";
import { useState, type FormEvent } from "react";
import { api } from "@/lib/client";
import { useWorkspace } from "./workspace";
import { ErrorMessage } from "./ui";
export function CodeRedemption({ onRedeem }: { onRedeem?: () => void }) {
  const { refresh } = useWorkspace();
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);
  async function redeem(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      await api("/api/billing/code", {
        method: "POST",
        body: JSON.stringify({ code }),
      });
      setCode("");
      setDone(true);
      await refresh();
      onRedeem?.();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="panel form-panel code-section">
      <h2>Code</h2>
      <p className="muted">Have an access code? Redeem it for this account.</p>
      <form onSubmit={redeem}>
        <label htmlFor="access-code">Access code</label>
        <div className="code-row">
          <input
            id="access-code"
            type="password"
            autoComplete="off"
            maxLength={200}
            value={code}
            onChange={(e) => setCode(e.target.value)}
            required
            placeholder="Enter your code"
          />
          <button className="button" disabled={busy || !code.trim()}>
            {busy ? "Checking…" : "Redeem"}
          </button>
        </div>
      </form>
      <ErrorMessage message={error} />
      {done && (
        <p className="success-text" role="status">
          Unlimited Ultra unlocked. All features, no credits or subscription
          required.
        </p>
      )}
    </section>
  );
}
