// All randomness goes through crypto.getRandomValues. Never Math.random.

export type Rng = (n: number) => number;

/** Uniform integer in [0, n), using rejection sampling to avoid modulo bias. */
export function randomInt(n: number): number {
  if (!Number.isInteger(n) || n <= 0) throw new Error(`randomInt: bad bound ${n}`);
  const limit = Math.floor(0x100000000 / n) * n;
  const buf = new Uint32Array(1);
  for (;;) {
    globalThis.crypto.getRandomValues(buf);
    if (buf[0] < limit) return buf[0] % n;
  }
}

/** Fisher-Yates shuffle, returning a new array. */
export function shuffle<T>(items: readonly T[], rng: Rng = randomInt): T[] {
  const a = items.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = rng(i + 1);
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

const BASE32 = "abcdefghijklmnopqrstuvwxyz234567";

/** Random lowercase base32 string (5 bits per char). */
export function randomBase32(length: number, rng: Rng = randomInt): string {
  let out = "";
  for (let i = 0; i < length; i++) out += BASE32[rng(32)];
  return out;
}

/** `{firstname}-{10 base32 chars}`, e.g. `elena-q7mx4rk2vd`. About 50 bits of randomness. */
export function makeToken(name: string, rng: Rng = randomInt): string {
  const first = name.trim().split(/\s+/)[0] ?? "";
  const slug =
    first
      .normalize("NFKD")
      .replace(/[̀-ͯ]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9]/g, "") || "guest";
  return `${slug}-${randomBase32(10, rng)}`;
}

/** Short random id for wishlist items, new people, etc. */
export function randomId(prefix = ""): string {
  return prefix + randomBase32(8);
}
