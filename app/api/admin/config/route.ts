import type { NextRequest } from "next/server";
import { handle, json, readJson, requireAdmin } from "@/lib/http";
import { currentYear, getConfig, isDrawn, saveConfig } from "@/lib/service";
import { getStore } from "@/lib/store";

export async function GET(req: NextRequest) {
  return handle(async () => {
    const denied = await requireAdmin(req);
    if (denied) return denied;
    const store = getStore();
    const year = currentYear();
    return json({ year, drawn: await isDrawn(store, year), config: await getConfig(store, year) });
  });
}

export async function PUT(req: NextRequest) {
  return handle(async () => {
    const denied = await requireAdmin(req);
    if (denied) return denied;
    const store = getStore();
    const year = currentYear();
    const config = await saveConfig(store, year, await readJson(req));
    return json({ year, drawn: await isDrawn(store, year), config });
  });
}
