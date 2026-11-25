import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it } from "vitest";
import { POST as breakSealPOST } from "@/app/api/admin/break-seal/route";
import { POST as drawPOST } from "@/app/api/admin/draw/route";
import { GET as linksGET } from "@/app/api/admin/links/route";
import { POST as redrawPOST } from "@/app/api/admin/redraw/route";
import { GET as revealGET } from "@/app/api/r/[token]/route";
import { POST as openPOST } from "@/app/api/r/[token]/open/route";
import { PUT as kidnotesPUT } from "@/app/api/r/[token]/kidnotes/[kidId]/route";
import { PUT as wishlistPUT } from "@/app/api/r/[token]/wishlist/route";
import { SESSION_COOKIE, createSession } from "@/lib/auth";
import { defaultConfig } from "@/lib/defaults";
import { keys, publicBaseUrl } from "@/lib/service";
import { MemoryStore, setStoreForTests } from "@/lib/store";
import type { Assignment, TokenRow } from "@/lib/types";

process.env.SESSION_SECRET = "test-secret-that-is-long-enough";
process.env.DRAW_YEAR = "2026";

const KID_NAMES = ["Mae", "Sawyer", "Salem", "River", "Ellie", "Parker", "Shepherd"];
const LINK_ROW_KEYS = ["hasWishlist", "household", "name", "openedAt", "personId", "token"];

let store: MemoryStore;

async function adminReq(path: string, init: { method?: string; body?: unknown } = {}) {
  const req = new NextRequest(`http://localhost${path}`, {
    method: init.method ?? "GET",
    body: init.body === undefined ? undefined : JSON.stringify(init.body),
    headers: { "content-type": "application/json" },
  });
  req.cookies.set(SESSION_COOKIE, await createSession());
  return req;
}

function plainReq(path: string, init: { method?: string; body?: unknown } = {}) {
  return new NextRequest(`http://localhost${path}`, {
    method: init.method ?? "GET",
    body: init.body === undefined ? undefined : JSON.stringify(init.body),
    headers: { "content-type": "application/json" },
  });
}

const ctx = <T extends Record<string, string>>(params: T) => ({ params: Promise.resolve(params) });

/** Fails if any recipient field or kid name shows up anywhere in the body. */
function expectRedacted(text: string) {
  expect(text).not.toMatch(/adultRecipientId|kidRecipientIds|recipient|buysFor|fullList/i);
  for (const kid of KID_NAMES) expect(text).not.toContain(kid);
}

async function drawNow() {
  const res = await drawPOST(await adminReq("/api/admin/draw", { method: "POST" }));
  expect(res.status).toBe(200);
  return res;
}

async function tokenFor(personId: string) {
  const tokens = (await store.get<TokenRow[]>(keys.tokens(2026)))!;
  return tokens.find((t) => t.personId === personId)!.token;
}

beforeEach(() => {
  store = new MemoryStore();
  setStoreForTests(store);
});

describe("redaction", () => {
  it("POST /api/admin/draw returns names and tokens only", async () => {
    const res = await drawNow();
    const text = await res.text();
    expectRedacted(text);
    const body = JSON.parse(text) as Record<string, string>[];
    expect(body).toHaveLength(10);
    for (const row of body) expect(Object.keys(row).sort()).toEqual(["household", "name", "token"]);
  });

  it("GET /api/admin/links has no recipients while the seal is intact", async () => {
    await drawNow();
    // Open a link and add a wishlist so those code paths run too.
    const t = await tokenFor("elena");
    await openPOST(plainReq(`/api/r/${t}/open`, { method: "POST" }), ctx({ token: t }));
    await wishlistPUT(plainReq(`/api/r/${t}/wishlist`, { method: "PUT", body: [{ text: "Socks" }] }), ctx({ token: t }));

    const res = await linksGET(await adminReq("/api/admin/links"));
    const text = await res.text();
    expectRedacted(text);
    const body = JSON.parse(text);
    expect(body.sealBroken).toBe(false);
    expect(body.rows).toHaveLength(10);
    for (const row of body.rows) expect(Object.keys(row).sort()).toEqual(LINK_ROW_KEYS);
    expect(body.openedCount).toBe(1);
    expect(body.rows.find((r: { personId: string }) => r.personId === "elena").hasWishlist).toBe(true);
  });

  it("break-seal needs the typed confirmation, then the full list shows and links say so", async () => {
    await drawNow();
    const wrong = await breakSealPOST(await adminReq("/api/admin/break-seal", { method: "POST", body: { confirm: "yes" } }));
    expect(wrong.status).toBe(400);
    expectRedacted(await (await linksGET(await adminReq("/api/admin/links"))).text());

    const res = await breakSealPOST(await adminReq("/api/admin/break-seal", { method: "POST", body: { confirm: "BREAK" } }));
    expect(res.status).toBe(200);
    expect(await res.json()).toHaveLength(10);

    const links = await (await linksGET(await adminReq("/api/admin/links"))).json();
    expect(links.sealBroken).toBe(true);
    expect(links.fullList).toHaveLength(10);

    const t = await tokenFor("seth");
    const view = await (await revealGET(plainReq(`/api/r/${t}`), ctx({ token: t }))).json();
    expect(view.sealBroken).toBe(true);
    expect(view.sealBrokenAt).toBeTruthy();
  });

  it("admin routes reject requests without the session cookie", async () => {
    expect((await linksGET(plainReq("/api/admin/links"))).status).toBe(401);
    expect((await drawPOST(plainReq("/api/admin/draw", { method: "POST" }))).status).toBe(401);
  });
});

