import type { NextRequest } from "next/server";
import { handle, json, requireAdmin } from "@/lib/http";
import { currentYear, redraw } from "@/lib/service";
import { getStore } from "@/lib/store";

export async function POST(req: NextRequest) {
  return handle(async () => {
    const denied = await requireAdmin(req);
    if (denied) return denied;
    await redraw(getStore(), currentYear());
    return json({ ok: true });
  });
}
