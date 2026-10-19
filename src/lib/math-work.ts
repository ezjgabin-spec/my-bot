import { z } from "zod";
export const strokeSchema=z.object({erase:z.boolean(),width:z.number().min(1).max(30),points:z.array(z.tuple([z.number().min(0).max(1000),z.number().min(0).max(600)])).min(1).max(2000)});
export const mathWorkSchema=z.object({attemptId:z.string().uuid(),questionId:z.string().uuid(),strokes:z.array(strokeSchema).max(300),transcription:z.string().max(12000).default(""),confirmed:z.boolean().default(false)});
export type Stroke=z.infer<typeof strokeSchema>;
export type MathWork=z.infer<typeof mathWorkSchema> & {id:string;updatedAt:string};
export function paintWork(canvas:HTMLCanvasElement,strokes:Stroke[]) {
 const ctx=canvas.getContext("2d"); if(!ctx)return;
 ctx.fillStyle="#ffffff";ctx.fillRect(0,0,canvas.width,canvas.height);ctx.lineCap="round";ctx.lineJoin="round";
 for(const stroke of strokes){ctx.strokeStyle=stroke.erase?"#ffffff":"#171331";ctx.lineWidth=stroke.width;ctx.beginPath();stroke.points.forEach(([x,y],i)=>{if(i===0)ctx.moveTo(x,y);else ctx.lineTo(x,y);});if(stroke.points.length===1){ctx.lineTo(stroke.points[0][0]+0.1,stroke.points[0][1]);}ctx.stroke();}
}
