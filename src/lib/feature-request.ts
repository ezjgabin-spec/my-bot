import "server-only";
import { createHash } from "node:crypto";
import { updateLocalData } from "./local-store";
import { AppError } from "./server";
// Claim before contacting a provider. Retain failed/running tombstones across retries.
export async function featureRequest<T>(id:string,input:unknown,run:()=>Promise<T>):Promise<T>{
 const fingerprint=createHash("sha256").update(JSON.stringify(input)).digest("hex");
 const claim=await updateLocalData(data=>{
  const old=data.featureRequests.find(r=>r.id===id);
  if(old){if(old.fingerprint!==fingerprint)throw new AppError("Request ID belongs to different settings.",409);if(old.status==="ready")return {cached:true,result:old.result as T};throw new AppError("This request is running or failed. Retry later to retrieve a completed result, or explicitly start a new paid request.",409);}
  data.featureRequests.push({id,fingerprint,status:"running",createdAt:new Date().toISOString()});return {cached:false,result:undefined};
 });
 if(claim.cached)return claim.result as T;
 try {const result=await run();await updateLocalData(data=>{const item=data.featureRequests.find(r=>r.id===id)!;item.status="ready";item.result=result;});return result;}
 catch(e){await updateLocalData(data=>{data.featureRequests.find(r=>r.id===id)!.status="failed";});throw e;}
}
