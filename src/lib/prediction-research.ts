import type { LocalData } from "./local-store";
import type { Format, PracticeTest } from "./types";
export const RESEARCH_VERSION="prospective-v1";
export type RealityCheck={id:string;examId:string;grade:number;format:Format;difficulty:"easier"|"similar"|"harder"|"unknown";workingRequired:boolean;topics:string;teacherNotes:string;recordedAt:string};
export type ResearchSnapshot={id:string;examId:string;subject:string;format:Format;createdAt:string;version:string;productionVersion:string;practice:{attemptId:string;score:number;difficulty:string;completedAt:string}[];candidates:Record<string,number>;spread:number;stability:Record<string,number|null>};
const mean=(v:number[])=>v.reduce((a,b)=>a+b,0)/v.length;
const clamp=(v:number,min=0,max=100)=>Math.max(min,Math.min(max,v));
const median=(v:number[])=>{const s=[...v].sort((a,b)=>a-b);return (s[Math.floor((s.length-1)/2)]+s[Math.floor(s.length/2)])/2;};
export function trimmedBaseline(scores:number[]){const sorted=[...scores].sort((a,b)=>a-b);return mean(sorted.slice(Math.floor(sorted.length/3)));}
export function candidates(scores:number[],production:number,historicalDifferences:number[]){
 const sorted=[...scores].sort((a,b)=>a-b),n=sorted.length;
 if(!n)throw new Error("Practice results required");
 const low=sorted[Math.floor(n*.2)],high=sorted[Math.ceil(n*.8)-1];
 const weights=scores.map((_,i)=>i+1);
 const raw={production,mean:mean(scores),median:median(scores),trimmed:trimmedBaseline(scores),winsorized:mean(scores.map(v=>clamp(v,low,high))),recency:scores.reduce((s,v,i)=>s+v*weights[i],0)/mean(weights)/n,shrinkage:(n*mean(scores)+2*75)/(n+2),personalized:trimmedBaseline(scores)+clamp(historicalDifferences.length?mean(historicalDifferences)/3:0,-5,5),recentMedian:median(scores.slice(-3))};
 return Object.fromEntries(Object.entries(raw).map(([k,v])=>[k,Math.round(clamp(v)*100)/100]));
}
export function assessmentFormat(test:PracticeTest):Format {return test.advanced ? test.advanced.written===0?"multiple_choice":test.advanced.multipleChoice===0?test.advanced.writtenKind:"mixed" : test.format;}
export function snapshotResearch(data:LocalData,examId:string,format:Format,now=new Date().toISOString()){
 if(data.grades.some(g=>g.exam_id===examId)||data.realityChecks.some(g=>g.examId===examId))return;
 const exam=data.exams.find(e=>e.id===examId);if(!exam)return;
 const subject=data.subjects.find(s=>s.id===exam.subject_id)?.name??"Unknown";
 const tests=data.tests.filter(t=>t.exam_id===examId&&assessmentFormat(t)===format);
 const practice=data.attempts.filter(a=>a.exam_id===examId&&a.status==="completed"&&a.score!==null&&a.completed_at&&a.completed_at<=now&&tests.some(t=>t.id===a.test_id)).sort((a,b)=>a.completed_at!.localeCompare(b.completed_at!)).map(a=>({attemptId:a.id,score:a.score!,difficulty:tests.find(t=>t.id===a.test_id)!.difficulty,completedAt:a.completed_at!}));
 if(!practice.length)return;
 const production=data.predictions.filter(p=>p.exam_id===examId&&p.created_at<=now).sort((a,b)=>b.created_at.localeCompare(a.created_at))[0];if(!production)return;
 const history=data.realityChecks.filter(r=>r.examId!==examId&&r.format===format&&r.recordedAt<now).flatMap(r=>{
  const prior=data.researchSnapshots.filter(s=>s.examId===r.examId&&s.subject===subject&&s.format===format&&s.createdAt<r.recordedAt&&s.version===RESEARCH_VERSION).sort((a,b)=>b.createdAt.localeCompare(a.createdAt))[0];return prior?[r.grade-prior.candidates.trimmed]:[];
 });
 const values=candidates(practice.map(p=>p.score),production.predicted,history);
 const previous=data.researchSnapshots.filter(s=>s.examId===examId&&s.format===format).at(-1);
 const snapshot:ResearchSnapshot={id:crypto.randomUUID(),examId,subject,format,createdAt:now,version:RESEARCH_VERSION,productionVersion:production.model_version,practice,candidates:values,spread:Math.sqrt(mean(practice.map(p=>(p.score-mean(practice.map(v=>v.score)))**2))),stability:Object.fromEntries(Object.entries(values).map(([k,v])=>[k,previous?Math.abs(v-previous.candidates[k]):null]))};
 data.researchSnapshots.push(snapshot);return snapshot;
}
export function evaluateResearch(snapshots:ResearchSnapshot[],reality:RealityCheck[]){
 const pairs=reality.flatMap(r=>{const s=snapshots.filter(s=>s.examId===r.examId&&s.format===r.format&&s.createdAt<r.recordedAt).sort((a,b)=>b.createdAt.localeCompare(a.createdAt))[0];return s?[{snapshot:s,actual:r.grade}]:[];});
 const groups=new Map<string,{name:string;version:string;subject:string;format:string;errors:number[];stability:number[]}>();
 for(const {snapshot:s,actual} of pairs)for(const [name,predicted]of Object.entries(s.candidates))for(const segment of [{subject:"All subjects",format:"all"},{subject:s.subject,format:s.format}]){
  const version=name==="production"?s.productionVersion:s.version;const key=JSON.stringify([name,version,segment.subject,segment.format]);const group=groups.get(key)??{name,version,...segment,errors:[],stability:[]};group.errors.push(predicted-actual);if(s.stability[name]!==null&&s.stability[name]!==undefined)group.stability.push(s.stability[name]!);groups.set(key,group);
 }
 return [...groups.values()].map(g=>{const abs=g.errors.map(Math.abs),mae=mean(abs),n=abs.length;return {name:g.name,version:g.version,subject:g.subject,format:g.format,count:n,mae,medianError:median(abs),bias:mean(g.errors),maeStandardError:n>1?Math.sqrt(abs.reduce((s,e)=>s+(e-mae)**2,0)/(n-1)/n):null,stability:g.stability.length?mean(g.stability):null,evidence:n<30?"Insufficient evidence to select a winner":"Review calibration and held-out evidence before switching"};});
}
