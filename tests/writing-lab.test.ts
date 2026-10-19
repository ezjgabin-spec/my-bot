import {beforeEach,afterEach,describe,it,expect,vi} from "vitest";
import {mkdtemp,rm} from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {POST,GET} from "../src/app/api/writing/route";
import {POST as recordActual} from "../src/app/api/writing/actual/route";
import {readLocalData} from "../src/lib/local-store";
import {runWriting} from "../src/lib/writing-service";

vi.mock("@/lib/writing-service",()=>({
 runWriting:vi.fn(async(input:{requestId:string;action:string;autoHumanize:boolean;tone:string})=>({
   id:input.requestId,createdAt:new Date().toISOString(),action:input.action,
   autoHumanize:input.autoHumanize,tone:input.tone,result:"Educational feedback on the submitted essay.",
   feedback:{lower:80,upper:88,likelyLetter:"B",confidence:"low",overview:"A careful approximate grade.",strengths:["Clear direction"],priorities:["More analysis"],criteria:[],limitations:"Teacher grading varies."}
 })),
 writingEstimate:vi.fn(()=>({estimatedCredits:1,estimatedDollars:0.025,pricingVersion:"test"})),
}));
const URL="http://localhost:3000/api/writing";
const request=(url:string,value:unknown)=>new Request(url,{method:"POST",headers:{origin:"http://localhost:3000","content-type":"application/json"},body:JSON.stringify(value)});
let dir:string;
beforeEach(async()=>{dir=await mkdtemp(path.join(os.tmpdir(),"writing-lab-"));vi.stubEnv("STUDYPREDICT_DATA_DIR",dir);vi.mocked(runWriting).mockClear();});
afterEach(async()=>{vi.unstubAllEnvs();await rm(dir,{recursive:true,force:true});});
const essay="An important literary idea is that writers choose language to reveal character and change. ".repeat(4);

describe("Writing Lab persistence and benchmarks",()=>{
 it("saves an independent estimate, replays an identical request once, and then accepts a teacher grade",async()=>{
  const requestId=crypto.randomUUID();
  const input={requestId,title:"Test essay",text:essay,action:"grade",assignment:"Analyze the text.",rubric:"Argument and evidence",teacherFeedback:""};
  const first=await POST(request(URL,input));
  expect(first.status).toBe(201);
  const result=await first.json();
  expect(result.revision.feedback.lower).toBe(80);
  expect(result.essay.actualTeacherGrade).toBeUndefined();
  const again=await POST(request(URL,input));
  expect(again.status).toBe(201);
  expect(vi.mocked(runWriting)).toHaveBeenCalledTimes(1);
  expect((await readLocalData()).writingDocuments[0].revisions).toHaveLength(1);
  const actual=await recordActual(request(URL+"/actual",{essayId:requestId,grade:83,teacherNotes:"Improve evidence."}));
  expect(actual.status).toBe(200);
  const saved=(await readLocalData()).writingDocuments[0];
  expect(saved.actualTeacherGrade).toBe(83);
  expect(saved.revisions[0].feedback?.lower).toBe(80);
  expect((await GET()).status).toBe(200);
 });
 it("does not accept teacher grades before the first independent essay estimate",async()=>{
  const r=await recordActual(request(URL+"/actual",{essayId:crypto.randomUUID(),grade:70}));
  expect(r.status).toBe(404);
 });
});
