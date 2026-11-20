import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const token = process.env.RUNNER_TOKEN;
  const runnerUrl = process.env.RUNNER_URL || "http://127.0.0.1:4317";
  if (!token || token.length < 32) {
    return NextResponse.json({ ok: false, error: "Local preview runner is not configured." }, { status: 503 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON body." }, { status: 400 });
  }

  if (
    typeof body !== "object" || body === null ||
    !("action" in body) || !["tap", "swipe"].includes(String((body as { action?: unknown }).action)) ||
    !("x" in body) || !("y" in body) ||
    typeof (body as { x?: unknown }).x !== "number" ||
    typeof (body as { y?: unknown }).y !== "number"
  ) {
    return NextResponse.json({ ok: false, error: "Invalid interaction request." }, { status: 400 });
  }

  try {
    const upstream = await fetch(new URL("/interact", runnerUrl), {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify(body),
      cache: "no-store",
      signal: AbortSignal.timeout(20_000),
    });
    return NextResponse.json(await upstream.json(), { status: upstream.status });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown runner connection error.";
    return NextResponse.json({ ok: false, error: `Could not reach the Android runner: ${message}` }, { status: 502 });
  }
}
