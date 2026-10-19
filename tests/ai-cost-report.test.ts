import {describe,it,expect} from "vitest";
import {summarizeUsage} from "../src/lib/ai-cost-report";
import type {UsageReceipt} from "../src/lib/plans";
const receipt=(operation:UsageReceipt["operation"],cost:number,status:UsageReceipt["status"]="completed")=>({operation,costMicros:cost,chargedMicros:cost-10,status,inputTokens:100,outputTokens:50}) as UsageReceipt;
describe("cost dashboard",()=>{it("aggregates real provider costs separately from wallet charges",()=>{
 const groups=summarizeUsage([receipt("writing",100),receipt("writing",300),receipt("test",20),receipt("writing",0,"uncertain")]);
 const essays=groups.find(g=>g.feature==="writing")!;
 expect(essays.requests).toBe(3);expect(essays.completed).toBe(2);expect(essays.pending).toBe(1);
 expect(essays.averageCostMicros).toBe(200);expect(essays.costMicros).toBe(400);expect(essays.chargedMicros).toBe(370);
});});
