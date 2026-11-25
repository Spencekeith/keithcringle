import { describe, expect, it } from "vitest";
import { defaultConfig } from "@/lib/defaults";
import { DrawError, drawAdults, drawKids, listAdults, readyCheck, runDraw } from "@/lib/draw";
import type { Assignment, Config } from "@/lib/types";

const RUNS = 1000;

function householdOf(config: Config) {
  const m = new Map<string, string>();
  for (const h of config.households) {
    for (const a of h.adults) m.set(a.id, h.id);
    for (const k of h.kids) m.set(k.id, h.id);
  }
  return m;
}

/** A hand-written 2025 draw that is valid for the default config. */
function fakeHistory2025(): Assignment[] {
  const adult: Record<string, string> = {
    sean: "aj", aj: "spencer", spencer: "maxwell", maxwell: "seth", seth: "lauren",
    lauren: "elena", elena: "mandy", mandy: "megan", megan: "elizabeth", elizabeth: "sean",
  };
  const kidByHousehold: Record<string, string> = {
    "sean-lauren": "mae", "aj-elena": "ellie", "spencer-mandy": "sawyer",
    "maxwell-megan": "salem", "seth-elizabeth": "parker",
  };
  const hh = householdOf(defaultConfig());
  return Object.entries(adult).map(([giverId, adultRecipientId]) => ({
    giverId,
    adultRecipientId,
    kidRecipientIds: [kidByHousehold[hh.get(giverId)!]],
  }));
}

describe("adult draw", () => {
  it("never draws self or spouse, and everyone gives and receives exactly once", () => {
    const config = defaultConfig();
    const hh = householdOf(config);
    const ids = listAdults(config).map((a) => a.id).sort();
    for (let r = 0; r < RUNS; r++) {
      const m = drawAdults(config, null);
      expect([...m.keys()].sort()).toEqual(ids);
      expect([...m.values()].sort()).toEqual(ids);
      for (const [giver, recipient] of m) {
        expect(recipient).not.toBe(giver);
        expect(hh.get(recipient)).not.toBe(hh.get(giver));
      }
    }
  });
});

describe("no-repeat", () => {
  it("never repeats an adult match or a household -> kid match from last year", () => {
    const config = defaultConfig();
    const history = fakeHistory2025();
    const lastAdult = new Map(history.map((h) => [h.giverId, h.adultRecipientId]));
    const lastKid = new Map(history.map((h) => [h.giverId, h.kidRecipientIds[0]]));
    for (let r = 0; r < RUNS; r++) {
      for (const row of runDraw(config, history)) {
        expect(row.adultRecipientId).not.toBe(lastAdult.get(row.giverId));
        expect(row.kidRecipientIds).not.toContain(lastKid.get(row.giverId));
      }
    }
  });

  it("is ignored when the rule is off", () => {
    const config = defaultConfig();
    config.rules.noRepeat = false;
    const history = fakeHistory2025();
    let repeats = 0;
    for (let r = 0; r < 300; r++) {
      const rows = runDraw(config, history);
      repeats += rows.filter((row) => history.find((h) => h.giverId === row.giverId)!.adultRecipientId === row.adultRecipientId).length;
    }
    expect(repeats).toBeGreaterThan(0);
  });
});

