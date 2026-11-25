import type { NextRequest } from "next/server";
import { handle, json, readJson } from "@/lib/http";
import { putWishlist } from "@/lib/service";
import { getStore } from "@/lib/store";

export async function PUT(req: NextRequest, ctx: RouteContext<"/api/r/[token]/wishlist">) {
  return handle(async () => {
    const { token } = await ctx.params;
    return json(await putWishlist(getStore(), token, await readJson(req)));
  });
}
