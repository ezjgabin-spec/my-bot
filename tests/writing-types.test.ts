import {describe,it,expect} from "vitest";
import {writingInput,gradeFeedbackSchema} from "../src/lib/writing-types";
const base={requestId:crypto.randomUUID(),title:"Essay",text:"This is a practice essay with enough meaningful writing to get an accurate response from the system.",action:"grade"};
describe("Writing Lab validation",()=>{
 it("permits grade estimates without rubrics and rejects invalid combinations",()=>{
  expect(writingInput.safeParse(base).success).toBe(true);
  expect(writingInput.safeParse({...base,autoHumanize:true}).success).toBe(false);
  expect(writingInput.safeParse({...base,action:"model",targetGrade:"B+",autoHumanize:true}).success).toBe(true);
 });
 it("validates honest grade estimate ranges",()=>{
  const valid={lower:78,upper:85,likelyLetter:"B",confidence:"low",overview:"Rough estimate",strengths:["Clear thesis"],priorities:["More evidence"],criteria:[],limitations:"No rubric supplied"};
  expect(gradeFeedbackSchema.safeParse(valid).success).toBe(true);
  expect(gradeFeedbackSchema.safeParse({...valid,lower:96,upper:85}).success).toBe(false);
 });
});