describe("draw lifecycle", () => {
  it("a second draw is a 409", async () => {
    await drawNow();
    const res = await drawPOST(await adminReq("/api/admin/draw", { method: "POST" }));
    expect(res.status).toBe(409);
  });

  it("writes history for next year and a link per adult", async () => {
    await drawNow();
    const sealed = await store.get<Assignment[]>(keys.sealed(2026));
    expect(await store.get(keys.history(2026))).toEqual(sealed);
    const tokens = (await store.get<TokenRow[]>(keys.tokens(2026)))!;
    expect(tokens).toHaveLength(10);
    for (const t of tokens) {
      expect(t.token).toMatch(/^[a-z]+-[a-z2-7]{10}$/);
      expect(await store.get(keys.link(t.token))).toMatchObject({ year: 2026, personId: t.personId, openedAt: null });
    }
  });

  it("redraw is blocked once someone opens a link, unless the seal is broken; it keeps wishlists", async () => {
    await drawNow();
    const t = await tokenFor("mandy");
    await wishlistPUT(plainReq(`/api/r/${t}/wishlist`, { method: "PUT", body: [{ text: "A book" }] }), ctx({ token: t }));
    await openPOST(plainReq(`/api/r/${t}/open`, { method: "POST" }), ctx({ token: t }));

    expect((await redrawPOST(await adminReq("/api/admin/redraw", { method: "POST" }))).status).toBe(409);
    await breakSealPOST(await adminReq("/api/admin/break-seal", { method: "POST", body: { confirm: "BREAK" } }));
    expect((await redrawPOST(await adminReq("/api/admin/redraw", { method: "POST" }))).status).toBe(200);

    expect(await store.get(keys.meta(2026))).toBeNull();
    expect(await store.get(keys.sealed(2026))).toBeNull();
    expect(await store.get(keys.history(2026))).toBeNull();
    expect(await store.get(keys.link(t))).toBeNull();
    expect(await store.get(keys.wishlist(2026, "mandy"))).toEqual([expect.objectContaining({ text: "A book" })]);
    await drawNow();
  });
});

