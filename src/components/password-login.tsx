"use client";
import { useState, type FormEvent } from "react";
import { ArrowRight, KeyRound, Mail, ShieldCheck } from "lucide-react";

type Step = "signin" | "signup" | "verify";
export function PasswordLogin() {
  const [step, setStep] = useState<Step>("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [code, setCode] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  async function submit(event: FormEvent) {
    event.preventDefault();
    if (busy) return;
    setError("");
    if (step === "signup" && password !== confirm) {
      setError("Passwords do not match."); return;
    }
    setBusy(true);
    try {
      const path = step === "verify" ? "verify" : step === "signup" ? "register" : "login";
      const response = await fetch(`/api/auth/${path}`, {
        method: "POST", credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(step === "verify" ? { email, code } : { email, password }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Sign-in failed.");
      if (step === "signup") {
        setStep("verify");
        setCode("");
        setPassword("");
        setConfirm("");
      } else {
        window.location.assign("/");
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not sign in.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="panel form-panel login-card">
      <div className="eyebrow"><ShieldCheck size={14}/> PRIVATE STUDENT ACCOUNT</div>
      <h1>{step === "signup" ? "Create your account." : step === "verify" ? "Check your inbox." : "Welcome back."}</h1>
      <p style={{ margin: "12px 0 24px" }}>
        {step === "signup" ? "Your personal study space starts here." :
          step === "verify" ? "Enter the six-digit code we emailed you. Codes expire after 10 minutes." :
            "Sign in to keep studying where you left off."}
      </p>
      <form onSubmit={submit}>
        <label htmlFor="account-email"><Mail size={14}/> Email address</label>
        <input id="account-email" type="email" required autoComplete="email"
          value={email} onChange={(event) => setEmail(event.target.value)} maxLength={200}
          readOnly={step === "verify"} placeholder="you@example.com"/>
        {step !== "verify" ? <>
          <label htmlFor="account-password"><KeyRound size={14}/> Password</label>
          <input id="account-password" type="password" required minLength={step === "signup" ? 12 : 1}
            maxLength={128} autoComplete={step === "signup" ? "new-password" : "current-password"}
            value={password} onChange={(event) => setPassword(event.target.value)} />
          {step === "signup" && <>
            <label htmlFor="account-confirm">Confirm password</label>
            <input id="account-confirm" type="password" required minLength={12} maxLength={128}
              autoComplete="new-password" value={confirm} onChange={(event) => setConfirm(event.target.value)}/>
            <p className="helper">At least 12 characters. Use a unique password.</p>
          </>}
        </> : <>
          <label htmlFor="verification-code">Email verification code</label>
          <input id="verification-code" type="text" inputMode="numeric" autoComplete="one-time-code"
            pattern="[0-9]{6}" minLength={6} maxLength={6} required
            value={code} onChange={(event) => setCode(event.target.value)} placeholder="000000"/>
        </>}
        {error && <div className="form-error" role="alert">{error}</div>}
        <button className="button full" type="submit" disabled={busy}>
          {busy ? "Working…" : step === "signin" ? "Sign in" : step === "signup" ? "Send verification code" : "Verify and continue"}
          <ArrowRight size={16}/>
        </button>
      </form>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 14, marginTop: 22 }}>
        {step !== "signin" ? <button type="button" className="text-link"
          onClick={() => {setError("");setStep("signin");}}>Already have an account? Sign in</button> :
          <button type="button" className="text-link"
            onClick={() => {setError("");setStep("signup");}}>New here? Create account</button>}
        {step === "verify" && <button type="button" className="text-link"
          onClick={() => {setError("");setStep("signup");}}>Resend a code</button>}
      </div>
      <p className="helper">Your notes and scores stay in your own private workspace. Password-based accounts are separate from older Cloudflare Access accounts.</p>
    </section>
  );
}
