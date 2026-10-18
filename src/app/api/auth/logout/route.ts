import { NextResponse } from "next/server";
import { apiError, protectMutation } from "@/lib/server";
import { logoutPasswordAccount } from "@/lib/password-auth";
export async function POST(request: Request) {
  try {
    protectMutation(request);
    const response = NextResponse.json({ok:true},{headers:{"Cache-Control":"no-store"}});
    await logoutPasswordAccount(response);
    return response;
  } catch (error) {return apiError(error);}
}