// Everything the API does, in one place, against a Store. Route handlers stay thin.
import { defaultConfig } from "./defaults";
import { DrawError, readyCheck, runDraw } from "./draw";
import { makeToken, randomId } from "./random";
import type { Store } from "./store";
import type {
  Assignment,
  Config,
  DrawMeta,
  Household,
  KidNotes,
  LinkRecord,
  ReadyStatus,
  TokenRow,
  WishItem,
} from "./types";

export class ServiceError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

export const keys = {
  config: (y: number) => `config:${y}`,
  meta: (y: number) => `draw:${y}:meta`,
  sealed: (y: number) => `draw:${y}:sealed`,
  tokens: (y: number) => `draw:${y}:tokens`,
  link: (t: string) => `link:${t}`,
  wishlist: (y: number, personId: string) => `wishlist:${y}:${personId}`,
  kidnotes: (y: number, kidId: string) => `kidnotes:${y}:${kidId}`,
  history: (y: number) => `history:${y}`,
};

export function currentYear(): number {
  const fromEnv = Number(process.env.DRAW_YEAR);
  return Number.isInteger(fromEnv) && fromEnv > 2000 ? fromEnv : new Date().getFullYear();
}

const TOKEN_RE = /^[a-z0-9]{1,40}-[a-z2-7]{10}$/;
const ID_RE = /^[a-z0-9][a-z0-9-]{0,39}$/;

// ---------------------------------------------------------------- config

function str(v: unknown, max: number): string {
  return typeof v === "string" ? v.trim().slice(0, max) : "";
}

export function sanitizeConfig(input: unknown): Config {
  const bad = (msg: string) => new ServiceError(400, msg);
  if (!input || typeof input !== "object") throw bad("Config is missing.");
  const c = input as Record<string, unknown>;
  if (!Array.isArray(c.households) || c.households.length > 30) throw bad("Households must be a list.");
  const seen = new Set<string>();
  const id = (v: unknown, what: string) => {
    const s = typeof v === "string" ? v : "";
    if (!ID_RE.test(s)) throw bad(`Bad id for ${what}.`);
    if (seen.has(s)) throw bad(`Duplicate id "${s}".`);
    seen.add(s);
    return s;
  };
  const households: Household[] = c.households.map((raw: unknown, i: number) => {
    const h = (raw ?? {}) as Record<string, unknown>;
    const name = str(h.name, 80) || `Household ${i + 1}`;
    const adults = Array.isArray(h.adults) ? h.adults : [];
    const kids = Array.isArray(h.kids) ? h.kids : [];
    if (adults.length > 10 || kids.length > 20) throw bad(`${name} has too many people.`);
    return {
      id: id(h.id, name),
      name,
      ...(str(h.tag, 40) ? { tag: str(h.tag, 40) } : {}),
      ...(h.isGrandparents === true ? { isGrandparents: true } : {}),
      adults: adults.map((a: Record<string, unknown>) => {
        const n = str(a?.name, 40);
        if (!n) throw bad(`Every adult in ${name} needs a name.`);
        return { id: id(a.id, n), name: n };
      }),
      kids: kids.map((k: Record<string, unknown>) => {
        const n = str(k?.name, 40);
        if (!n) throw bad(`Every kid in ${name} needs a name.`);
        return { id: id(k.id, n), name: n, optedOut: k.optedOut === true };
      }),
    };
  });
  if (households.filter((h) => h.isGrandparents).length > 1) throw bad("Only one household can be the grandparents.");
  const r = (c.rules ?? {}) as Record<string, unknown>;
  const b = (c.budgets ?? {}) as Record<string, unknown>;
  return {
    households,
    rules: {
      ownKids: r.ownKids !== false,
      noRepeat: r.noRepeat !== false,
      grandparentsSkipKids: r.grandparentsSkipKids === true,
    },
    budgets: { adult: str(b.adult, 30), kid: str(b.kid, 30) },
    exchangeDate: str(c.exchangeDate, 80),
  };
}

export async function getConfig(store: Store, year: number): Promise<Config> {
  return (await store.get<Config>(keys.config(year))) ?? defaultConfig();
}

export async function isDrawn(store: Store, year: number): Promise<boolean> {
  return (await store.get<DrawMeta>(keys.meta(year))) !== null;
}

