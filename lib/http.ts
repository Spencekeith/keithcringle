import { unstable_rethrow } from "next/navigation";
import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIE, verifySession } from "./auth";
import { ServiceError } from "./service";

const NO_STORE = { "Cache-Control": "no-store", "Referrer-Policy": "no-referrer" };

export function json(data: unknown, status = 200) {
  return NextResponse.json(data, { status, headers: NO_STORE });
}

/** Runs a handler and turns errors into JSON. Never logs request or recipient data. */
export async function handle(fn: () => Promise<Response>): Promise<Response> {
  try {
    return await fn();
  } catch (e) {
    unstable_rethrow(e); // let Next's own control-flow errors (e.g. prerender bail-outs) through
    if (e instanceof ServiceError) return json({ error: e.message }, e.status);
    console.error("[family-draw] request failed:", e instanceof Error ? e.name : "unknown error");
    return json({ error: "Something went wrong." }, 500);
  }
}

/** Defense in depth: the proxy already checks this, but every admin handler checks again. */
export async function requireAdmin(req: NextRequest): Promise<Response | null> {
  const ok = await verifySession(req.cookies.get(SESSION_COOKIE)?.value);
  return ok ? null : json({ error: "Not signed in" }, 401);
}

export async function readJson(req: NextRequest): Promise<unknown> {
  try {
    return await req.json();
  } catch {
    throw new ServiceError(400, "Expected a JSON body.");
  }
}
