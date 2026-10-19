"use client";
import {useEffect,useRef,useState} from "react";
import Link from "next/link";
import {BookOpen,FilePenLine,Sparkles,ArrowRight,Upload,RotateCcw} from "lucide-react";
import {api} from "@/lib/client";
import {useWorkspace} from "@/components/workspace";
import type {WritingDocument,WritingInput,WritingRevision,GradeFeedback} from "@/lib/writing-types";
import {targetGrades} from "@/lib/writing-types";
import "./writing.css";

type Action=WritingInput["action"];
const modes:{id:Action;label:string;detail:string}[]=[
 {id:"grade",label:"Grade my essay",detail:"Predicted range, rubric feedback and concrete next steps · Study+"},
 {id:"improve",label:"Improve my essay",detail:"Keep my argument, evidence and voice · Plus"},
 {id:"model",label:"Model essay",detail:"Compare with a clearly labeled example at a chosen level · Plus"},
 {id:"humanize",label:"Humanize",detail:"Improve rhythm and readability without changing meaning · Plus"},
];
export default function WritingPage(){
 const {connection,entitlement,aiReady,refresh}=useWorkspace();
 const allowed=!!(entitlement?.family||(entitlement&&entitlement.plan!=="free"));
 const plus=!!(entitlement?.family||(entitlement&&["plus","ultra"].includes(entitlement.plan)));
 const [docs,setDocs]=useState<WritingDocument[]>([]);
 const [current,setCurrent]=useState("");
 const [title,setTitle]=useState("My essay");
 const [text,setText]=useState("");
 const [assignment,setAssignment]=useState("");
 const [rubric,setRubric]=useState("");
 const [teacherFeedback,setTeacherFeedback]=useState("");
 const [materialId,setMaterialId]=useState<string|undefined>();
 const [action,setAction]=useState<Action>("grade");
 const [tone,setTone]=useState<WritingInput["tone"]>("natural");
 const [targetGrade,setTargetGrade]=useState<WritingInput["targetGrade"]>("A");
 const [autoHumanize,setAutoHumanize]=useState(false);
 const [quote,setQuote]=useState<{estimatedCredits:number;estimatedDollars:number}|null>(null);
 const [result,setResult]=useState<WritingRevision|null>(null);
 const [grade,setGrade]=useState("");
 const [actualNotes,setActualNotes]=useState("");
 const [error,setError]=useState("");
 const [busy,setBusy]=useState(false);
 const [notice,setNotice]=useState("");
 const requestId=useRef<string|null>(null);
 const upload=useRef<HTMLInputElement|null>(null);
 async function load(){try{const r=await api<{essays:WritingDocument[]}>("/api/writing");setDocs(r.essays);}catch(e){setError((e as Error).message);}}
 useEffect(()=>{if(connection==="ready"&&allowed)void load();},[connection,allowed]);
 function resetQuote(){setQuote(null);requestId.current=null;setNotice("");}
 function chooseDoc(id:string){
  const d=docs.find(d=>d.id===id);
  setCurrent(id);setResult(d?.revisions.at(-1)??null);
  if(d){setTitle(d.title);setText(d.sourceText);setAssignment(d.assignment);setRubric(d.rubric);setTeacherFeedback(d.teacherFeedback);setMaterialId(undefined);setGrade(d.actualTeacherGrade?.toString()??"");setActualNotes(d.actualTeacherNotes??"");}
  else{setTitle("My essay");setText("");setAssignment("");setRubric("");setTeacherFeedback("");setMaterialId(undefined);setResult(null);setGrade("");setActualNotes("");}
  resetQuote();
 }
 const payload=():WritingInput=>({requestId:requestId.current??crypto.randomUUID(),...(current?{essayId:current}:{}),...(materialId?{materialId}:{}),title,text:current?"":text,assignment,rubric,teacherFeedback,action,tone,targetGrade,autoHumanize});
 async function preview(){
  if(busy)return;
  setBusy(true);setError("");setNotice("");
  try{
   const {estimate}=await api<{estimate:{estimatedCredits:number;estimatedDollars:number}}>("/api/writing/quote",{method:"POST",body:JSON.stringify(payload())});
   setQuote(estimate);
  }catch(e){setError((e as Error).message);}finally{setBusy(false);}
 }
 async function submit(){
  if(busy||!quote)return;
  setBusy(true);setError("");setNotice("");requestId.current??=crypto.randomUUID();
  try{
   const r=await api<{essay:WritingDocument;revision:WritingRevision}>("/api/writing",{method:"POST",body:JSON.stringify(payload())});
   setResult(r.revision);setCurrent(r.essay.id);setDocs(old=>[r.essay,...old.filter(d=>d.id!==r.essay.id)]);
   setNotice("Saved to your private Writing Lab history. Credits reflect actual Claude usage.");
   resetQuote();requestId.current=null;await refresh();
  }catch(e){setError((e as Error).message);}finally{setBusy(false);}
 }
 async function selectFile(file:File){
  if(!file)return;
  setBusy(true);setError("");
  try{
   const r=await api<{id:string}>("/api/materials",{method:"POST",headers:{"Content-Type":"application/octet-stream","X-Filename":encodeURIComponent(file.name)},body:file});
   setMaterialId(r.id);setText("");setTitle(file.name.replace(/\.[^.]+$/,""));setCurrent("");setResult(null);resetQuote();
   setNotice("Essay uploaded. The existing private document reader extracted its text.");
  }catch(e){setError((e as Error).message);}finally{setBusy(false);}
 }
 async function saveActual(){
  setBusy(true);setError("");
  try{
   await api("/api/writing/actual",{method:"POST",body:JSON.stringify({essayId:current,grade:Number(grade),teacherNotes:actualNotes})});
   await load();setNotice("Real teacher grade saved separately from the AI's earlier estimate.");
  }catch(e){setError((e as Error).message);}finally{setBusy(false);}
 }
 const graded=result?.feedback;
 return <div className="writing-lab">
  <header className="writing-header"><span className="eyebrow"><Sparkles size={14}/> WRITING LAB</span><h1>Strengthen your writing. Understand your grade.</h1><p>Get an independent grade estimate, compare revisions, and save real teacher feedback. Grade predictions are estimates, not guaranteed school results.</p></header>
  {!allowed?<section className="panel form-panel"><h2><BookOpen size={21}/> Writing Lab is a Study feature</h2><p>Essay grading starts with Study. Rewriting, model essays and Humanize require Plus. No AI request is made until you confirm.</p><Link href="/pricing" className="button">View plans <ArrowRight size={16}/></Link></section>:
  <div className="writing-layout">
   <section className="panel form-panel writing-main">
    <div className="writing-picker"><label>Saved essays<select value={current} onChange={e=>chooseDoc(e.target.value)}><option value="">New essay</option>{docs.map(d=><option key={d.id} value={d.id}>{d.title}</option>)}</select></label><button type="button" className="button secondary small" onClick={()=>chooseDoc("")}><RotateCcw size={14}/> New</button></div>
    <label>Essay title<input value={title} onChange={e=>{setTitle(e.target.value);resetQuote();}} maxLength={160}/></label>
    {!current&&<><label>Your original essay<textarea rows={11} maxLength={45000} value={text} onChange={e=>{setText(e.target.value);setMaterialId(undefined);resetQuote();}} placeholder="Paste your essay here, or upload a Word, PDF or text document."/></label>
    <input ref={upload} type="file" accept=".pdf,.docx,.txt" style={{display:"none"}} onChange={e=>{if(e.target.files?.[0])void selectFile(e.target.files[0]);e.currentTarget.value="";}}/>
    <button type="button" className="button secondary" onClick={()=>upload.current?.click()} disabled={busy}><Upload size={16}/> Upload essay (PDF, DOCX, TXT)</button>
    {materialId&&<p className="helper">Uploaded essay selected. Your source will be read privately from saved materials.</p>}</>}
    {current&&<details className="writing-original"><summary>View original essay (preserved)</summary><p>{docs.find(d=>d.id===current)?.sourceText}</p></details>}
    <label>Assignment instructions (optional)<textarea rows={2} value={assignment} disabled={!!current} maxLength={8000} onChange={e=>{setAssignment(e.target.value);resetQuote();}}/></label>
    <label>Rubric (optional)<textarea rows={3} value={rubric} disabled={!!current} maxLength={12000} onChange={e=>{setRubric(e.target.value);resetQuote();}}/></label>
    <label>Earlier teacher feedback (optional, not the grade we're testing)<textarea rows={2} value={teacherFeedback} disabled={!!current} maxLength={8000} onChange={e=>{setTeacherFeedback(e.target.value);resetQuote();}}/></label>
    <h2>Choose an action</h2>
    <div className="writing-modes">{modes.map(m=><button type="button" key={m.id} className={action===m.id?"writing-mode selected":"writing-mode"} aria-pressed={action===m.id} disabled={busy||(!plus&&m.id!=="grade")} onClick={()=>{setAction(m.id);setAutoHumanize(false);setResult(null);resetQuote();}}><strong>{m.label}</strong><small>{m.detail}</small></button>)}</div>
    {action==="model"&&<label>Illustrative target level<select value={targetGrade} onChange={e=>{setTargetGrade(e.target.value as WritingInput["targetGrade"]);resetQuote();}}>{targetGrades.map(g=><option key={g}>{g}</option>)}</select></label>}
    {action!=="grade"&&<label>Tone<select value={tone} onChange={e=>{setTone(e.target.value as WritingInput["tone"]);resetQuote();}}><option value="natural">Natural</option><option value="academic">Academic</option><option value="conversational">Conversational</option></select></label>}
    {(action==="model"||action==="improve")&&<label className="writing-toggle"><input type="checkbox" checked={autoHumanize} onChange={e=>{setAutoHumanize(e.target.checked);resetQuote();}}/> <span><strong>Auto Humanize</strong><small>After rewriting, run a second, separately charged tone pass before returning the essay.</small></span></label>}
    <p className="helper">Essay feedback and AI writing actions cost credits. A price estimate comes before submission. Your original essay is never replaced.</p>
    {error&&<p className="notice error" role="alert">{error}</p>}
    {notice&&<p className="notice" role="status">{notice}</p>}
    {!quote?<button type="button" className="button" disabled={busy||!aiReady} onClick={()=>void preview()}>{busy?"Preparing estimate…":"Review estimated credit cost"} <ArrowRight size={16}/></button>:
    <section className="writing-quote"><strong>Estimated AI usage: {quote.estimatedCredits.toFixed(2)} credits (about ${quote.estimatedDollars.toFixed(2)})</strong><p>Conservative planning estimate, not a guaranteed cap. Actual Claude tokens determine your charge; temporary wallet reservations may be higher. {autoHumanize?"Includes the second Humanize pass.":""}</p><div className="button-row"><button type="button" className="button secondary small" onClick={()=>setQuote(null)}>Edit</button><button type="button" className="button" disabled={busy} onClick={()=>void submit()}>{busy?"Working…":`Confirm ${action} · use credits`}</button></div></section>}
    {result&&<section className="writing-result"><h2>{result.action==="grade"?"Grade estimate":result.action==="model"?"Illustrative model essay":"Revised writing"}</h2>{graded?<><div className="writing-range"><strong>{graded.lower.toFixed(0)}–{graded.upper.toFixed(0)}%</strong><span>{graded.likelyLetter} · {graded.confidence} confidence</span></div><p>{graded.overview}</p><div className="writing-columns"><div><h3>Strengths</h3>{graded.strengths.map((v,i)=><p key={i}>{v}</p>)}</div><div><h3>Next improvements</h3>{graded.priorities.map((v,i)=><p key={i}>{v}</p>)}</div></div>{graded.criteria.map((c,i)=><p key={i}><strong>{c.name}:</strong> {c.feedback}</p>)}<p className="helper">{graded.limitations}</p></>:<><p className="writing-output">{result.result}</p><p className="helper">Model essays are educational examples, not guaranteed grades. Verify all source evidence before using a revision.</p></>}
    </section>}
    {current&&docs.find(d=>d.id===current)?.revisions.some(r=>r.action==="grade")&&<section className="writing-actual"><h2>Compare with teacher's actual grade</h2><p className="helper">The grade is entered only after the independent AI estimate has been saved.</p><label>Real teacher grade (%)<input type="number" min={0} max={100} step="0.1" value={grade} onChange={e=>setGrade(e.target.value)}/></label><label>Teacher comments (optional)<textarea rows={3} value={actualNotes} onChange={e=>setActualNotes(e.target.value)}/></label><button className="button secondary" disabled={busy||grade===""||Number(grade)<0||Number(grade)>100} onClick={()=>void saveActual()}>Save real grade</button></section>}
   </section>
   <aside className="panel form-panel writing-history"><h2>Revision history</h2><p className="helper">Original source, AI feedback and rewrites are saved per account.</p>{docs.find(d=>d.id===current)?.revisions.slice().reverse().map(r=><button key={r.id} className="writing-history-entry" onClick={()=>setResult(r)}><strong>{r.action}{r.targetGrade?` · ${r.targetGrade}`:""}</strong><small>{new Date(r.createdAt).toLocaleString()}</small></button>)}{!current&&<p className="helper">Choose a saved essay or generate your first grade estimate.</p>}</aside>
  </div>}
 </div>;
}
