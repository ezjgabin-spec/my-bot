import Link from "next/link";
import { ArrowUpRight, BookOpen } from "lucide-react";
import type { ReactNode } from "react";
export function PageHeader({
  eyebrow,
  title,
  description,
  action,
}: {
  eyebrow: string;
  title: string;
  description: string;
  action?: ReactNode;
}) {
  return (
    <div className="page-heading">
      <div>
        <div className="eyebrow">{eyebrow}</div>
        <h1>{title}</h1>
        <p>{description}</p>
      </div>
      {action}
    </div>
  );
}
export function Empty({
  title,
  text,
  href,
  action,
}: {
  title: string;
  text: string;
  href?: string;
  action?: string;
}) {
  return (
    <div className="empty-state">
      <span className="empty-icon">
        <BookOpen size={24} />
      </span>
      <h3>{title}</h3>
      <p>{text}</p>
      {href && (
        <Link href={href} className="text-link">
          {action ?? "Get started"}
          <ArrowUpRight size={16} />
        </Link>
      )}
    </div>
  );
}
export function ErrorMessage({ message }: { message: string }) {
  return message ? (
    <div className="form-error" role="alert">
      {message}
    </div>
  ) : null;
}
export function Badge({
  children,
  tone = "",
}: {
  children: ReactNode;
  tone?: string;
}) {
  return <span className={`badge ${tone}`}>{children}</span>;
}
