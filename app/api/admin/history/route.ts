import type { NextRequest } from "next/server";
import { handle, json, readJson, requireAdmin } from "@/lib/http";
import { currentYear, getLastYear, saveLastYear } from "@/lib/service";
import { getStore } from "@/lib/store";

/** Last year's matches, entered by hand so no-repeat works in year one. */
export async function GET(req: NextRequest) {
  return handle(async () => {
    const denied = await requireAdmin(req);
    if (denied) return denied;
    const year = currentYear();
    return json({ year: year - 1, rows: await getLastYear(getStore(), year) });
  });
}

export async function PUT(req: NextRequest) {
  return handle(async () => {
    const denied = await requireAdmin(req);
    if (denied) return denied;
    const year = currentYear();
    return json({ year: year - 1, rows: await saveLastYear(getStore(), year, await readJson(req)) });
  });
}
