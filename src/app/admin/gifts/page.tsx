"use client";

import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import Link from "next/link";
import { Gift, ShieldCheck, Users, Clock3, Wallet, RotateCcw } from "lucide-react";
import { api } from "@/lib/client";
import { useWorkspace } from "@/components/workspace";
import { PageHeader, ErrorMessage } from "@/components/ui";
import "./gifts.css";

type GiftStatus = {
  tier: "study" | "plus";
  expiresAt: string;
  remainingMicros: number;
  initialMicros: number;
  active: boolean;
};
type Account = {
  id: string;
  email: string | null;
  plan: string;
  family: boolean;
  isPaidSubscriber: boolean;
  gift: GiftStatus | null;
};
type Listing = { accounts: Account[]; limited: boolean };

const money = (micros: number) => "$" + (micros / 1_000_000).toFixed(2);

export default function OwnerGifts() {
  const { owner, connection, email: myEmail } = useWorkspace();
  const [data, setData] = useState<Listing | null>(null);
  const [recipient, setRecipient] = useState("");
  const [tier, setTier] = useState<"study" | "plus">("plus");
  const [days, setDays] = useState(14);
  const [budgetCents, setBudgetCents] = useState(200);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const load = useCallback(async () => {
    try {
      const result = await api<Listing>("/api/admin/gifts");
      setData(result); setError("");
    } catch (e) { setError((e as Error).message); }
  }, []);
  useEffect(() => {
    if (connection === "ready" && owner) void load();
  }, [connection, owner, load]);

  const visible = useMemo(() =>
    [...(data?.accounts ?? [])].sort((a,b) =>
      Number(Boolean(b.gift?.active)) - Number(Boolean(a.gift?.active)) ||
      Number(b.family) - Number(a.family) ||
      (a.email ?? a.id).localeCompare(b.email ?? b.id)
    ), [data]);
  const active = visible.filter((a) => a.gift?.active);
  const family = visible.filter((a) => a.family);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (busy) return;
    const target = recipient.trim().toLowerCase();
    if (!window.confirm("Gift " + tier.toUpperCase() + " to " + target + " for " + days +
      " days, with a maximum $" + (budgetCents / 100).toFixed(2) + " of AI processing?")) return;
    setBusy(true); setError(""); setNotice("");
    try {
      await api("/api/admin/gifts", {
        method: "POST",
        body: JSON.stringify({ action: "grant", email: target, tier, days, budgetCents }),
      });
      setNotice("Gift activated only for " + target + ". No code was generated.");
      await load();
    } catch (e) { setError((e as Error).message); }
    finally { setBusy(false); }
  }

  async function revoke(email: string, kind: "revoke-gift" | "revoke-family") {
    if (busy) return;
    const message = kind === "revoke-family"
      ? "Remove PERMANENT unlimited family access for " + email + "? Saved schoolwork will remain, but paid features will be locked unless separately purchased."
      : "End gifted access for " + email + " immediately? Their remaining gift AI budget will no longer be usable.";
    if (!window.confirm(message)) return;
    setBusy(true); setError(""); setNotice("");
    try {
      await api("/api/admin/gifts", {
        method: "POST",
        body: JSON.stringify({ action: kind, email }),
      });
      setNotice(kind === "revoke-family" ? "Legacy unlimited access revoked for " + email : "Personal gift revoked for " + email);
      await load();
    } catch (e) { setError((e as Error).message); }
    finally { setBusy(false); }
  }

  if (connection === "ready" && !owner)
    return <section className="panel form-panel"><h2>Owner access required</h2><p>Only the verified StudyBot owner can create or revoke gifts.</p><Link href="/" className="button secondary">Back home</Link></section>;

  return <div className="owner-gifts">
    <PageHeader eyebrow="PRIVATE OWNER CONTROLS" title="Gifts & beta access"
      description="Grant time-limited access and a fixed AI budget to verified accounts. No shareable passwords or permanent unlimited gift codes." />
    <ErrorMessage message={error} />
    {notice && <p className="notice" role="status">{notice}</p>}
    {data && <div className="gift-metrics">
      <section className="panel"><Gift size={18} /><strong>{active.length}</strong><span>Active personal gifts</span></section>
      <section className="panel"><Users size={18} /><strong>{visible.length}</strong><span>Registered accounts shown</span></section>
      <section className="panel"><Wallet size={18} /><strong>{money(active.reduce((s,a)=>s+(a.gift?.remainingMicros??0),0))}</strong><span>Unspent gift AI allowance</span></section>
      <section className="panel"><ShieldCheck size={18} /><strong>{family.length}</strong><span>Legacy unlimited accounts</span></section>
    </div>}
    <div className="gift-layout">
      <section className="panel form-panel">
        <h2><Gift size={20}/> Create a personal gift</h2>
        <p className="helper">Have the recipient sign in to StudyBot once, then enter the same verified email here. Gifts attach directly to their account; a forwarded message cannot unlock anyone else.</p>
        <form onSubmit={submit}>
          <label>Recipient's verified email
            <input type="email" autoComplete="email" maxLength={200} placeholder="friend@example.com"
              value={recipient} onChange={e=>setRecipient(e.target.value)} required />
          </label>
          <div className="gift-fields">
            <label>Plan to gift
              <select value={tier} onChange={e=>setTier(e.target.value as "study"|"plus")}>
                <option value="study">StudyBot</option>
                <option value="plus">StudyBot Plus</option>
              </select>
            </label>
            <label>Trial length
              <select value={days} onChange={e=>setDays(Number(e.target.value))}>
                <option value={7}>7 days</option><option value={14}>14 days</option>
                <option value={30}>30 days</option><option value={60}>60 days</option>
              </select>
            </label>
          </div>
          <label>Maximum AI processing budget for this gift
            <select value={budgetCents} onChange={e=>setBudgetCents(Number(e.target.value))}>
              <option value={50}>$0.50</option><option value={100}>$1.00</option>
              <option value={200}>$2.00</option><option value={500}>$5.00</option>
              <option value={1000}>$10.00</option>
            </select>
          </label>
          <p className="helper">Premium access ends at the expiration date; AI requests stop when the gifted allowance runs out unless the account has other credits. These are wallet limits, not a guaranteed ceiling on provider overruns. Prior purchases and schoolwork are unaffected.</p>
          <button type="submit" className="button" disabled={busy||!recipient.trim()}>
            <Gift size={16}/>{busy?"Saving…":"Gift access"}
          </button>
        </form>
      </section>
      <section className="panel form-panel">
        <h2><Clock3 size={20}/> Important limits</h2>
        <p>Personal grants are capped at 90 days and $10 of AI processing per gift. They cannot create permanent unlimited accounts.</p>
        <p className="helper">Gifted budgets are separate from paid or banked credits. Unused gift funds are never converted to paid credits, and disappear from availability after expiration or revocation.</p>
        <p className="helper">Old shared-code redemptions are disabled by default in the updated build. Already-redeemed family accounts stay unlimited until you revoke each one below. If the legacy code has been explicitly re-enabled in Cloudflare settings, turn it off there too.</p>
        <Link href="/admin/ai-costs" className="button secondary">View AI spending</Link>
      </section>
    </div>
    <section className="panel form-panel">
      <div className="gift-heading"><div><h2>Account access control</h2><p className="helper">Revoke active personal gifts or legacy unlimited family access. Actions do not delete user data or Stripe subscriptions.</p></div><button type="button" className="button secondary small" onClick={()=>void load()} disabled={busy}><RotateCcw size={15}/> Refresh</button></div>
      {data?.limited&&<p className="notice">Showing 300 accounts. For others, you can still gift by verified email.</p>}
      <div className="gift-table"><table>
        <thead><tr><th>Account</th><th>Access</th><th>Expires</th><th>Gift budget left</th><th>Manage</th></tr></thead>
        <tbody>{visible.filter(a=>a.email?.toLowerCase()!==myEmail?.toLowerCase()).map(a=><tr key={a.id}>
          <td>{a.email ?? "Unknown email"}</td>
          <td>{a.family?"Permanent family (unlimited)":a.gift?.active ? "Gifted "+a.gift.tier : a.isPaidSubscriber?"Paid subscriber":a.plan==="free"?"Free":a.plan}</td>
          <td>{a.gift?.active ? new Date(a.gift.expiresAt).toLocaleDateString() : "—"}</td>
          <td>{a.gift?.active ? money(a.gift.remainingMicros) : "—"}</td>
          <td>
            {a.email && a.family ? <button type="button" className="button secondary small" disabled={busy} onClick={()=>void revoke(a.email!,"revoke-family")}>Revoke unlimited</button> :
            a.email && a.gift?.active ? <button type="button" className="button secondary small" disabled={busy} onClick={()=>void revoke(a.email!,"revoke-gift")}>Revoke gift</button> :
            <span className="muted">—</span>}
          </td>
        </tr>)}</tbody>
      </table></div>
      {!data && !error && <p>Loading account access…</p>}
      {data && visible.length===0 && <p className="helper">No recipient accounts yet. Have a tester sign in first.</p>}
    </section>
  </div>;
}
