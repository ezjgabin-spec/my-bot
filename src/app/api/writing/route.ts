import {NextResponse} from "next/server";
import {z} from "zod";
import {apiError,requireUser,protectMutation,readJson,AppError} from "@/lib/server";
import {readLocalData,updateLocalData} from "@/lib/local-store";
import {requireFeature} from "@/lib/feature-access";
import {isBillingAdmin} from "@/lib/payments";
import {writingSchema} from "@/lib/writing";
import {writingEstimate,runWriting} from "@/lib/writing-service";
import {withAiLock} from "@/lib/ai";
export const maxDuration=300;
export async function GET(){try{await requireUser();const owner=await isBillingAdmin();const rows=(await readLocalData()).writingEntries.filter(e=>!e.input.benchmark||owner);return NextResponse.json({entries:rows.slice(-100).reverse(),limited:rows.length>100});}catch(e){return apiError(e);}}
export async function POST(request:Request){try{
 protectMutation(request);const user=await requireUser();const input=writingSchema.parse(await readJson(request,400000));
 if(input.benchmark){if(!await isBillingAdmin())throw new AppError("Owner access is required for benchmarking.",403);}else await requireFeature(input.action==="grade"?"study":"plus");
 if(new URL(request.url).searchParams.get("estimate")==="1")return NextResponse.json(writingEstimate(input));
 if(request.headers.get("x-confirm-ai")!=="1")throw new AppError("Review the combined credit estimate before submitting.");
 return NextResponse.json(await withAiLock(user.id,()=>runWriting(input)));
}catch(e){return apiError(e);}}
export async function PATCH(request:Request){try{
 protectMutation(request);await requireUser();const input=z.object({id:z.string().uuid(),grade:z.number().min(0).max(100),comments:z.string().max(4000)}).parse(await readJson(request));const owner=await isBillingAdmin();
 await updateLocalData(d=>{const row=d.writingEntries.find(r=>r.id===input.id);if(!row||row.input.benchmark&&!owner)throw new AppError("Essay not found.",404);if(!row.grade)throw new AppError("An independent analysis must be saved before entering the teacher grade.",409);row.actualGrade=input.grade;row.actualRecordedAt??=new Date().toISOString();row.teacherComments=input.comments;});return NextResponse.json({saved:true});
}catch(e){return apiError(e);}}
export async function DELETE(request:Request){try{protectMutation(request);await requireUser();const {id}=z.object({id:z.string().uuid()}).parse(await readJson(request));const data=await readLocalData();const row=data.writingEntries.find(r=>r.id===id);if(!row||row.input.benchmark&&!await isBillingAdmin())throw new AppError("Essay not found.",404);if(row.status==="running")throw new AppError("This essay is still processing.",409);await updateLocalData(d=>{d.writingEntries=d.writingEntries.filter(r=>r.id!==id);const request=d.featureRequests.find(r=>r.id===id);if(request)request.result={id,deleted:true};});return NextResponse.json({deleted:true});}catch(e){return apiError(e);}}
