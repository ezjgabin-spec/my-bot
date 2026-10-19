import {it,expect,vi,afterEach} from "vitest";
import {accountFor} from "../src/lib/billing";
import {emptyData} from "../src/lib/local-store";
import {gen2FreeBudgetMicros,nextUtcMonth} from "../src/lib/gen2-rollout";
afterEach(()=>vi.unstubAllEnvs());
it("keeps the existing billing path by default",()=>{
 vi.stubEnv("GEN2_FREE_TRIAL_ENABLED","0");
 const a=accountFor(emptyData(),{id:"test-user"},false,new Date("2026-10-19T15:00:00Z"));
 expect(a.freeTests).toBe(1);
});
it("Gen 2 Free gets 3 signup uses then 2 per UTC month without rollover",()=>{
 vi.stubEnv("GEN2_FREE_TRIAL_ENABLED","1");vi.stubEnv("GEN2_FREE_MONTHLY_BUDGET_MICROS","1500000");
 const data=emptyData();const a=accountFor(data,{id:"test-user"},false,new Date("2026-10-19T15:00:00Z"));
 expect(a.freeTests).toBe(3);expect(a.nextFreeAt).toBe("2026-11-01T00:00:00.000Z");
 a.freeTests=1;accountFor(data,{id:"test-user"},false,new Date("2026-11-01T02:00:00Z"));
 expect(a.freeTests).toBe(2);expect(a.nextFreeAt).toBe("2026-12-01T00:00:00.000Z");
 a.freeTests=0;accountFor(data,{id:"test-user"},false,new Date("2027-02-04T02:00:00Z"));
 expect(a.freeTests).toBe(2);
});
it("refuses activating a cost-bearing free plan without an explicit budget",()=>{
 vi.stubEnv("GEN2_FREE_TRIAL_ENABLED","1");vi.stubEnv("GEN2_FREE_MONTHLY_BUDGET_MICROS","");
 expect(()=>gen2FreeBudgetMicros()).toThrow("Configure");
 expect(nextUtcMonth(new Date("2026-12-15T18:00:00Z"))).toContain("2027-01-01");
});
