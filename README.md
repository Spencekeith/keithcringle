# Family Christmas Draw

A private, blind gift-draw site for one family. The admin sets up households and rules, clicks **Draw names** once, and gets one private link per adult. Each link shows only that person's match. Nobody, including the admin, sees the full list unless they **break the seal**, and if they do, every private page says so.

Built with Next.js 16 (App Router), TypeScript, Tailwind and Upstash Redis, for Vercel.

## Pages

| Path | What it is |
|---|---|
| `/admin` | Set up: households, kids in or out, details, rules, ready check, **Draw names** |
| `/admin/links` | After the draw: one private link per adult, opened status, copy link / copy message, break the seal, redraw |
| `/r/[token]` | The private gift tag. Shows who you're buying for, their wishlist, your household's kid (with the parents' notes), your own wishlist, and notes for your own kids |

## Deploy

1. Import this repo into Vercel.
2. In the Vercel project → **Storage** → add **Upstash Redis** from the Marketplace and connect it. That sets `KV_REST_API_URL` and `KV_REST_API_TOKEN`.
3. Add env vars: `ADMIN_PASSWORD`, and `SESSION_SECRET` (a long random string, e.g. `openssl rand -hex 32`).
4. Deploy, open `/admin`, check the config, then **Draw names**.
5. Text each person their own link, one at a time. Never in a group thread: anyone who sees a link can open it.

Optional: `DRAW_YEAR` overrides the year (defaults to the current year). No-repeat checks the previous year's draw, which the app saves automatically. For the first year, enter last year's matches by hand under **Last year's matches** on `/admin`.

## Run locally

```bash
npm install
vercel env pull .env.development.local   # or write .env.local with ADMIN_PASSWORD and SESSION_SECRET
npm run dev
```

Without Redis env vars, local dev falls back to an in-memory store (data is lost on restart). On Vercel it refuses to run without Redis.

## Tests

```bash
npm test
```

Vitest covers the draw logic (1,000-run checks for self/spouse, no-repeat, own kids, 5/5, 6/5 and 4/5 kid splits, named errors for impossible configs) and the API's core promise: the draw and links endpoints never return recipients while the seal is intact.

## How it works

- **Randomness** comes only from `crypto.getRandomValues` (unbiased `randomInt`, Fisher-Yates shuffle).
- **Adult draw:** shuffle and reject up to 10,000 times, which is uniform over valid draws. If that fails, randomized backtracking either finds a draw or proves none exists, and the error names the rule responsible.
- **Kid draw:** every giving household gets ⌊kids/couples⌋ or ⌈kids/couples⌉ kids, so nobody gets three before everyone has two, and when there are fewer kids than couples, random couples sit out.
- **Redis keys** follow the spec: `config:{year}`, `draw:{year}:meta|sealed|tokens`, `link:{token}`, `wishlist:{year}:{personId}`, `kidnotes:{year}:{kidId}`, `history:{year}`.
- **Admin auth:** an HMAC-signed, httpOnly, SameSite=Lax cookie (Secure in production). `proxy.ts` guards `/admin/*` and `/api/admin/*`, and every admin route checks again.
- **Privacy:** private pages send `Cache-Control: no-store`, `Referrer-Policy: no-referrer` and `noindex`, and metadata is generic so link previews never show a name. Links are marked opened on the first tap of **Open your tag**, not on page load, so preview bots don't count.
- Households and rules lock after the draw; the date and budgets stay editable.
