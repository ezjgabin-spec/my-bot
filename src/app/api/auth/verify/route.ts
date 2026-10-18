import { NextResponse } from "next/server";
import { z } from "zod";
import { apiError, protectMutation, readJson } from "@/lib/server";
import { verifyPasswordSignup } from "@/lib/password-auth";
export async function POST(request: Request) {
  try {
    protectMutation(request);
    const input = z.object({email:z.string().max(200),code:z.string().length(6)}).parse(await readJson(request,2048));
    const response = NextResponse.json({ok:true},{headers:{"Cache-Control":"no-store"}});
    await verifyPasswordSignup(request,input,response);
    return response;
  } catch (error) {return apiError(error);}
}