import { z } from "zod";

export const targetGrades = ["A+","A","A-","B+","B","B-","C+","C","C-","D","F"] as const;
export const writingAction = z.enum(["grade","improve","model","humanize"]);
export const writingInput = z.object({
  requestId: z.string().uuid(),
  essayId: z.string().uuid().optional(),
  materialId: z.string().uuid().optional(),
  title: z.string().trim().min(1).max(160).default("Untitled essay"),
  text: z.string().max(45_000).default(""),
  assignment: z.string().max(8_000).default(""),
  rubric: z.string().max(12_000).default(""),
  teacherFeedback: z.string().max(8_000).default(""),
  action: writingAction,
  targetGrade: z.enum(targetGrades).default("A"),
  tone: z.enum(["natural","academic","conversational"]).default("natural"),
  autoHumanize: z.boolean().default(false),
}).strict().refine(v=>!v.autoHumanize || v.action==="improve" || v.action==="model",{message:"Auto Humanize is only available on rewrites."});
export type WritingInput = z.infer<typeof writingInput>;
export const gradeFeedbackSchema = z.object({
  lower: z.number().min(0).max(100),
  upper: z.number().min(0).max(100),
  likelyLetter: z.string().min(1).max(25),
  confidence: z.enum(["low","moderate"]),
  overview: z.string().min(1).max(3000),
  strengths: z.array(z.string().max(900)).min(1).max(8),
  priorities: z.array(z.string().max(900)).min(1).max(8),
  criteria: z.array(z.object({name:z.string().max(90),feedback:z.string().max(900)})).max(12),
  limitations: z.string().min(1).max(1600),
}).refine(v=>v.lower<=v.upper,{message:"Grade range must ascend."});
export type GradeFeedback = z.infer<typeof gradeFeedbackSchema>;
export type WritingRevision = {
  id:string;createdAt:string;action:z.infer<typeof writingAction>;
  targetGrade?:string;autoHumanize:boolean;tone:string;
  result:string; feedback?: GradeFeedback;
};
export type WritingDocument = {
  id:string;title:string;sourceText:string;assignment:string;rubric:string;
  teacherFeedback:string;materialId:string|null;createdAt:string;updatedAt:string;
  revisions:WritingRevision[];actualTeacherGrade?:number;actualTeacherNotes?:string;
};
