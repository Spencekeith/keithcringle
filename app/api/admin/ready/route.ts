import type { NextRequest } from "next/server";
import { handle, json, requireAdmin } from "@/lib/http";
import { currentYear, ready } from "@/lib/service";
import { getStore } from "@/lib/store";

export async function GET(req: NextRequest) {
  return handle(async () => {
    const denied = await requireAdmin(req);
    if (denied) return denied;
    return json(await ready(getStore(), currentYear()));
  });
}
