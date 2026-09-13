import { NextResponse } from "next/server";

function retired() {
  return NextResponse.json({
    error: {
      code: "LEGACY_APP_API_RETIRED",
      message: "The legacy app compatibility API has been retired.",
    },
  }, { status: 410 });
}

export const GET = retired;
export const POST = retired;
export const PUT = retired;
export const DELETE = retired;
