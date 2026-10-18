"use client";
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import {
  Check,
  Crown,
  Gift,
  Infinity as InfinityIcon,
  Wallet,
  Zap,
} from "lucide-react";
import { api } from "@/lib/client";
import {
  PLANS,
  PACKS,
  credits,
  type PaidPlan,
  type PackId,
  type PlanId,
  type Wallet as Balances,
  type UsageReceipt,
} from "@/lib/plans";
import { PageHeader, ErrorMessage } from "@/components/ui";
import { CodeRedemption } from "@/components/code-redemption";
type Summary = {
  plan: PlanId;
  family: boolean;
  balance: Balances;
  freeTests: number;
  nextFreeAt: string;
  paidUntil: string | null;
  canManageSubscription: boolean;
  pendingCount: number;
  usage: UsageReceipt[];
  payments: {
    ready: boolean;
    plans: Record<string, boolean>;
    packs: Record<string, boolean>;
  };
  admin: boolean;
};
const count = (micros: number) =>
  credits(micros).toLocaleString(undefined, { maximumFractionDigits: 3 });
export default function Pricing() {
  const [data, setData] = useState<Summary | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState("");
  const [returned, setReturned] = useState(false);
  const load = useCallback(async () => {
    try {
      setData(await api<Summary>("/api/billing"));
    } catch (e) {
      setError((e as Error).message);
    }
  }, []);
  useEffect(() => {
    void Promise.resolve().then(() => {
      void load();
      setReturned(
        new URLSearchParams(window.location.search).get("checkout") ===
          "success",
      );
    });
  }, [load]);
  async function checkout(kind: "plan" | "pack", product: PaidPlan | PackId) {
    setBusy(product);
    setError("");
    try {
      const result = await api<{ url: string }>("/api/billing/checkout", {
        method: "POST",
        body: JSON.stringify({ kind, product, requestId: crypto.randomUUID() }),
      });
      window.location.assign(result.url);
    } catch (e) {
      setError((e as Error).message);
      setBusy("");
    }
  }
  async function portal() {
    setBusy("portal");
    setError("");
    try {
      const result = await api<{ url: string }>("/api/billing/portal", {
        method: "POST",
      });
      window.location.assign(result.url);
    } catch (e) {
      setError((e as Error).message);
      setBusy("");
    }
  }
  return (
    <>
      <PageHeader
        eyebrow="PLANS & CREDITS"
        title="Your next breakthrough starts here."
        description="Choose your pace. Credits follow the actual AI work, so a quick quiz costs less than a long exam."
      />
      <ErrorMessage message={error} />
      {returned && (
        <p className="notice" role="status">
          Checkout returned successfully. Your balance updates when payment is
          confirmed.{" "}
          <button
            className="button small secondary"
            onClick={() => void load()}
          >
            Refresh balance
          </button>
        </p>
      )}
      {data?.family ? (
        <section className="family-banner">
          <InfinityIcon size={36} />
          <div>
            <span className="tiny-label">PERMANENT FAMILY ACCESS</span>
            <h2>Ultra. Everything unlocked.</h2>
            <p>
              No monthly limit. No credit deductions. No subscription needed.
            </p>
          </div>
          <Link className="button" href="/create">
            Start practicing
          </Link>
        </section>
      ) : data ? (
        <section className="billing-wallet panel">
          <div>
            <span className="tiny-label">YOUR PLAN</span>
            <h2>{PLANS[data.plan].name}</h2>
            {data.plan === "free" ? (
              <p>
                {data.freeTests} free test available · next refresh{" "}
                {new Date(data.nextFreeAt).toLocaleDateString()}
              </p>
            ) : (
              <p>
                Current paid period ends{" "}
                {data.paidUntil &&
                  new Date(data.paidUntil).toLocaleDateString()}
              </p>
            )}
          </div>
          <div>
            <Wallet />
            <strong>{count(data.balance.monthly)}</strong>
            <span>Monthly credits</span>
          </div>
          <div>
            <Gift />
            <strong>{count(data.balance.bank)}</strong>
            <span>Free Test Bank · credits</span>
          </div>
          <div>
            <Zap />
            <strong>{count(data.balance.purchased)}</strong>
            <span>Purchased credits</span>
          </div>
          {data.plan === "free" && (
            <p className="helper">
              Free processing remaining: $
              {(data.balance.free / 1_000_000).toFixed(2)}. Uploads are
              supported; AI interpretation and written grading share this weekly
              allowance.
            </p>
          )}
          {data.canManageSubscription && (
            <button
              className="button secondary"
              disabled={!!busy}
              onClick={() => void portal()}
            >
              Manage subscription
            </button>
          )}
        </section>
      ) : (
        <p role="status">Loading your account…</p>
      )}
      {!data?.family && (
        <>
          {data && !data.payments.ready && (
            <p className="notice">
              Paid plans are coming soon. Checkout is not connected yet, and no
              payment will be taken. Free practice and access codes work now.
            </p>
          )}
          <div className="pricing-grid">
            {(Object.entries(PLANS) as [PlanId, (typeof PLANS)[PlanId]][]).map(
              ([id, plan]) => (
                <section
                  className={`panel price-card ${id === "plus" ? "featured" : ""}`}
                  key={id}
                >
                  <span className="tiny-label">
                    {id === "plus"
                      ? "MORE ROOM TO PRACTICE"
                      : id === "ultra"
                        ? "MAXIMUM CAPACITY"
                        : "YOUR STUDY ROUTINE"}
                  </span>
                  <h2>
                    {id === "ultra" && <Crown size={20} />} {plan.name}
                  </h2>
                  <p className="plan-price">
                    ${(plan.priceCents / 100).toFixed(plan.priceCents ? 2 : 0)}
                    <span>/month</span>
                  </p>
                  <p className="muted">{plan.description}</p>
                  <ul>
                    {plan.features.map((feature) => (
                      <li key={feature}>
                        <Check size={16} />
                        {feature}
                      </li>
                    ))}
                  </ul>
                  {id === "free" ? (
                    <Link className="button secondary full" href="/create">
                      Try a practice test
                    </Link>
                  ) : (
                    <button
                      className="button full"
                      disabled={
                        !data ||
                        !!busy ||
                        !data.payments.plans[id] ||
                        data.plan !== "free" ||
                        data.canManageSubscription
                      }
                      onClick={() => void checkout("plan", id)}
                    >
                      {busy === id
                        ? "Opening checkout…"
                        : data?.plan === id
                          ? "Current plan"
                          : !data?.payments.plans[id]
                            ? "Coming soon"
                            : "Choose " + plan.name}
                    </button>
                  )}
                </section>
              ),
            )}
          </div>
          <section className="panel form-panel">
            <h2>Extra credits, whenever you need them.</h2>
            <p className="muted">
              Purchased credits never reset or expire. Your monthly and banked
              value are used before purchased credits.
            </p>
            <div className="credit-packs">
              {(
                Object.entries(PACKS) as [PackId, (typeof PACKS)[PackId]][]
              ).map(([id, pack]) => (
                <div key={id}>
                  <strong>{pack.credits} credits</strong>
                  <span>${(pack.priceCents / 100).toFixed(2)}</span>
                  <button
                    className="button secondary"
                    disabled={!data?.payments.packs[id] || !!busy}
                    onClick={() => void checkout("pack", id)}
                  >
                    {data?.payments.packs[id] ? "Buy credits" : "Coming soon"}
                  </button>
                </div>
              ))}
            </div>
          </section>
        </>
      )}
      <section className="panel form-panel billing-explainer">
        <h2>Fair usage. Every request accounted for.</h2>
        <p>
          One credit covers $0.025 of AI processing at the configured model
          rates. Fractional credits preserve small amounts. Document
          interpretation, test generation and written grading use credits;
          multiple-choice scoring and unlocked predictions do not.
        </p>
        <p>
          At renewal, unused monthly value moves into your{" "}
          <strong>Free Test Bank</strong>, and your plan refills. The bank pays
          for new practice before monthly credits. Its exact credit value is
          preserved; the number of tests it covers depends on their size.
          Purchased credits stay separate and never expire.
        </p>
        <p>
          Available credits are reserved before an AI request. Unused reserved
          value is returned after the provider reports usage. A timed-out
          request may stay pending until its cost is checked. Provider
          processing can consume allowance even when a response cannot produce a
          usable test.
        </p>
        <p className="helper">
          All plans share the app’s supported document formats and technical
          size limits. Grade predictions are estimates, not guaranteed school
          results. Free processing has a $0.30 weekly allowance; large documents
          or long written exams may need credits.
        </p>
      </section>
      <CodeRedemption onRedeem={() => void load()} />
      <section className="panel form-panel">
        <div className="billing-section-heading">
          <h2>Recent AI usage</h2>
          <button
            className="button secondary small"
            onClick={() => void load()}
          >
            Refresh
          </button>
        </div>
        {!!data?.pendingCount && (
          <p className="notice">
            {data.pendingCount} request(s) have a pending reservation. Reserved
            value cannot be spent twice.
          </p>
        )}
        <div className="billing-table-wrap">
          <table className="billing-table">
            <thead>
              <tr>
                <th>When</th>
                <th>Activity</th>
                <th>Model</th>
                <th>Status</th>
                <th>Credits</th>
              </tr>
            </thead>
            <tbody>
              {data?.usage.map((row) => (
                <tr key={row.id}>
                  <td>{new Date(row.at).toLocaleString()}</td>
                  <td>{row.operation}</td>
                  <td>{row.model}</td>
                  <td>{row.status}</td>
                  <td>
                    {row.family
                      ? "Included · unlimited"
                      : row.status === "reserved" || row.status === "uncertain"
                        ? `${count(row.reserved)} reserved`
                        : count(row.chargedMicros)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {!data?.usage.length && (
          <p className="muted">Your AI requests will appear here.</p>
        )}
        {data?.admin && (
          <Link href="/usage" className="text-link">
            Open owner usage dashboard →
          </Link>
        )}
      </section>
    </>
  );
}
