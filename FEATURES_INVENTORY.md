# TrendsMart — Live Feature Status (Sep 2026)

> **Source of truth:** live codebase + `.cursorrules` + `FEATURES.md`.  
> This file replaces the outdated April inventory (which wrongly said cart/admin/stories/image upload were missing).

---

## Business rules (intentional)

| Topic | Current decision |
|---|---|
| **Order payment** | Customer ↔ merchant (COD / WhatsApp). App does **not** take order payments. JazzCash/billing is for **platform ads/tokens only**, not checkout. |
| **Merchant approval** | Soft-launch: shops go **live + approved** on create. Strict admin queue = later. |
| **Auth** | Email + OTP. Phone SMS OTP at checkout = later (budget). Guests browse freely. |
| **Stock** | In Stock / Out of Stock only (no numeric counts). |

---

## What works today

- Guest browse, search, categories, stories (DB CRUD), deals, ads, ratings
- Cart (localStorage + signed-in DB sync), wishlist hybrid sync
- WhatsApp checkout + server order create (coverage, fees, coupons, stock)
- Merchant dashboard (products, bulk add, orders, settings, QR, ads, …)
- Super-admin UI (merchants, categories, ads, support, audit)
- Email signup / sign-in / OTP / verify gate (session only after verified email)
- Geo: Near me / city / Pakistan filters; server reverse-geocode on city delivery
- PWA, theme engine, AI assistant, support + legal pages

---

## Soft-launch / later

| Item | Status |
|---|---|
| SMS phone OTP at checkout | Later — email verification is enough for now |
| Strict merchant approval queue | Later — auto-approve kept for fast onboarding |
| Cloudinary WebP compression | Goal; currently Supabase Storage |
| Native app wrapper | PWA for now |
| Order payment gateway | Not planned — WhatsApp/COD by design |

---

## Recent hardening (Sep 2026)

1. City/radius delivery: server reverse-geocode + reject `0,0` / coarse GPS
2. Radius browse: no silent “show all shops” without a pin
3. Pickup WhatsApp: no fake Maps pin; optional customer approx location
4. WhatsApp hand-off: merchant confirms “WhatsApp mil gaya” before pack
5. Login lockout + auth rate limits: Redis when Upstash env is set
6. Cart: DB sync for signed-in users; floating dock/badge is session-only
7. Bulk product: per-row In stock / Out of stock
8. Production: OTP_HMAC_SECRET required; Turnstile half-config fails closed

---

## Ops checklist

1. Run new SQL: `supabase/migrations/20260910010000_customer_carts.sql`
2. Set `OTP_HMAC_SECRET` in production
3. Optional: `UPSTASH_REDIS_REST_URL` + `UPSTASH_REDIS_REST_TOKEN` for distributed lockout/limits
4. Optional: both Turnstile site + secret keys together (or leave both unset in soft launch)
