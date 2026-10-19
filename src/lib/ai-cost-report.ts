import type {UsageReceipt} from "./plans";
export type UsageMetrics={feature:string;requests:number;completed:number;failed:number;pending:number;costMicros:number;chargedMicros:number;inputTokens:number;outputTokens:number;averageCostMicros:number};
export function summarizeUsage(receipts:UsageReceipt[]){
 const map=new Map<string,UsageMetrics>();
 for(const r of receipts){
  const m=map.get(r.operation)??{feature:r.operation,requests:0,completed:0,failed:0,pending:0,costMicros:0,chargedMicros:0,inputTokens:0,outputTokens:0,averageCostMicros:0};
  m.requests++;
  if(r.status==="completed")m.completed++;
  if(r.status==="failed")m.failed++;
  if(r.status==="reserved"||r.status==="uncertain")m.pending++;
  m.costMicros+=r.costMicros??0;
  m.chargedMicros+=r.chargedMicros;
  m.inputTokens+=r.inputTokens??0;
  m.outputTokens+=r.outputTokens??0;
  map.set(r.operation,m);
 }
 return [...map.values()].map(m=>({...m,averageCostMicros:m.completed?Math.round(m.costMicros/m.completed):0})).sort((a,b)=>b.costMicros-a.costMicros);
}
