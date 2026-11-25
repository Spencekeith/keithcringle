import type { NextRequest } from "next/server";
import { handle, json, readJson, requireAdmin } from "@/lib/http";
import { breakSeal, currentYear } from "@/lib/service";
import { getStore } from "@/lib/store";

export async function POST(req: NextRequest) {
  return handle(async () => {
    const denied = await requireAdmin(req);
    if (denied) return denied;
    const body = (await readJson(req)) as { confirm?: unknown };
    return json(await breakSeal(getStore(), currentYear(), body?.confirm));
  });
}
