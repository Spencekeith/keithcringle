import type { NextRequest } from "next/server";
import { handle, json, requireAdmin } from "@/lib/http";
import { currentYear, links } from "@/lib/service";
import { getStore } from "@/lib/store";

/** Tokens, opened status and wishlist status. No recipients unless the seal is broken. */
export async function GET(req: NextRequest) {
  return handle(async () => {
    const denied = await requireAdmin(req);
    if (denied) return denied;
    return json(await links(getStore(), currentYear()));
  });
}
