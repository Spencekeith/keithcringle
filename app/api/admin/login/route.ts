import type { NextRequest } from "next/server";
import { SESSION_COOKIE, checkPassword, createSession, sessionCookieOptions } from "@/lib/auth";
import { handle, json, readJson } from "@/lib/http";

export async function POST(req: NextRequest) {
  return handle(async () => {
    if (!process.env.ADMIN_PASSWORD) return json({ error: "ADMIN_PASSWORD isn't set on the server." }, 500);
    const body = (await readJson(req)) as { password?: unknown };
    const password = typeof body?.password === "string" ? body.password : "";
    if (!(await checkPassword(password))) {
      await new Promise((r) => setTimeout(r, 600)); // slow down guessing
      return json({ error: "That password isn't right." }, 401);
    }
    const res = json({ ok: true });
    res.cookies.set(SESSION_COOKIE, await createSession(), sessionCookieOptions());
    return res;
  });
}
