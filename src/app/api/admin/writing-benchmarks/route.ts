import {NextResponse} from "next/server";
import {apiError,AppError,requireUser} from "@/lib/server";
import {isBillingAdmin} from "@/lib/payments";
import {readLocalData} from "@/lib/local-store";
export async function GET(){
 try{await requireUser();if(!await isBillingAdmin())throw new AppError("Owner only.",403);
 const data=await readLocalData();
 return NextResponse.json({essays:data.writingDocuments.filter(e=>e.revisions.some(r=>r.action==="grade"&&r.feedback))});
 }catch(e){return apiError(e);}
}