/** Saves config. After the draw, only the details (date, budgets) can change. */
export async function saveConfig(store: Store, year: number, input: unknown): Promise<Config> {
  const next = sanitizeConfig(input);
  if (await isDrawn(store, year)) {
    const current = await getConfig(store, year);
    const locked = { ...current, budgets: next.budgets, exchangeDate: next.exchangeDate };
    await store.set(keys.config(year), locked);
    return locked;
  }
  await store.set(keys.config(year), next);
  return next;
}

// ---------------------------------------------------------------- last year's matches

export async function getLastYear(store: Store, year: number): Promise<Assignment[]> {
  return (await store.get<Assignment[]>(keys.history(year - 1))) ?? [];
}

export async function saveLastYear(store: Store, year: number, input: unknown): Promise<Assignment[]> {
  if (!Array.isArray(input) || input.length > 100) throw new ServiceError(400, "Expected a list of matches.");
  const rows: Assignment[] = input
    .map((raw: Record<string, unknown>) => ({
      giverId: str(raw?.giverId, 40),
      adultRecipientId: str(raw?.adultRecipientId, 40),
      kidRecipientIds: Array.isArray(raw?.kidRecipientIds)
        ? raw.kidRecipientIds.map((k: unknown) => str(k, 40)).filter(Boolean).slice(0, 10)
        : [],
    }))
    .filter((r) => r.giverId && (r.adultRecipientId || r.kidRecipientIds.length));
  await store.set(keys.history(year - 1), rows);
  return rows;
}

export async function ready(store: Store, year: number): Promise<ReadyStatus> {
  return readyCheck(await getConfig(store, year), await getLastYear(store, year));
}

// ---------------------------------------------------------------- draw

function people(config: Config) {
  const adults = new Map<string, { name: string; household: Household }>();
  const kids = new Map<string, { name: string; household: Household; optedOut: boolean }>();
  for (const h of config.households) {
    for (const a of h.adults) adults.set(a.id, { name: a.name, household: h });
    for (const k of h.kids) kids.set(k.id, { name: k.name, household: h, optedOut: k.optedOut });
  }
  return { adults, kids };
}

export type DrawnLink = { name: string; household: string; token: string };

/** Runs both draws and writes everything. Returns names + tokens only, never recipients. */
export async function draw(store: Store, year: number): Promise<DrawnLink[]> {
  const meta: DrawMeta = { drawnAt: new Date().toISOString(), sealBroken: false, sealBrokenAt: null };
  // Claim the year first so two clicks can't both draw.
  if (!(await store.set(keys.meta(year), meta, { nx: true }))) {
    throw new ServiceError(409, "Names have already been drawn for this year.");
  }
  try {
    const config = await getConfig(store, year);
    await store.set(keys.config(year), config); // freeze the config that was drawn
    const sealed = runDraw(config, await getLastYear(store, year));
    const { adults } = people(config);

    const used = new Set<string>();
    const tokens: TokenRow[] = sealed.map((row) => {
      let token = makeToken(adults.get(row.giverId)!.name);
      while (used.has(token)) token = makeToken(adults.get(row.giverId)!.name);
      used.add(token);
      return { personId: row.giverId, token };
    });

    await store.set(keys.sealed(year), sealed);
    await store.set(keys.history(year), sealed);
    await store.set(keys.tokens(year), tokens);
    for (const [i, row] of sealed.entries()) {
      const link: LinkRecord = {
        year,
        personId: row.giverId,
        adultRecipientId: row.adultRecipientId,
        kidRecipientIds: row.kidRecipientIds,
        openedAt: null,
      };
      await store.set(keys.link(tokens[i].token), link);
    }

    return tokens.map((t) => {
      const a = adults.get(t.personId)!;
      return { name: a.name, household: a.household.name, token: t.token };
    });
  } catch (e) {
    await wipeDraw(store, year);
    if (e instanceof DrawError) throw new ServiceError(422, e.message);
    throw e;
  }
}

async function wipeDraw(store: Store, year: number) {
  const tokens = (await store.get<TokenRow[]>(keys.tokens(year))) ?? [];
  await store.del(
    ...tokens.map((t) => keys.link(t.token)),
    keys.sealed(year),
    keys.tokens(year),
    keys.history(year),
    keys.meta(year),
  );
}

export type LinkRow = {
  personId: string;
  name: string;
  household: string;
  token: string;
  openedAt: string | null;
  hasWishlist: boolean;
};

export type FullListRow = { giver: string; household: string; buysFor: string; kids: string[] };

/**
 * Where private links should point. Vercel's per-deployment and branch URLs sit behind
 * Vercel Authentication, so links must use the public production domain, never the
 * address the admin happens to be browsing. PUBLIC_BASE_URL overrides (e.g. a custom domain).
 */
