import type { NextRequest } from "next/server";
import { handle, json, requireAdmin } from "@/lib/http";
import { currentYear, draw } from "@/lib/service";
import { getStore } from "@/lib/store";

/** Runs both draws. Returns [{ name, household, token }] only. 409 if already drawn. */
export async function POST(req: NextRequest) {
  return handle(async () => {
    const denied = await requireAdmin(req);
    if (denied) return denied;
    return json(await draw(getStore(), currentYear()));
  });
}
