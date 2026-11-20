import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const token = process.env.RUNNER_TOKEN;
  const runnerUrl = process.env.RUNNER_URL || "http://127.0.0.1:4317";

  if (!token || token.length < 32) {
    return NextResponse.json(
      { ok: false, error: "Local runner is not configured. Set RUNNER_TOKEN on the Next.js server." },
      { status: 503 }
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON body." }, { status: 400 });
  }

  const projectId =
    typeof body === "object" && body !== null && "projectId" in body
      ? (body as { projectId?: unknown }).projectId
      : undefined;

  if (projectId !== "hello-compose") {
    return NextResponse.json({ ok: false, error: "Unknown starter project." }, { status: 400 });
  }

  try {
    const upstream = await fetch(new URL("/build", runnerUrl), {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ projectId }),
      cache: "no-store",
      signal: AbortSignal.timeout(5 * 60 * 1000 + 10_000),
    });

    const result = await upstream.json();
    return NextResponse.json(result, { status: upstream.status });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown runner connection error.";
    return NextResponse.json(
      { ok: false, error: `Could not reach the local Android runner: ${message}` },
      { status: 502 }
    );
  }
}
