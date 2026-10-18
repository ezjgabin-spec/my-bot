import { NextResponse } from "next/server";
import { z } from "zod";
import { AppError, apiError, protectMutation, readJson } from "@/lib/server";
import { passwordAuthEnabled, registerPasswordAccount } from "@/lib/password-auth";
export const runtime = "nodejs";
export async function POST(request: Request) {
  try {
    if (!passwordAuthEnabled()) throw new AppError("Password accounts are not enabled.", 404);
    protectMutation(request);
    const input = z.object({email:z.string().min(3).max(200),password:z.string().min(12).max(128)}).parse(await readJson(request,4096));
    await registerPasswordAccount(request,input);
    return NextResponse.json({ok:true,message:"We sent a verification code to your email."},{headers:{"Cache-Control":"no-store"}});
  } catch(error) {return apiError(error);}
}
