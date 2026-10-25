import { NextResponse } from "next/server";
import { apiError, readJson, protectMutation, requireUser, AppError } from "@/lib/server";
import { requireFeature } from "@/lib/feature-access";
import { writingInput } from "@/lib/writing-types";
import { writingEstimate } from "@/lib/writing-service";
import { readLocalData } from "@/lib/local-store";
export async function POST(request:Request){
 try{
  protectMutation(request);await requireUser();
  const input=writingInput.parse(await readJson(request,130000));
  await requireFeature(input.action==="grade"?"study":"plus");
  const data=await readLocalData();
  const doc=input.essayId?data.writingDocuments.find(e=>e.id===input.essayId):null;
  if(input.essayId&&!doc)throw new AppError("Essay not found.",404);
  const material=input.materialId?data.materials.find(m=>m.id===input.materialId):null;
  if(input.materialId&&!material)throw new AppError("Material not found.",404);
  const latestRevision=doc?.revisions.slice().reverse().find(r=>r.action!=="grade");
  if (doc?.actualTeacherRecordedAt && input.action === "grade") throw new AppError("Start a new essay to forecast another assignment; this one already has a real result.",409);
  const length=input.text.trim().length||(input.action==="humanize"&&latestRevision?latestRevision.result.length:0)||doc?.sourceText.length||material?.extracted_text.length||0;
  if(length<80||length>45000)throw new AppError("Essay must contain 80 to 45,000 characters.",400);
  return NextResponse.json({estimate:writingEstimate({...input,assignment:doc?.assignment??input.assignment,rubric:doc?.rubric??input.rubric,teacherFeedback:doc?.teacherFeedback??input.teacherFeedback},length),disclaimer:"Estimate only. Actual billed credits depend on Claude token usage. Auto Humanize adds a separate metered request."});
 }catch(e){return apiError(e);}
}
