import type { NextRequest } from "next/server";
import { handle, json, readJson } from "@/lib/http";
import { putKidNotes } from "@/lib/service";
import { getStore } from "@/lib/store";

/** 403 unless the token's person is that kid's parent. */
export async function PUT(req: NextRequest, ctx: RouteContext<"/api/r/[token]/kidnotes/[kidId]">) {
  return handle(async () => {
    const { token, kidId } = await ctx.params;
    return json({ notes: await putKidNotes(getStore(), token, kidId, await readJson(req)) });
  });
}
