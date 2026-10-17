"use client";
import { PageHeader } from "./ui";
import { useWorkspace } from "./workspace";
export function CloudSettings() {
  const { aiReady, email, connection, error } = useWorkspace();
  return (
    <>
      <PageHeader
        eyebrow="YOUR ACCOUNT"
        title="Your space. Your progress."
        description="Your notes, practice tests, and grades are private to your signed-in account."
      />
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
              ? "Connected. AI usage is paid for by the owner."
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
          AI requests have daily account and site limits to control shared
          costs. Limits reset at midnight UTC. Your existing tests remain
          available when a limit is reached.
        </p>
        <p className="helper">
          Work saved in the Windows desktop app stays in that app. This online
          workspace starts fresh.
        </p>
      </section>
    </>
  );
}
