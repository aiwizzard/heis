import { NextResponse } from "next/server";
import { STARTER_RUNWARE_CATALOG } from "@heis/core";

export async function GET() {
  return NextResponse.json(STARTER_RUNWARE_CATALOG.filter((item) => item.enabled), {
    headers: { "Cache-Control": "public, max-age=300, stale-while-revalidate=3600" },
  });
}
