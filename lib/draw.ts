// Pure draw logic. No I/O, so it runs on the server and (for the ready check) in the browser.
import { randomInt, shuffle, type Rng } from "./random";
import type { Assignment, Config, Household, Person, ReadyStatus } from "./types";

export class DrawError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DrawError";
  }
}

const MAX_ATTEMPTS = 10_000;
const MAX_BACKTRACK_STEPS = 2_000_000;

type AdultEntry = Person & { householdId: string };
type KidEntry = Person & { householdId: string };

export function listAdults(config: Config): AdultEntry[] {
  return config.households.flatMap((h) => h.adults.map((a) => ({ ...a, householdId: h.id })));
}

export function listDrawnKids(config: Config): KidEntry[] {
  return config.households.flatMap((h) =>
    h.kids.filter((k) => !k.optedOut).map((k) => ({ id: k.id, name: k.name, householdId: h.id })),
  );
}

export function kidGivers(config: Config): Household[] {
  return config.households.filter(
    (h) => h.adults.length > 0 && !(config.rules.grandparentsSkipKids && h.isGrandparents),
  );
}

function householdOfAdult(config: Config): Map<string, string> {
  const m = new Map<string, string>();
  for (const h of config.households) for (const a of h.adults) m.set(a.id, h.id);
  return m;
}

/** Last year's adult matches: giverId -> recipientId. */
function lastAdultMatches(history: Assignment[] | null): Map<string, string> {
  const m = new Map<string, string>();
  for (const row of history ?? []) if (row.adultRecipientId) m.set(row.giverId, row.adultRecipientId);
  return m;
}

/** Last year's kid matches by (current) household: householdId -> kid ids. */
function lastKidMatches(config: Config, history: Assignment[] | null): Map<string, Set<string>> {
  const hh = householdOfAdult(config);
  const m = new Map<string, Set<string>>();
  for (const row of history ?? []) {
    const h = hh.get(row.giverId);
    if (!h) continue;
    const set = m.get(h) ?? new Set<string>();
    for (const k of row.kidRecipientIds ?? []) set.add(k);
    m.set(h, set);
  }
  return m;
}

// ---------------------------------------------------------------- adult draw

/** Returns giverId -> recipientId. Throws DrawError (naming the rule) if no valid draw exists. */
export function drawAdults(
  config: Config,
  history: Assignment[] | null,
  rng: Rng = randomInt,
): Map<string, string> {
  const adults = listAdults(config);
  const n = adults.length;
  if (n === 0) return new Map();
  if (n === 1) throw new DrawError(`No valid draw: ${adults[0].name} is the only adult, so there's nobody to draw.`);

  const last = config.rules.noRepeat ? lastAdultMatches(history) : new Map<string, string>();
  const baseOk = (i: number, j: number) => i !== j && adults[i].householdId !== adults[j].householdId;

  // Fixed matches: giver index -> recipient index. A pin overrides no-repeat, never self/spouse.
  const index = new Map(adults.map((a, i) => [a.id, i]));
  const pins = new Map<number, number>();
  const pinnedBy = new Map<number, number>();
  for (const [giverId, recipientId] of Object.entries(config.pins?.adults ?? {})) {
    const i = index.get(giverId);
    const j = index.get(recipientId);
    if (i === undefined || j === undefined) continue; // stale pin for someone who was removed
    if (!baseOk(i, j)) {
      throw new DrawError(`Fixed match: ${adults[i].name} can't give to ${adults[j].name}, because of the spouse rule.`);
    }
    if (pinnedBy.has(j)) {
      throw new DrawError(
        `Fixed matches: ${adults[pinnedBy.get(j)!].name} and ${adults[i].name} are both set to give to ${adults[j].name}.`,
      );
    }
    pins.set(i, j);
    pinnedBy.set(j, i);
  }

  const freeOk = (i: number, j: number) => baseOk(i, j) && !pinnedBy.has(j);
  const ok = (i: number, j: number) =>
    pins.has(i) ? pins.get(i) === j : freeOk(i, j) && last.get(adults[i].id) !== adults[j].id;

  // Anyone with zero options? Name them and the rule that boxed them in.
  for (let i = 0; i < n; i++) {
    if (adults.some((_, j) => ok(i, j))) continue;
    const why = !adults.some((_, j) => baseOk(i, j))
      ? "the spouse rule"
      : !adults.some((_, j) => freeOk(i, j))
        ? "the fixed matches plus the spouse rule"
        : "the no-repeat rule plus the spouse rule";
    throw new DrawError(`No valid draw: ${why} leaves ${adults[i].name} no options.`);
  }
  // Anyone nobody can draw?
  for (let j = 0; j < n; j++) {
    if (adults.some((_, i) => ok(i, j))) continue;
    const why = !adults.some((_, i) => baseOk(i, j))
      ? "the spouse rule"
      : !adults.some((_, i) => !pins.has(i) && baseOk(i, j))
        ? "the fixed matches plus the spouse rule"
        : "the no-repeat rule plus the spouse rule";
    throw new DrawError(`No valid draw: ${why} means nobody can draw ${adults[j].name}.`);
  }

  const idx = adults.map((_, i) => i);
  // Shuffle and reject: uniform over all valid assignments.
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    const perm = shuffle(idx, rng);
    if (perm.every((j, i) => ok(i, j))) return toMap(adults, perm);
  }

  // Very tight constraints: fall back to randomized backtracking, which also proves impossibility.
  const perm = backtrackPermutation(n, ok, rng);
  if (perm) return toMap(adults, perm);
  const pinOk = (i: number, j: number) => (pins.has(i) ? pins.get(i) === j : freeOk(i, j));
  if (config.rules.noRepeat && backtrackPermutation(n, pinOk, rng)) {
    throw new DrawError(
      "No valid draw: the no-repeat rule plus the spouse rule leaves no way to pair everyone up. Try turning off no-repeat.",
    );
  }
  if (pins.size > 0 && backtrackPermutation(n, baseOk, rng)) {
    throw new DrawError("No valid draw: the fixed matches leave no way to pair everyone else up. Try removing one.");
  }
  throw new DrawError(
    "No valid draw: the spouse rule leaves no way to pair everyone up. One household has more than half the adults.",
  );
}

