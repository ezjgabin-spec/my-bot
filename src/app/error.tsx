"use client";
export default function ErrorPage({
  reset,
}: {
  error: Error;
  reset: () => void;
}) {
  return (
    <section className="panel form-panel">
      <h1>Something went wrong.</h1>
      <p>
        Your saved study data is still in your workspace. Try loading this page
        again.
      </p>
      <button className="button" onClick={reset}>
        Try again
      </button>
    </section>
  );
}
