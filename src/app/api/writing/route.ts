import { NextResponse } from "next/server";
import { apiError, AppError, protectMutation, readJson, requireUser } from "@/lib/server";
import { readLocalData, updateLocalData } from "@/lib/local-store";
import { requireFeature } from "@/lib/feature-access";
import { writingInput, type WritingDocument } from "@/lib/writing-types";
import { runWriting } from "@/lib/writing-service";
import { withAiLock } from "@/lib/ai";
import { featureRequest } from "@/lib/feature-request";

export async function GET(){
  try {
    await requireUser();
    await requireFeature();
    const data=await readLocalData();
    return NextResponse.json({essays:data.writingDocuments.slice().sort((a,b)=>b.updatedAt.localeCompare(a.updatedAt))});
  }catch(e){return apiError(e);}
}
export async function POST(request:Request){
  try{
    protectMutation(request);
    const user=await requireUser();
    const input=writingInput.parse(await readJson(request,130000));
    await requireFeature(input.action==="grade"?"study":"plus");
    const prior=await readLocalData();
    const original=input.essayId?prior.writingDocuments.find(d=>d.id===input.essayId):null;
    if(input.essayId&&!original)throw new AppError("Essay not found.",404);
    if(input.essayId&&input.materialId)throw new AppError("Cannot replace the source of an existing essay.",400);
    const sourceMaterial=input.materialId?prior.materials.find(m=>m.id===input.materialId):null;
    if(input.materialId&&!sourceMaterial)throw new AppError("Your uploaded essay was not found.",404);
    const latestRevision=original?.revisions.slice().reverse().find(r=>r.action!=="grade");
    const sourceText=(input.action==="humanize"&&latestRevision?latestRevision.result:undefined)||original?.sourceText||input.text.trim()||sourceMaterial?.extracted_text||"";
    if(sourceText.length<80||sourceText.length>45_000)throw new AppError("Essay must contain 80 to 45,000 characters. For large files, split the document.",400);
    const assignment=original?.assignment??input.assignment;
    const rubric=original?.rubric??input.rubric;
    const teacherFeedback=original?.teacherFeedback??input.teacherFeedback;
    const normalized={...input,assignment,rubric,teacherFeedback};
    const fingerprint={...normalized,sourceText};
    const revision=await featureRequest(input.requestId,fingerprint,()=>withAiLock(user.id,()=>runWriting(normalized,sourceText)));
    const doc=await updateLocalData(data=>{
      let essay=data.writingDocuments.find(e=>e.id===(input.essayId||input.requestId));
      if(!essay){
        essay={id:input.requestId,title:input.title,sourceText,assignment,rubric,teacherFeedback,materialId:input.materialId??null,createdAt:new Date().toISOString(),updatedAt:new Date().toISOString(),revisions:[]};
        data.writingDocuments.push(essay);
      }
      if(!essay.revisions.some(r=>r.id===revision.id))essay.revisions.push(revision);
      essay.updatedAt=new Date().toISOString();
      return essay;
    });
    return NextResponse.json({essay:doc,revision},{status:201});
  }catch(e){return apiError(e);}
}
