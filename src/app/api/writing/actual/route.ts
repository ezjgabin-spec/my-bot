import { NextResponse } from "next/server";
import { z } from "zod";
import { apiError, requireUser, protectMutation, readJson, AppError } from "@/lib/server";
import { readLocalData, updateLocalData } from "@/lib/local-store";
const schema=z.object({essayId:z.string().uuid(),grade:z.number().min(0).max(100),teacherNotes:z.string().max(8000).default("")});
export async function POST(request:Request){
 try{
  protectMutation(request);await requireUser();
  const input=schema.parse(await readJson(request));
  await updateLocalData(data=>{const doc=data.writingDocuments.find(d=>d.id===input.essayId);if(!doc)throw new AppError("Essay not found.",404);if(!doc.revisions.some(r=>r.action==="grade"&&r.feedback))throw new AppError("Run an independent grade estimate before entering the teacher grade.",409);doc.actualTeacherGrade=input.grade;doc.actualTeacherNotes=input.teacherNotes;doc.updatedAt=new Date().toISOString();});
  return NextResponse.json({saved:true});
 }catch(e){return apiError(e);}
}
