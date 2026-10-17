import { redirect } from "next/navigation";
export default function Login() {
  if (process.env.NEXT_PUBLIC_STUDYPREDICT_CLOUD === "1")
    return (
      <section className="panel form-panel login-card">
        <h1>Welcome to StudyPredict</h1>
        <p>
          Sign in with your email address. Cloudflare will email you a code—no
          password needed.
        </p>
        {/* A full navigation lets Cloudflare Access start its external email-code flow. */}
        {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
        <a className="button" href="/">
          Sign in with email
        </a>
        <p className="helper">
          Your tests and grades belong to your own private workspace.
        </p>
      </section>
    );
  redirect("/settings");
}
