// Admin session: an HMAC-signed expiry, stored in an httpOnly cookie.
// Uses Web Crypto so it works in both the proxy and route handlers.

export const SESSION_COOKIE = "fd_admin";
export const SESSION_MAX_AGE = 60 * 60 * 24 * 30; // 30 days

const enc = new TextEncoder();

function getSecret(): string {
  const s = process.env.SESSION_SECRET;
  if (s && s.length >= 16) return s;
  if (process.env.NODE_ENV !== "production") return "dev-only-session-secret-change-me";
  throw new Error("SESSION_SECRET is missing or shorter than 16 characters.");
}

async function hmacKey(secret: string) {
  return crypto.subtle.importKey("raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, [
    "sign",
    "verify",
  ]);
}

function toB64Url(buf: ArrayBuffer): string {
  let s = "";
  for (const b of new Uint8Array(buf)) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function fromB64Url(s: string): Uint8Array<ArrayBuffer> | null {
  try {
    const bin = atob(s.replace(/-/g, "+").replace(/_/g, "/"));
    const out = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
  } catch {
    return null;
  }
}

export async function createSession(now = Date.now()): Promise<string> {
  const exp = Math.floor(now / 1000) + SESSION_MAX_AGE;
  const sig = await crypto.subtle.sign("HMAC", await hmacKey(getSecret()), enc.encode(`admin.${exp}`));
  return `${exp}.${toB64Url(sig)}`;
}

export async function verifySession(value: string | undefined | null, now = Date.now()): Promise<boolean> {
  if (!value) return false;
  const [expStr, sigStr] = value.split(".");
  const exp = Number(expStr);
  if (!Number.isInteger(exp) || exp * 1000 < now || !sigStr) return false;
  const sig = fromB64Url(sigStr);
  if (!sig) return false;
  try {
    return await crypto.subtle.verify("HMAC", await hmacKey(getSecret()), sig, enc.encode(`admin.${exp}`));
  } catch {
    return false;
  }
}

/** Constant-time password check (compares HMACs of both values). */
export async function checkPassword(input: string): Promise<boolean> {
  const expected = process.env.ADMIN_PASSWORD;
  if (!expected) return false;
  const key = await hmacKey(getSecret());
  const a = new Uint8Array(await crypto.subtle.sign("HMAC", key, enc.encode(input)));
  const b = new Uint8Array(await crypto.subtle.sign("HMAC", key, enc.encode(expected)));
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i];
  return diff === 0;
}

export function sessionCookieOptions() {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax" as const,
    path: "/",
    maxAge: SESSION_MAX_AGE,
  };
}