describe("private links", () => {
  it("unknown or malformed tokens are a plain 404", async () => {
    await drawNow();
    for (const token of ["elena-aaaaaaaaaa", "nope", "../config:2026"]) {
      const res = await revealGET(plainReq(`/api/r/x`), ctx({ token }));
      expect(res.status).toBe(404);
      expect(await res.json()).toEqual({ error: "Not found" });
    }
  });

  it("shows only that person's match, the shared kid, and the recipient's wishlist", async () => {
    await drawNow();
    const sealed = (await store.get<Assignment[]>(keys.sealed(2026)))!;
    const mine = sealed.find((r) => r.giverId === "spencer")!;
    const theirToken = await tokenFor(mine.adultRecipientId);
    await wishlistPUT(
      plainReq("/x", { method: "PUT", body: [{ text: "Gloves", url: "example.com/gloves" }, { text: "" }] }),
      ctx({ token: theirToken }),
    );

    const t = await tokenFor("spencer");
    const view = await (await revealGET(plainReq(`/api/r/${t}`), ctx({ token: t }))).json();
    expect(view.me.name).toBe("Spencer");
    expect(view.partners).toEqual(["Mandy"]);
    expect(view.adultRecipient.id).toBe(mine.adultRecipientId);
    expect(view.adultRecipient.wishlist).toEqual([expect.objectContaining({ text: "Gloves", url: "https://example.com/gloves" })]);
    expect(view.kids.map((k: { id: string }) => k.id)).toEqual(mine.kidRecipientIds);
    // Nothing about anyone else's match.
    expect(JSON.stringify(view)).not.toMatch(/sealed|giverId/);
  });

  it("sets openedAt on the open call only, and only once", async () => {
    await drawNow();
    const t = await tokenFor("aj");
    await revealGET(plainReq(`/api/r/${t}`), ctx({ token: t }));
    expect((await store.get<{ openedAt: string | null }>(keys.link(t)))!.openedAt).toBeNull();
    const first = await (await openPOST(plainReq("/x", { method: "POST" }), ctx({ token: t }))).json();
    const second = await (await openPOST(plainReq("/x", { method: "POST" }), ctx({ token: t }))).json();
    expect(first.openedAt).toBeTruthy();
    expect(second.openedAt).toBe(first.openedAt);
  });

  it("kid notes: parents can write, everyone else gets 403, and the giver sees them", async () => {
    await drawNow();
    const elena = await tokenFor("elena");
    const ok = await kidnotesPUT(plainReq("/x", { method: "PUT", body: { text: "Loves dinosaurs" } }), ctx({ token: elena, kidId: "mae" }));
    expect(ok.status).toBe(200);
    const spencer = await tokenFor("spencer");
    const no = await kidnotesPUT(plainReq("/x", { method: "PUT", body: { text: "hi" } }), ctx({ token: spencer, kidId: "mae" }));
    expect(no.status).toBe(403);

    const sealed = (await store.get<Assignment[]>(keys.sealed(2026)))!;
    const giver = sealed.find((r) => r.kidRecipientIds.includes("mae"))!;
    const gt = await tokenFor(giver.giverId);
    const view = await (await revealGET(plainReq("/x"), ctx({ token: gt }))).json();
    expect(view.kids.find((k: { id: string }) => k.id === "mae").notes).toBe("Loves dinosaurs");
  });
});

describe("config", () => {
  it("the seeded default has 10 adults and 5 kids in the draw", () => {
    const c = defaultConfig();
    expect(c.households.flatMap((h) => h.adults)).toHaveLength(10);
    expect(c.households.flatMap((h) => h.kids).filter((k) => !k.optedOut)).toHaveLength(5);
    expect(c.rules).toEqual({ ownKids: true, noRepeat: true, grandparentsSkipKids: false });
  });
});

describe("link base URL", () => {
  const saved = { ...process.env };
  const reset = () => {
    for (const k of ["PUBLIC_BASE_URL", "VERCEL_PROJECT_PRODUCTION_URL"]) {
      if (saved[k] === undefined) delete process.env[k];
      else process.env[k] = saved[k];
    }
  };

  it("uses Vercel's production domain, not a protected deployment URL", async () => {
    process.env.VERCEL_PROJECT_PRODUCTION_URL = "keithcringle.vercel.app";
    delete process.env.PUBLIC_BASE_URL;
    try {
      expect(publicBaseUrl()).toBe("https://keithcringle.vercel.app");
      await drawNow();
      const view = await (await linksGET(await adminReq("/api/admin/links"))).json();
      expect(view.baseUrl).toBe("https://keithcringle.vercel.app");
    } finally {
      reset();
    }
  });

  it("PUBLIC_BASE_URL overrides it, and local dev gets null", () => {
    try {
      process.env.VERCEL_PROJECT_PRODUCTION_URL = "keithcringle.vercel.app";
      process.env.PUBLIC_BASE_URL = "https://draw.example.com/";
      expect(publicBaseUrl()).toBe("https://draw.example.com");
      delete process.env.PUBLIC_BASE_URL;
      delete process.env.VERCEL_PROJECT_PRODUCTION_URL;
      expect(publicBaseUrl()).toBeNull();
    } finally {
      reset();
    }
  });
});