describe("kid draw", () => {
  it("at 5 kids / 5 couples, every couple gets exactly one kid and never their own", () => {
    const config = defaultConfig();
    const hh = householdOf(config);
    for (let r = 0; r < RUNS; r++) {
      const m = drawKids(config, null);
      expect(m.size).toBe(5);
      const all: string[] = [];
      for (const [household, kids] of m) {
        expect(kids).toHaveLength(1);
        for (const k of kids) expect(hh.get(k)).not.toBe(household);
        all.push(...kids);
      }
      expect(all.sort()).toEqual(["ellie", "mae", "parker", "salem", "sawyer"]);
    }
  });

  it("never includes opted-out kids", () => {
    const config = defaultConfig();
    for (let r = 0; r < 200; r++) {
      const kids = [...drawKids(config, null).values()].flat();
      expect(kids).not.toContain("river");
      expect(kids).not.toContain("shepherd");
    }
  });

  it("at 6 kids / 5 couples, one couple takes two and the rest take one", () => {
    const config = defaultConfig();
    config.households[1].kids.find((k) => k.id === "river")!.optedOut = false;
    const hh = householdOf(config);
    const twoCounts = new Map<string, number>();
    for (let r = 0; r < RUNS; r++) {
      const m = drawKids(config, null);
      const sizes = [...m.values()].map((k) => k.length).sort();
      expect(sizes).toEqual([1, 1, 1, 1, 2]);
      for (const [household, kids] of m) {
        for (const k of kids) expect(hh.get(k)).not.toBe(household);
        if (kids.length === 2) twoCounts.set(household, (twoCounts.get(household) ?? 0) + 1);
      }
      expect([...m.values()].flat()).toHaveLength(6);
    }
    // The double-up moves around between couples.
    expect(twoCounts.size).toBeGreaterThan(1);
  });

  it("at 4 kids / 5 couples, one couple sits out", () => {
    const config = defaultConfig();
    config.households[1].kids.find((k) => k.id === "salem")!.optedOut = true;
    for (let r = 0; r < RUNS; r++) {
      const sizes = [...drawKids(config, null).values()].map((k) => k.length).sort();
      expect(sizes).toEqual([0, 1, 1, 1, 1]);
    }
  });

  it("caps at two each before anyone gets three", () => {
    const config = defaultConfig();
    // 3 givers (drop grandparents & add kids), 7 kids -> 3,2,2
    config.rules.grandparentsSkipKids = true;
    config.households = config.households.filter((h) => h.id !== "seth-elizabeth");
    config.households.find((h) => h.id === "spencer-mandy")!.kids = [
      { id: "k1", name: "K1", optedOut: false },
      { id: "k2", name: "K2", optedOut: false },
    ];
    // givers: aj-elena, spencer-mandy, maxwell-megan; kids: 3 + 2 + 2 = 7
    for (let r = 0; r < 300; r++) {
      const sizes = [...drawKids(config, null).values()].map((k) => k.length).sort();
      expect(sizes).toEqual([2, 2, 3]);
    }
  });

  it("both adults in a household see the same kid", () => {
    const config = defaultConfig();
    const hh = householdOf(config);
    for (let r = 0; r < 200; r++) {
      const rows = runDraw(config, null);
      const byHousehold = new Map<string, string>();
      for (const row of rows) {
        const key = JSON.stringify(row.kidRecipientIds);
        const h = hh.get(row.giverId)!;
        if (byHousehold.has(h)) expect(byHousehold.get(h)).toBe(key);
        byHousehold.set(h, key);
      }
    }
  });

  it("grandparents sit out the kid draw when that rule is on", () => {
    const config = defaultConfig();
    config.rules.grandparentsSkipKids = true;
    const m = drawKids(config, null);
    expect(m.has("sean-lauren")).toBe(false);
    expect([...m.values()].map((k) => k.length).sort()).toEqual([1, 1, 1, 2]);
  });
});

describe("impossible configs", () => {
  const twoHouseholds = (sizes: [number, number]): Config => ({
    ...defaultConfig(),
    households: sizes.map((n, h) => ({
      id: `h${h}`,
      name: `House ${h}`,
      adults: Array.from({ length: n }, (_, i) => ({ id: `h${h}a${i}`, name: `Adult${h}${i}` })),
      kids: [],
    })),
  });

  it("names the spouse rule when one household is too big", () => {
    const start = Date.now();
    expect(() => drawAdults(twoHouseholds([3, 1]), null)).toThrow(DrawError);
    expect(() => drawAdults(twoHouseholds([3, 1]), null)).toThrow(/spouse rule/);
    expect(Date.now() - start).toBeLessThan(5000);
  });

  it("names no-repeat plus spouse when last year leaves someone no options", () => {
    const config = twoHouseholds([1, 1]);
    const history = [{ giverId: "h0a0", adultRecipientId: "h1a0", kidRecipientIds: [] }];
    expect(() => drawAdults(config, history)).toThrow(/no-repeat rule plus the spouse rule leaves Adult00 no options/);
  });

  it("names the own-kids rule when a household can only draw its own kids", () => {
    const config = defaultConfig();
    // Only AJ & Elena's kids are in, and only AJ & Elena are giving.
    config.households = config.households.filter((h) => h.id === "aj-elena" || h.id === "sean-lauren");
    config.rules.grandparentsSkipKids = true;
    expect(() => drawKids(config, null)).toThrow(/own-kids rule leaves AJ & Elena no eligible kid/);
  });

  it("ready check reports the error instead of throwing", () => {
    const status = readyCheck(twoHouseholds([3, 1]), null);
    expect(status.ok).toBe(false);
    expect(status.level).toBe("error");
    expect(status.message).toMatch(/spouse rule/);
  });
});

