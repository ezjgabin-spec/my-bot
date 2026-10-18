import { NextResponse } from "next/server";
import { z } from "zod";
import { apiError, protectMutation, readJson } from "@/lib/server";
import { loginPasswordAccount } from "@/lib/password-auth";
export async function POST(request: Request) {
  try {
    protectMutation(request);
    const input = z.object({email:z.string().min(3).max(200),password:z.string().min(1).max(128)}).parse(await readJson(request,4096));
    const response = NextResponse.json({ok:true},{headers:{"Cache-Control":"no-store"}});
    await loginPasswordAccount(request,input,response);
    return response;
  } catch (error) {return apiError(error);}
}