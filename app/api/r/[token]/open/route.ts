import type { NextRequest } from "next/server";
import { handle, json } from "@/lib/http";
import { markOpened } from "@/lib/service";
import { getStore } from "@/lib/store";

/** Called on the first tap of "Open your tag", not on page load, so link-preview bots don't count. */
export async function POST(_req: NextRequest, ctx: RouteContext<"/api/r/[token]/open">) {
  return handle(async () => {
    const { token } = await ctx.params;
    return json({ openedAt: await markOpened(getStore(), token) });
  });
}