describe("ready check", () => {
  it("default config: every couple draws exactly one kid", () => {
    const s = readyCheck(defaultConfig(), null);
    expect(s).toMatchObject({ adultCount: 10, kidCount: 5, giverCount: 5, ok: true, level: "ok" });
    expect(s.message).toBe("Every couple draws exactly one kid.");
  });

  it("6/5 says one couple takes two", () => {
    const config = defaultConfig();
    config.households[1].kids.find((k) => k.id === "river")!.optedOut = false;
    expect(readyCheck(config, null).message).toBe("6 kids and 5 couples, so 1 couple takes two kids. Picked at random.");
  });

  it("4/5 says one couple sits out", () => {
    const config = defaultConfig();
    config.households[3].kids.find((k) => k.id === "parker")!.optedOut = true;
    expect(readyCheck(config, null).message).toBe("4 kids and 5 couples, so 1 couple sits out the kid draw. Picked at random.");
  });
});

describe("fixed matches", () => {
  const pinned = (adults: Record<string, string>, kids: Record<string, string> = {}): Config => ({
    ...defaultConfig(),
    pins: { adults, kids },
  });

  it("always gives Elena Sean, and AJ & Elena Ellie; everything else stays valid", () => {
    const config = pinned({ elena: "sean" }, { "aj-elena": "ellie" });
    const hh = householdOf(config);
    const seenForAj = new Set<string>();
    for (let r = 0; r < RUNS; r++) {
      const rows = runDraw(config, null);
      const by = new Map(rows.map((row) => [row.giverId, row]));
      expect(by.get("elena")!.adultRecipientId).toBe("sean");
      expect(by.get("elena")!.kidRecipientIds).toEqual(["ellie"]);
      expect(by.get("aj")!.kidRecipientIds).toEqual(["ellie"]);
      seenForAj.add(by.get("aj")!.adultRecipientId);
      const recipients = rows.map((row) => row.adultRecipientId);
      expect(new Set(recipients).size).toBe(10);
      expect(recipients.filter((x) => x === "sean")).toHaveLength(1);
      for (const row of rows) {
        expect(hh.get(row.adultRecipientId)).not.toBe(hh.get(row.giverId));
        if (row.giverId !== "elena" && row.giverId !== "aj") expect(row.kidRecipientIds).not.toContain("ellie");
      }
    }
    // The rest is still random.
    expect(seenForAj.size).toBeGreaterThan(3);
  });

  it("a pin overrides no-repeat", () => {
    const history: Assignment[] = [{ giverId: "elena", adultRecipientId: "sean", kidRecipientIds: ["ellie"] }];
    const rows = runDraw(pinned({ elena: "sean" }, { "aj-elena": "ellie" }), history);
    const elena = rows.find((r) => r.giverId === "elena")!;
    expect(elena.adultRecipientId).toBe("sean");
    expect(elena.kidRecipientIds).toEqual(["ellie"]);
  });

  it("works when kids outnumber couples", () => {
    const config = pinned({}, { "seth-elizabeth": "river" });
    config.households[1].kids.find((k) => k.id === "river")!.optedOut = false;
    for (let r = 0; r < 300; r++) {
      const m = drawKids(config, null);
      expect(m.get("seth-elizabeth")).toContain("river");
      expect([...m.values()].map((k) => k.length).sort()).toEqual([1, 1, 1, 1, 2]);
    }
  });

  it("rejects pins that break the spouse or own-kids rule, with a named error", () => {
    expect(() => drawAdults(pinned({ elena: "aj" }), null)).toThrow(/Elena can't give to AJ/);
    expect(() => drawKids(pinned({}, { "aj-elena": "mae" }), null)).toThrow(/AJ & Elena can't cover their own kid, Mae/);
  });

  it("rejects two people pinned to the same recipient", () => {
    expect(() => drawAdults(pinned({ elena: "sean", seth: "sean" }), null)).toThrow(/Elena and Seth are both set to give to Sean/);
    expect(() => drawKids(pinned({}, { "aj-elena": "ellie", "seth-elizabeth": "ellie" }), null)).toThrow(/both set to cover Ellie/);
  });

  it("rejects pinning a kid who's sitting out, or a household that sits out", () => {
    expect(() => drawKids(pinned({}, { "seth-elizabeth": "river" }), null)).toThrow(/River is sitting out/);
    const config = pinned({}, { "sean-lauren": "ellie" });
    config.rules.grandparentsSkipKids = true;
    expect(() => drawKids(config, null)).toThrow(/Sean & Lauren is sitting out the kid draw/);
  });

  it("ready check reports a pin conflict instead of throwing", () => {
    const s = readyCheck(pinned({ elena: "sean", seth: "sean" }), null);
    expect(s.level).toBe("error");
    expect(s.message).toMatch(/both set to give to Sean/);
  });

  it("ignores stale pins for people who were removed", () => {
    expect(() => runDraw(pinned({ ghost: "sean", elena: "nobody" }, { gone: "ellie" }), null)).not.toThrow();
  });
});
