import { NextResponse } from "next/server";

function retired() {
  return NextResponse.json({
    error: {
      code: "LEGACY_WORKFLOW_API_RETIRED",
      message: "The MuAPI workflow service has been retired. Use the local Heis workflow store while node execution is being migrated.",
    },
  }, { status: 410 });
}

export const GET = retired;
export const POST = retired;
export const PUT = retired;
export const DELETE = retired;
