import { NextResponse } from "next/server";
import { z } from "zod";
import { apiError, requireUser, protectMutation, readJson } from "@/lib/server";
import { requireFeature } from "@/lib/feature-access";
import { generateSchema } from "@/lib/schemas";
import { readLocalData, updateLocalData } from "@/lib/local-store";
export async function GET() { try { await requireUser(); await requireFeature(); return NextResponse.json({presets:(await readLocalData()).testPresets}); } catch(e){ return apiError(e); } }
export async function POST(request: Request) { try {
  protectMutation(request); await requireUser(); await requireFeature();
  const input = z.object({id:z.string().uuid(), name:z.string().trim().min(1).max(100), settings:generateSchema}).parse(await readJson(request));
  await updateLocalData(data => { data.testPresets = [input, ...data.testPresets.filter(p => p.id !== input.id)].slice(0,100); });
  return NextResponse.json(input);
} catch(e){return apiError(e);} }
export async function DELETE(request: Request) { try {
  protectMutation(request); await requireUser(); await requireFeature(); const {id}=z.object({id:z.string().uuid()}).parse(await readJson(request));
  await updateLocalData(data=>{data.testPresets=data.testPresets.filter(p=>p.id!==id);}); return NextResponse.json({ok:true});
} catch(e){return apiError(e);} }
