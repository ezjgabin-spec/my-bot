"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { api } from "@/lib/client";
import {
  credits,
  PLANS,
  type PlanId,
  type Wallet,
  type UsageReceipt,
} from "@/lib/plans";
import { PageHeader, ErrorMessage } from "@/components/ui";
type Account = {
  id: string;
  email: string | null;
  plan: PlanId;
  family: boolean;
  balance: Wallet;
  costMicros: number;
  familyCostMicros: number;
  overrunMicros: number;
  pending: number;
  requests: number;
};
export default function Usage() {
  const [data, setData] = useState<{
    accounts: Account[];
    limited: boolean;
    pending: { userId: string; receipt: UsageReceipt }[];
  } | null>(null);
  const [error, setError] = useState("");
  const [selection, setSelection] = useState("");
  const [actual, setActual] = useState("");
  const [reference, setReference] = useState("");
  const [busy, setBusy] = useState(false);
  async function load() {
    try {
      setData(await api("/api/billing/admin"));
      setError("");
    } catch (e) {
      setError((e as Error).message);
    }
  }
  useEffect(() => {
    void Promise.resolve().then(load);
  }, []);
  const money = (n: number) => `$${(n / 1_000_000).toFixed(4)}`;
  const all = data?.accounts ?? [];
  return (
    <>
      <PageHeader
        eyebrow="OWNER CONSOLE"
        title="Follow every AI dollar."
        description="Provider-reported usage valued at your configured prices. Reconcile with Anthropic invoices before treating this as final billing."
      />
      <ErrorMessage message={error} />
      <div className="billing-metrics">
        <section className="panel">
          <span>Customer and free-account API cost</span>
          <strong>
            {money(
              all.reduce((s, a) => s + a.costMicros - a.familyCostMicros, 0),
            )}
          </strong>
        </section>
        <section className="panel">
          <span>Owner & family API cost</span>
          <strong>
            {money(all.reduce((s, a) => s + a.familyCostMicros, 0))}
          </strong>
        </section>
        <section className="panel">
          <span>Pending usage checks</span>
          <strong>{all.reduce((s, a) => s + a.pending, 0)}</strong>
        </section>
      </div>
      <section className="panel form-panel">
        <div className="billing-section-heading">
          <h2>Account spending · lifetime</h2>
          <button className="button secondary" onClick={() => void load()}>
            Refresh
          </button>
        </div>
        {data?.limited && (
          <p className="notice">
            Showing the 100 accounts with highest recorded cost. Totals below
            cover those accounts.
          </p>
        )}
        <div className="billing-table-wrap">
          <table className="billing-table">
            <thead>
              <tr>
                <th>Account</th>
                <th>Plan</th>
                <th>API cost</th>
                <th>Requests</th>
                <th>Credits remaining</th>
                <th>Pending</th>
                <th>Cost above reservation</th>
              </tr>
            </thead>
            <tbody>
              {all.map((a) => (
                <tr key={a.id}>
                  <td>{a.email ?? a.id}</td>
                  <td>
                    {a.family ? "Family · unlimited" : PLANS[a.plan].name}
                  </td>
                  <td>{money(a.costMicros)}</td>
                  <td>{a.requests}</td>
                  <td>
                    {a.family
                      ? "Unlimited"
                      : credits(
                          a.balance.monthly +
                            a.balance.bank +
                            a.balance.purchased,
                        ).toLocaleString()}
                  </td>
                  <td>{a.pending}</td>
                  <td>{money(a.overrunMicros)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
      {!!data?.pending.length && (
        <section className="panel form-panel">
          <h2>Reconcile a pending request</h2>
          <p>
            Check the provider’s billing records first. Enter the confirmed
            dollar cost, or zero only after confirming no usage was billed. This
            settles the reservation once and returns any unused value.
          </p>
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              const selected = data.pending.find(
                (p) => p.receipt.id === selection,
              );
              if (!selected) return;
              setBusy(true);
              setError("");
              try {
                await api("/api/billing/admin", {
                  method: "POST",
                  body: JSON.stringify({
                    userId: selected.userId,
                    receiptId: selected.receipt.id,
                    costMicros: Math.round(Number(actual) * 1_000_000),
                    reference,
                  }),
                });
                setSelection("");
                setActual("");
                setReference("");
                await load();
              } catch (err) {
                setError((err as Error).message);
              } finally {
                setBusy(false);
              }
            }}
          >
            <label>
              Pending request
              <select
                value={selection}
                onChange={(e) => setSelection(e.target.value)}
                required
              >
                <option value="">Choose a request</option>
                {data.pending.map((p) => (
                  <option key={p.receipt.id} value={p.receipt.id}>
                    {p.userId} · {p.receipt.operation} ·{" "}
                    {new Date(p.receipt.at).toLocaleString()} ·{" "}
                    {p.receipt.id.slice(0, 8)}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Confirmed provider cost (USD)
              <input
                type="number"
                min="0"
                max="1000"
                step="0.000001"
                value={actual}
                onChange={(e) => setActual(e.target.value)}
                required
              />
            </label>
            <label>
              Provider record or reconciliation reference
              <input
                value={reference}
                onChange={(e) => setReference(e.target.value)}
                minLength={5}
                maxLength={200}
                required
              />
            </label>
            <button className="button" disabled={busy}>
              {busy ? "Settling…" : "Settle confirmed usage"}
            </button>
          </form>
        </section>
      )}
      <section className="panel form-panel">
        <h2>Cost targets and remaining obligations</h2>
        <p>
          Included API budgets: StudyBot $3.75, Plus $8, Ultra $40 per paid
          month. Unused and purchased balances remain obligations for future
          usage. They are not profit.
        </p>
        <p>
          Contribution targets are $8, $15 and $20 after the assumed payment
          fee, included AI allowance and hosting reserve. Actual profit depends
          on payment fees, refunds, chargebacks, taxes, hosting, marketing and
          other expenses. Free and family usage are separately funded.
        </p>
        <p>
          Any pending request or cost above its reservation needs review against
          the provider dashboard. Update model pricing before switching models
          or when provider prices change.
        </p>
        <Link href="/pricing" className="text-link">
          Back to plans and credits →
        </Link>
      </section>
    </>
  );
}
