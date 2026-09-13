import { NextResponse } from "next/server";

export function POST() {
  return NextResponse.json({
    error: { code: "LEGACY_UPLOAD_API_RETIRED", message: "Use the Heis generation upload bridge." },
  }, { status: 410 });
}
