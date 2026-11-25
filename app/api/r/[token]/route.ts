import type { NextRequest } from "next/server";
import { handle, json } from "@/lib/http";
import { revealView } from "@/lib/service";
import { getStore } from "@/lib/store";

export async function GET(_req: NextRequest, ctx: RouteContext<"/api/r/[token]">) {
  return handle(async () => {
    const { token } = await ctx.params;
    return json(await revealView(getStore(), token));
  });
}
