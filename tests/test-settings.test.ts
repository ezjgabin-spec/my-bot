import { it, expect } from "vitest";
import { generateSchema } from "../src/lib/schemas";
import { defaultAdvanced, effectiveDifficulty } from "../src/lib/test-settings";
import type { Attempt } from "../src/lib/types";
const base={examId:crypto.randomUUID(),materialId:crypto.randomUUID(),difficulty:"Medium",format:"mixed",count:20,timeLimit:null};
it("validates exact distributions and supports small basic tests",()=>{
 expect(generateSchema.safeParse({...base,advanced:defaultAdvanced}).success).toBe(true);
 expect(generateSchema.safeParse({...base,count:19,advanced:defaultAdvanced}).success).toBe(false);
 expect(generateSchema.safeParse({...base,count:1,format:"math"}).success).toBe(true);
 expect(generateSchema.safeParse({...base,count:41}).success).toBe(false);
});
it("only advances explicit adaptive mode after two completed strong results",()=>{
 const attempts=[90,95].map((score,i)=>({status:"completed",score,completed_at:`2026-10-${12+i}`} as Attempt));
 expect(effectiveDifficulty("Medium","adaptive",attempts)).toBe("Hard");
 expect(effectiveDifficulty("Medium","exam",attempts)).toBe("Medium");
 expect(effectiveDifficulty("Teacher-Level","adaptive",attempts)).toBe("Teacher-Level");
 expect(effectiveDifficulty("Easy","adaptive",attempts.slice(0,1))).toBe("Easy");
});
