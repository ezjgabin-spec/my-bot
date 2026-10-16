import { Empty } from "@/components/ui";
export default function NotFound() {
  return (
    <section className="panel">
      <Empty
        title="This page isn’t here"
        text="Return to your overview to continue studying."
        href="/"
        action="Back to overview"
      />
    </section>
  );
}
