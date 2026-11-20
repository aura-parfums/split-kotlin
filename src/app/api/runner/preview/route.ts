import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const token = process.env.RUNNER_TOKEN;
  const runnerUrl = process.env.RUNNER_URL || "http://127.0.0.1:4317";

  if (!token || token.length < 32) {
    return NextResponse.json(
      { ok: false, error: "Local preview runner is not configured on the Next.js server." },
      { status: 503 }
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON body." }, { status: 400 });
  }

  if (
    typeof body !== "object" ||
    body === null ||
    !("projectId" in body) ||
    !("code" in body) ||
    (body as { projectId?: unknown }).projectId !== "hello-compose" ||
    typeof (body as { code?: unknown }).code !== "string" ||
    ("screen" in body && typeof (body as { screen?: unknown }).screen !== "string")
  ) {
    return NextResponse.json({ ok: false, error: "Invalid preview request." }, { status: 400 });
  }

  try {
    const upstream = await fetch(new URL("/preview", runnerUrl), {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        projectId: "hello-compose",
        code: (body as { code: string }).code,
        screen: (body as { screen?: string }).screen,
      }),
      cache: "no-store",
      signal: AbortSignal.timeout(6 * 60 * 1000),
    });

    const result = await upstream.json();
    return NextResponse.json(result, { status: upstream.status });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown runner connection error.";
    return NextResponse.json(
      { ok: false, error: `Could not reach the local Android preview runner: ${message}` },
      { status: 502 }
    );
  }
}
