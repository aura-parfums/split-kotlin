import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const token = process.env.RUNNER_TOKEN;
  const runnerUrl = process.env.RUNNER_URL || "http://127.0.0.1:4317";
  if (!token || token.length < 32) {
    return NextResponse.json({ ok: false, error: "Local preview runner is not configured." }, { status: 503 });
  }

  try {
    const upstream = await fetch(new URL("/files?projectId=hello-compose", runnerUrl), {
      headers: { Authorization: `Bearer ${token}` },
      cache: "no-store",
      signal: AbortSignal.timeout(10_000),
    });
    return NextResponse.json(await upstream.json(), { status: upstream.status });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown runner connection error.";
    return NextResponse.json({ ok: false, error: `Could not reach the Android runner: ${message}` }, { status: 502 });
  }
}
