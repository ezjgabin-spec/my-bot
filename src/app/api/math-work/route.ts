import { NextResponse } from "next/server";
import { z } from "zod";
import { apiError, requireUser, protectMutation, readJson, AppError } from "@/lib/server";
import { requireFeature } from "@/lib/feature-access";
import { mathWorkSchema } from "@/lib/math-work";
import { readLocalData, updateLocalData, type LocalData } from "@/lib/local-store";
import { recognizeMath, withAiLock } from "@/lib/ai";
import { featureRequest } from "@/lib/feature-request";
function check(data:LocalData,attemptId:string,questionId:string,mutate=false){
 const attempt=data.attempts.find(a=>a.id===attemptId);
 if(!attempt || !data.questions.some(q=>q.test_id===attempt.test_id && q.id===questionId && q.kind!=="multiple_choice"))throw new AppError("Written question not found.",404);
 if(mutate && (attempt.status!=="in_progress" || (attempt.deadline_at && Date.parse(attempt.deadline_at)<=Date.now())))throw new AppError("This attempt can no longer be edited.",409);
}
export async function GET(request:Request){try{await requireUser();const params=z.object({attemptId:z.string().uuid(),questionId:z.string().uuid()}).parse(Object.fromEntries(new URL(request.url).searchParams));const data=await readLocalData();check(data,params.attemptId,params.questionId);return NextResponse.json({work:data.mathWork.find(w=>w.attemptId===params.attemptId&&w.questionId===params.questionId)??null});}catch(e){return apiError(e);}}
export async function PUT(request:Request){try{protectMutation(request);await requireUser();await requireFeature();const input=mathWorkSchema.parse(await readJson(request,1500000));await updateLocalData(data=>{check(data,input.attemptId,input.questionId,true);const id=`${input.attemptId}:${input.questionId}`;data.mathWork=data.mathWork.filter(w=>w.id!==id);data.mathWork.push({...input,id,updatedAt:new Date().toISOString()});});return NextResponse.json({saved:true});}catch(e){return apiError(e);}}
export async function POST(request:Request){try{
 protectMutation(request);const user=await requireUser();await requireFeature();const input=z.object({requestId:z.string().uuid(),attemptId:z.string().uuid(),questionId:z.string().uuid(),image:z.string().min(20).max(1500000).regex(/^[A-Za-z0-9+/]+={0,2}$/)}).parse(await readJson(request,1600000));
 check(await readLocalData(),input.attemptId,input.questionId,true);
 const bytes=Buffer.from(input.image,"base64");if(bytes.subarray(0,8).toString("hex")!=="89504e470d0a1a0a")throw new AppError("Send a PNG image.");
 const result=await featureRequest(input.requestId,{feature:"handwriting",...input},()=>withAiLock(user.id,()=>recognizeMath(input.image)));
 return NextResponse.json(result);
}catch(e){return apiError(e);}}
