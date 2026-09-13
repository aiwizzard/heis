import crypto from "node:crypto";
import { tasks } from "@trigger.dev/sdk";
import type { processRunwareOutput } from "../../../../src/trigger/managedGeneration";
import { NextResponse } from "next/server";
import { env } from "@/lib/env";

function sameToken(actual: string | null, expected: string) {
  if (!actual) return false;
  const left = Buffer.from(actual); const right = Buffer.from(expected);
  return left.length === right.length && crypto.timingSafeEqual(left, right);
}
export async function POST(request: Request) {
  const url = new URL(request.url);
  if (!sameToken(url.searchParams.get("token"), env.runwareWebhookToken())) return new Response("Unauthorized", { status: 401 });
  const data = await request.json();
  const eventId = String(data.taskUUID ?? "");
  if (!eventId) return new Response("Missing taskUUID", { status: 400 });
  const handle = await tasks.trigger<typeof processRunwareOutput>("process-runware-output", { event: data });
  return NextResponse.json({ accepted: true, runId: handle.id }, { status: 202 });
}