export function publicBaseUrl(): string | null {
  const explicit = process.env.PUBLIC_BASE_URL?.trim();
  const host = explicit || process.env.VERCEL_PROJECT_PRODUCTION_URL?.trim();
  if (!host) return null;
  try {
    const u = new URL(/^https?:\/\//i.test(host) ? host : `https://${host}`);
    return u.origin;
  } catch {
    return null;
  }
}

export type LinksView = {
  year: number;
  /** Base for private links (production domain). Null in local dev: use the browser's origin. */
  baseUrl: string | null;
  drawn: boolean;
  drawnAt: string | null;
  sealBroken: boolean;
  sealBrokenAt: string | null;
  openedCount: number;
  canRedraw: boolean;
  rows: LinkRow[];
  /** Only present once the seal is broken. */
  fullList?: FullListRow[];
};

/** Admin links view. Never includes recipients unless the seal is broken. */
export async function links(store: Store, year: number): Promise<LinksView> {
  const meta = await store.get<DrawMeta>(keys.meta(year));
  if (!meta) {
    return { year, baseUrl: publicBaseUrl(), drawn: false, drawnAt: null, sealBroken: false, sealBrokenAt: null, openedCount: 0, canRedraw: false, rows: [] };
  }
  const config = await getConfig(store, year);
  const { adults } = people(config);
  const tokens = (await store.get<TokenRow[]>(keys.tokens(year))) ?? [];
  const rows: LinkRow[] = [];
  for (const t of tokens) {
    const link = await store.get<LinkRecord>(keys.link(t.token));
    const wish = await store.get<WishItem[]>(keys.wishlist(year, t.personId));
    const a = adults.get(t.personId);
    // Build each row field by field so nothing from the link record leaks through.
    rows.push({
      personId: t.personId,
      name: a?.name ?? t.personId,
      household: a?.household.name ?? "",
      token: t.token,
      openedAt: link?.openedAt ?? null,
      hasWishlist: Array.isArray(wish) && wish.length > 0,
    });
  }
  const openedCount = rows.filter((r) => r.openedAt).length;
  const view: LinksView = {
    year,
    baseUrl: publicBaseUrl(),
    drawn: true,
    drawnAt: meta.drawnAt,
    sealBroken: meta.sealBroken,
    sealBrokenAt: meta.sealBrokenAt,
    openedCount,
    canRedraw: openedCount === 0 || meta.sealBroken,
    rows,
  };
  if (meta.sealBroken) view.fullList = await fullList(store, year, config);
  return view;
}

async function fullList(store: Store, year: number, config: Config): Promise<FullListRow[]> {
  const { adults, kids } = people(config);
  const sealed = (await store.get<Assignment[]>(keys.sealed(year))) ?? [];
  return sealed.map((row) => ({
    giver: adults.get(row.giverId)?.name ?? row.giverId,
    household: adults.get(row.giverId)?.household.name ?? "",
    buysFor: adults.get(row.adultRecipientId)?.name ?? row.adultRecipientId,
    kids: row.kidRecipientIds.map((k) => kids.get(k)?.name ?? k),
  }));
}

export async function breakSeal(store: Store, year: number, confirm: unknown): Promise<FullListRow[]> {
  if (confirm !== "BREAK") throw new ServiceError(400, 'Type BREAK to confirm.');
  const meta = await store.get<DrawMeta>(keys.meta(year));
  if (!meta) throw new ServiceError(404, "Nothing has been drawn yet.");
  if (!meta.sealBroken) {
    await store.set(keys.meta(year), { ...meta, sealBroken: true, sealBrokenAt: new Date().toISOString() });
  }
  return fullList(store, year, await getConfig(store, year));
}

/** Wipes the draw. Wishlists and kid notes are kept. */
export async function redraw(store: Store, year: number): Promise<void> {
  const view = await links(store, year);
  if (!view.drawn) throw new ServiceError(404, "Nothing has been drawn yet.");
  if (!view.canRedraw) {
    throw new ServiceError(409, "Someone has already opened their link. Break the seal first if you really need to redraw.");
  }
  await wipeDraw(store, year);
}

// ---------------------------------------------------------------- private reveal

async function getLink(store: Store, token: string): Promise<LinkRecord> {
  if (!TOKEN_RE.test(token)) throw new ServiceError(404, "Not found");
  const link = await store.get<LinkRecord>(keys.link(token));
  if (!link) throw new ServiceError(404, "Not found");
  return link;
}

export type RevealView = {
  year: number;
  me: { id: string; name: string };
  partners: string[];
  openedAt: string | null;
  sealBroken: boolean;
  sealBrokenAt: string | null;
  budgets: { adult: string; kid: string };
  exchangeDate: string;
  adultRecipient: { id: string; name: string; wishlist: WishItem[] };
  kids: { id: string; name: string; parents: string; notes: string | null }[];
  myWishlist: WishItem[];
  myKids: { id: string; name: string; notes: string }[];
};

export async function revealView(store: Store, token: string): Promise<RevealView> {
  const link = await getLink(store, token);
  const year = link.year;
  const config = await getConfig(store, year);
  const meta = await store.get<DrawMeta>(keys.meta(year));
  const { adults, kids } = people(config);
  const me = adults.get(link.personId);
  const myHousehold = me?.household;

  const recipient = adults.get(link.adultRecipientId);
  const kidViews = await Promise.all(
    link.kidRecipientIds.map(async (kidId) => {
      const k = kids.get(kidId);
      const notes = await store.get<KidNotes>(keys.kidnotes(year, kidId));
      return { id: kidId, name: k?.name ?? "A kid", parents: k?.household.name ?? "", notes: notes?.text || null };
    }),
  );
  const myKids = await Promise.all(
    (myHousehold?.kids ?? [])
      .filter((k) => !k.optedOut)
      .map(async (k) => ({ id: k.id, name: k.name, notes: (await store.get<KidNotes>(keys.kidnotes(year, k.id)))?.text ?? "" })),
  );

  return {
    year,
    me: { id: link.personId, name: me?.name ?? "there" },
    partners: (myHousehold?.adults ?? []).filter((a) => a.id !== link.personId).map((a) => a.name),
    openedAt: link.openedAt,
    sealBroken: meta?.sealBroken ?? false,
    sealBrokenAt: meta?.sealBrokenAt ?? null,
    budgets: config.budgets,
    exchangeDate: config.exchangeDate,
    adultRecipient: {
      id: link.adultRecipientId,
      name: recipient?.name ?? "Someone",
      wishlist: (await store.get<WishItem[]>(keys.wishlist(year, link.adultRecipientId))) ?? [],
    },
    kids: kidViews,
    myWishlist: (await store.get<WishItem[]>(keys.wishlist(year, link.personId))) ?? [],
    myKids,
  };
}

export async function markOpened(store: Store, token: string): Promise<string> {
  const link = await getLink(store, token);
  if (link.openedAt) return link.openedAt;
  const openedAt = new Date().toISOString();
  await store.set(keys.link(token), { ...link, openedAt });
  return openedAt;
}

function sanitizeUrl(v: unknown): string | undefined {
  const s = str(v, 500);
  if (!s) return undefined;
  try {
    const u = new URL(/^https?:\/\//i.test(s) ? s : `https://${s}`);
    return u.protocol === "https:" || u.protocol === "http:" ? u.toString() : undefined;
  } catch {
    return undefined;
  }
}

export async function putWishlist(store: Store, token: string, input: unknown): Promise<WishItem[]> {
  const link = await getLink(store, token);
  if (!Array.isArray(input) || input.length > 30) throw new ServiceError(400, "A wishlist can hold up to 30 items.");
  const items: WishItem[] = [];
  for (const raw of input as Record<string, unknown>[]) {
    const text = str(raw?.text, 200);
    if (!text) continue;
    const id = typeof raw.id === "string" && /^[a-z2-7]{1,20}$/.test(raw.id) ? raw.id : randomId();
    const url = sanitizeUrl(raw.url);
    items.push(url ? { id, text, url } : { id, text });
  }
  await store.set(keys.wishlist(link.year, link.personId), items);
  return items;
}

export async function putKidNotes(store: Store, token: string, kidId: string, input: unknown): Promise<KidNotes | null> {
  const link = await getLink(store, token);
  const config = await getConfig(store, link.year);
  const household = config.households.find((h) => h.adults.some((a) => a.id === link.personId));
  const kid = household?.kids.find((k) => k.id === kidId);
  if (!kid) throw new ServiceError(403, "You can only write notes for your own kids.");
  const text = str((input as Record<string, unknown>)?.text, 2000);
  if (!text) {
    await store.del(keys.kidnotes(link.year, kidId));
    return null;
  }
  const notes: KidNotes = { text, updatedAt: new Date().toISOString() };
  await store.set(keys.kidnotes(link.year, kidId), notes);
  return notes;
}