function toMap(adults: AdultEntry[], perm: number[]): Map<string, string> {
  const m = new Map<string, string>();
  perm.forEach((j, i) => m.set(adults[i].id, adults[j].id));
  return m;
}

function backtrackPermutation(n: number, ok: (i: number, j: number) => boolean, rng: Rng): number[] | null {
  const perm = new Array<number>(n).fill(-1);
  const used = new Array<boolean>(n).fill(false);
  let steps = 0;
  const go = (i: number): boolean => {
    if (i === n) return true;
    for (const j of shuffle([...Array(n).keys()], rng)) {
      if (++steps > MAX_BACKTRACK_STEPS) return false;
      if (used[j] || !ok(i, j)) continue;
      used[j] = true;
      perm[i] = j;
      if (go(i + 1)) return true;
      used[j] = false;
    }
    return false;
  };
  return go(0) ? perm : null;
}

// ---------------------------------------------------------------- kid draw

type KidPlan = { floor: number; extra: number; ceil: number };

function kidPlan(kidCount: number, giverCount: number): KidPlan {
  const floor = Math.floor(kidCount / giverCount);
  const extra = kidCount % giverCount;
  return { floor, extra, ceil: floor + (extra > 0 ? 1 : 0) };
}

/**
 * Returns householdId -> kid ids. Every giver gets floor(K/G) or ceil(K/G) kids, so
 * nobody gets 3 before everyone has 2, and when kids < couples, random couples sit out.
 */
export function drawKids(
  config: Config,
  history: Assignment[] | null,
  rng: Rng = randomInt,
): Map<string, string[]> {
  const givers = kidGivers(config);
  const kids = listDrawnKids(config);
  const result = new Map<string, string[]>(givers.map((g) => [g.id, []]));
  if (kids.length === 0) return result;
  if (givers.length === 0) throw new DrawError("No valid draw: there are kids in the draw but no households to draw them.");

  const last = config.rules.noRepeat ? lastKidMatches(config, history) : new Map<string, Set<string>>();
  const ownOk = (g: Household, k: KidEntry) => !(config.rules.ownKids && k.householdId === g.id);

  // Fixed matches: kidId -> householdId. A pin overrides no-repeat, never the own-kids rule.
  const kidPins = new Map<string, string>();
  for (const [householdId, kidId] of Object.entries(config.pins?.kids ?? {})) {
    const h = config.households.find((x) => x.id === householdId);
    const kid = config.households.flatMap((x) => x.kids.map((k) => ({ ...k, householdId: x.id }))).find((k) => k.id === kidId);
    if (!h || !kid) continue; // stale pin
    if (kid.optedOut) throw new DrawError(`Fixed match: ${kid.name} is sitting out this year, so ${h.name} can't cover them.`);
    if (!givers.some((g) => g.id === h.id)) throw new DrawError(`Fixed match: ${h.name} is sitting out the kid draw.`);
    if (!ownOk(h, kid)) throw new DrawError(`Fixed match: ${h.name} can't cover their own kid, ${kid.name}.`);
    const other = kidPins.get(kid.id);
    if (other) {
      const otherName = config.households.find((x) => x.id === other)?.name ?? "Another household";
      throw new DrawError(`Fixed matches: ${otherName} and ${h.name} are both set to cover ${kid.name}.`);
    }
    kidPins.set(kid.id, h.id);
  }

  const freeOk = (g: Household, k: KidEntry) => (kidPins.has(k.id) ? kidPins.get(k.id) === g.id : ownOk(g, k));
  const ok = (g: Household, k: KidEntry) => (kidPins.has(k.id) ? kidPins.get(k.id) === g.id : ownOk(g, k) && !last.get(g.id)?.has(k.id));
  const plan = kidPlan(kids.length, givers.length);

  // A giver that must take a kid but has none it's allowed to take.
  if (plan.floor >= 1) {
    for (const g of givers) {
      if (kids.some((k) => ok(g, k))) continue;
      const why = !kids.some((k) => ownOk(g, k))
        ? "the own-kids rule"
        : !kids.some((k) => freeOk(g, k))
          ? "the fixed matches"
          : "the no-repeat rule";
      throw new DrawError(`No valid draw: ${why} leaves ${g.name} no eligible kid.`);
    }
  }
  for (const k of kids) {
    if (!givers.some((g) => ok(g, k))) {
      const why = givers.some((g) => ownOk(g, k)) ? "the no-repeat rule" : "the own-kids rule";
      throw new DrawError(`No valid draw: ${why} means no household can draw ${k.name}.`);
    }
  }

  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    const order = shuffle(givers, rng);
    const slots: Household[] = [];
    order.forEach((g, i) => {
      const cap = i < plan.extra ? plan.ceil : plan.floor;
      for (let c = 0; c < cap; c++) slots.push(g);
    });
    const ks = shuffle(kids, rng);
    if (ks.every((k, i) => ok(slots[i], k))) {
      ks.forEach((k, i) => result.get(slots[i].id)!.push(k.id));
      return result;
    }
  }

  const found = backtrackKids(givers, kids, plan, ok, rng);
  if (found) return found;
  if (config.rules.noRepeat && backtrackKids(givers, kids, plan, freeOk, rng)) {
    throw new DrawError(
      "No valid draw: the no-repeat rule plus the own-kids rule leaves no way to share out the kids. Try turning off no-repeat.",
    );
  }
  if (kidPins.size > 0 && backtrackKids(givers, kids, plan, ownOk, rng)) {
    throw new DrawError("No valid draw: the fixed kid matches leave no way to share out the other kids evenly. Try removing one.");
  }
  throw new DrawError("No valid draw: the own-kids rule leaves no way to share out the kids evenly.");
}

