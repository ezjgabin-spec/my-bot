"use client";
import {useEffect,useState} from "react";
import Link from "next/link";
import {api} from "@/lib/client";
import type {WritingDocument} from "@/lib/writing-types";
export default function EssayBenchmarks(){
 const [items,setItems]=useState<WritingDocument[]>([]);const[error,setError]=useState("");
 useEffect(()=>{void api<{essays:WritingDocument[]}>("/api/admin/writing-benchmarks").then(v=>setItems(v.essays)).catch(e=>setError(e.message));},[]);
 const pairs=items.flatMap(d=>d.actualTeacherGrade===undefined?[]:d.revisions.filter(r=>r.action==="grade"&&r.feedback).slice(0,1).map(r=>({title:d.title,actual:d.actualTeacherGrade!,predicted:(r.feedback!.lower+r.feedback!.upper)/2,lower:r.feedback!.lower,upper:r.feedback!.upper})));
 const mae=pairs.length?pairs.reduce((s,p)=>s+Math.abs(p.predicted-p.actual),0)/pairs.length:0;
 return <><Link href="/writing" className="back-link">← Writing Lab</Link><div className="page-heading"><div><span className="eyebrow">OWNER ONLY</span><h1>Teacher-grade essay benchmarks</h1><p>Grade each essay blindly in Writing Lab before recording the teacher grade. Actual grades must not be sent to Claude beforehand.</p></div></div>
 {error&&<p className="notice error">{error}</p>}
 <section className="panel form-panel"><h2>{pairs.length} independently graded essays</h2><p>Mean absolute error: {pairs.length?mae.toFixed(1)+" percentage points":"Not enough results"}</p>{!pairs.length&&<p className="helper">Open Writing Lab, grade one of your previously marked essays without entering its actual grade, then record the teacher's result afterward.</p>}<div className="table-wrap"><table><thead><tr><th>Essay</th><th>AI range</th><th>Midpoint</th><th>Teacher</th><th>Absolute error</th><th>Within AI range?</th></tr></thead><tbody>{pairs.map((p,i)=><tr key={i}><td>{p.title}</td><td>{p.lower}–{p.upper}%</td><td>{p.predicted.toFixed(1)}%</td><td>{p.actual}%</td><td>{Math.abs(p.predicted-p.actual).toFixed(1)} pp</td><td>{p.actual>=p.lower&&p.actual<=p.upper?"Yes":"No"}</td></tr>)}</tbody></table></div><p className="helper">Small samples are not validation. Grade ranges differ between teachers and assignments; collect diverse rubrics and report predictions made before knowing the actual grade.</p></section></>;
}
