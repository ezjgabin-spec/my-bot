import { NextResponse } from "next/server";
import { apiError, requireUser, AppError } from "@/lib/server";
import { isBillingAdmin } from "@/lib/payments";
import { readLocalData } from "@/lib/local-store";
import { isCloud,cloudBindings } from "@/lib/cloud";
import { evaluateResearch,type ResearchSnapshot,type RealityCheck } from "@/lib/prediction-research";
export async function GET(request:Request){try{
 await requireUser();const owner=new URL(request.url).searchParams.get("owner")==="1";
 if(!owner){const data=await readLocalData();return NextResponse.json({snapshots:data.researchSnapshots,reality:data.realityChecks});}
 if(!await isBillingAdmin())throw new AppError("Owner access is required.",403);
 if(!isCloud()){const data=await readLocalData();return NextResponse.json({metrics:evaluateResearch(data.researchSnapshots,data.realityChecks),limited:false});}
 const {DB}=await cloudBindings();const rows=await DB.prepare("SELECT user_id,collection,value FROM study_items WHERE collection IN ('researchSnapshots','realityChecks') ORDER BY rowid DESC LIMIT 10001").all();
 // Namespace assessment IDs by account before aggregating. Never return notes or raw grades to the dashboard.
 const snapshots:ResearchSnapshot[]=[],reality:RealityCheck[]=[];
 for(const row of rows.results.slice(0,10000)){const item=JSON.parse(String(row.value));item.examId=String(row.user_id)+":"+item.examId;if(row.collection==="researchSnapshots")snapshots.push(item);else reality.push(item);}
 return NextResponse.json({metrics:evaluateResearch(snapshots,reality),limited:rows.results.length>10000});
}catch(e){return apiError(e);}}
