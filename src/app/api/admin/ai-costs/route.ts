import {NextResponse} from "next/server";
import {apiError,AppError,requireUser} from "@/lib/server";
import {isBillingAdmin} from "@/lib/payments";
import {isCloud,cloudBindings} from "@/lib/cloud";
import {readLocalData} from "@/lib/local-store";
import {summarizeUsage} from "@/lib/ai-cost-report";
import type {UsageReceipt} from "@/lib/plans";
export async function GET(){
 try{
  await requireUser();if(!await isBillingAdmin())throw new AppError("Owner access required.",403);
  let receipts:UsageReceipt[]=[];
  let limited=false;
  if(isCloud()){
   const {DB}=await cloudBindings();
   const rows=await DB.prepare("SELECT value FROM study_items WHERE collection = 'billingUsage' ORDER BY rowid DESC LIMIT 10001").all<{value:string}>();
   limited=rows.results.length>10000;
   receipts=rows.results.slice(0,10000).map(r=>JSON.parse(r.value) as UsageReceipt);
  }else receipts=(await readLocalData()).billingUsage;
  const metrics=summarizeUsage(receipts);
  const recent=receipts.slice().sort((a,b)=>b.at.localeCompare(a.at)).slice(0,100).map(r=>({id:r.id,at:r.at,feature:r.operation,plan:r.planAtRequest??"unknown",status:r.status,model:r.model,pricingVersion:r.pricingVersion,inputTokens:r.inputTokens,outputTokens:r.outputTokens,costMicros:r.costMicros,chargedMicros:r.chargedMicros}));
  const sum=(key:"costMicros"|"chargedMicros")=>metrics.reduce((total,row)=>total+row[key],0);
  return NextResponse.json({metrics,recent,totalRequests:receipts.length,costMicros:sum("costMicros"),chargedMicros:sum("chargedMicros"),limited,rateNote:"Estimated provider token cost; wallet debits are not subscription revenue. Gross profit requires validated revenue, payment fees and infrastructure costs."});
 }catch(e){return apiError(e);}
}
