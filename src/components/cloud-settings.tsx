"use client";
import { PageHeader } from "./ui";
import { AppearanceSettings } from "./appearance-settings";
import { useWorkspace } from "./workspace";
import { CodeRedemption } from "./code-redemption";
import Link from "next/link";
export function CloudSettings() {
  const { aiReady, email, connection, error } = useWorkspace();
  return (
    <>
      <PageHeader
        eyebrow="YOUR ACCOUNT"
        title="Your space. Your progress."
        description="Your notes, practice tests, and grades are private to your signed-in account."
      />
      <AppearanceSettings />
      <CodeRedemption />
      <section className="panel form-panel" style={{ maxWidth: 760 }}>
        <h2>Signed in as</h2>
        <p>{email || "Loading your account…"}</p>
        <a className="button secondary" href="/cdn-cgi/access/logout">
          Sign out
        </a>
        <h2 style={{ marginTop: 32 }}>Claude connection</h2>
        <p className="notice">
          {connection === "error"
            ? error
            : aiReady
              ? "Connected. Your plan and access are managed under Plans & credits."
              : "The owner needs to add the shared Anthropic API key in Cloudflare."}
        </p>
        <p className="muted">
          Claude receives your study notes when generating questions and your
          answers when grading written work. The shared key stays on the server.
        </p>
      </section>
      <section
        className="panel form-panel"
        style={{ maxWidth: 760, marginTop: 24 }}
      >
        <h2>Your study data</h2>
        <p className="muted">
          Your work is saved online and follows your account between devices.
          Other users have their own separate workspaces. The site owner
          administers the storage.
        </p>
        <p className="helper">
          View your allowances, Free Test Bank, purchased credits and recent
          AI activity under <Link href="/pricing">Plans & credits</Link>.
          Your existing tests remain available when credits run out.
        </p>
        <p className="helper">
          Work saved in the Windows desktop app stays in that app. This online
          workspace starts fresh.
        </p>
      </section>
    </>
  );
}
