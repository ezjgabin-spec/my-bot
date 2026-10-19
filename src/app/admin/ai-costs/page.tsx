"use client";
import {useEffect,useState} from "react";
import Link from "next/link";
import {api} from "@/lib/client";
import type {UsageMetrics} from "@/lib/ai-cost-report";
const money=(micros:number)=>"$"+(micros/1_000_000).toFixed(4);
export default function OwnerCosts(){
 const [data,setData]=useState<{metrics:UsageMetrics[];totalRequests:number;costMicros:number;chargedMicros:number;limited:boolean;rateNote:string}|null>(null);
 const [error,setError]=useState("");
 useEffect(()=>{void api<typeof data>("/api/admin/ai-costs").then(d=>setData(d)).catch(e=>setError(e.message));},[]);
 return <><Link href="/settings" className="back-link">← Settings</Link><div className="page-heading"><div><span className="eyebrow">OWNER ONLY</span><h1>Claude usage and costs</h1><p>Real usage receipts from the existing wallet ledger, grouped by feature.</p></div></div>
 {error&&<p className="notice error" role="alert">{error}</p>}
 {data&&<><div className="stats-grid"><section className="stat-card"><span>Estimated API expense</span><strong>{money(data.costMicros)}</strong></section><section className="stat-card"><span>Tracked wallet charges</span><strong>{money(data.chargedMicros)}</strong></section><section className="stat-card"><span>AI requests</span><strong>{data.totalRequests}</strong></section><section className="stat-card"><span>Feature categories</span><strong>{data.metrics.length}</strong></section></div><section className="panel form-panel"><h2>Cost by AI feature</h2>{data.limited&&<p className="notice">Showing only the latest 10,000 usage receipts.</p>}{!data.metrics.length&&<p>No measured AI requests yet. Try each Gen 2 feature with a small document first.</p>}<div className="table-wrap"><table><thead><tr><th>Feature</th><th>Calls</th><th>Completed</th><th>Pending</th><th>Failures</th><th>API cost</th><th>Avg. completed</th><th>Wallet debits</th></tr></thead><tbody>{data.metrics.map(row=><tr key={row.feature}><td>{row.feature}</td><td>{row.requests}</td><td>{row.completed}</td><td>{row.pending}</td><td>{row.failed}</td><td>{money(row.costMicros)}</td><td>{money(row.averageCostMicros)}</td><td>{money(row.chargedMicros)}</td></tr>)}</tbody></table></div><p className="helper">{data.rateNote}</p></section></>}
 </>;
}