function backtrackKids(
  givers: Household[],
  kids: KidEntry[],
  plan: KidPlan,
  ok: (g: Household, k: KidEntry) => boolean,
  rng: Rng,
): Map<string, string[]> | null {
  const ks = shuffle(kids, rng);
  const count = new Map<string, number>(givers.map((g) => [g.id, 0]));
  const assign: Household[] = [];
  let atCeil = 0;
  let steps = 0;
  const go = (i: number): boolean => {
    if (i === ks.length) return true;
    for (const g of shuffle(givers, rng)) {
      if (++steps > MAX_BACKTRACK_STEPS) return false;
      const c = count.get(g.id)!;
      if (c >= plan.ceil || !ok(g, ks[i])) continue;
      const toCeil = plan.ceil > plan.floor && c === plan.floor;
      if (toCeil && atCeil >= plan.extra) continue;
      count.set(g.id, c + 1);
      if (toCeil) atCeil++;
      assign[i] = g;
      if (go(i + 1)) return true;
      count.set(g.id, c);
      if (toCeil) atCeil--;
    }
    return false;
  };
  if (!go(0)) return null;
  const m = new Map<string, string[]>(givers.map((g) => [g.id, []]));
  ks.forEach((k, i) => m.get(assign[i].id)!.push(k.id));
  return m;
}

// ---------------------------------------------------------------- full draw + ready check

/** Runs both draws. One row per adult; both adults in a household share the household's kids. */
export function runDraw(config: Config, history: Assignment[] | null, rng: Rng = randomInt): Assignment[] {
  const adultMatches = drawAdults(config, history, rng);
  const kidMatches = drawKids(config, history, rng);
  return listAdults(config).map((a) => ({
    giverId: a.id,
    adultRecipientId: adultMatches.get(a.id)!,
    kidRecipientIds: [...(kidMatches.get(a.householdId) ?? [])],
  }));
}

export function readyCheck(config: Config, history: Assignment[] | null): ReadyStatus {
  const adultCount = listAdults(config).length;
  const kidCount = listDrawnKids(config).length;
  const giverCount = kidGivers(config).length;
  const base = { adultCount, kidCount, giverCount };

  try {
    drawAdults(config, history);
    drawKids(config, history);
  } catch (e) {
    const message = e instanceof DrawError ? e.message : "Something went wrong checking the draw.";
    return { ...base, ok: false, level: "error", message };
  }

  const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;
  let level: ReadyStatus["level"] = "info";
  let message: string;
  if (kidCount === 0) message = "No kids in the draw this year. Adults only.";
  else if (kidCount === giverCount) {
    level = "ok";
    message = "Every couple draws exactly one kid.";
  } else if (kidCount > giverCount) {
    const plan = kidPlan(kidCount, giverCount);
    const more = plan.ceil === 2 ? "two kids" : `${plan.ceil} kids`;
    message =
      plan.extra === 0
        ? `${kidCount} kids and ${giverCount} couples, so every couple draws ${plan.floor} kids.`
        : `${kidCount} kids and ${giverCount} couples, so ${plural(plan.extra, "couple takes", "couples take")} ${more}. Picked at random.`;
  } else {
    const out = giverCount - kidCount;
    message = `${kidCount} kids and ${giverCount} couples, so ${plural(out, "couple sits", "couples sit")} out the kid draw. Picked at random.`;
  }
  return { ...base, ok: true, level, message };
}
