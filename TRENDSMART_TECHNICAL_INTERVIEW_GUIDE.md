# TrendsMart — Technical Architecture & Interview Guide

> Yeh file technical hai — stack, architecture, design decisions, aur har major concept (kya, kahan, kaise, kyun) ki explanation. Interview ki tayari ke liye perfect. Har section ke end mein "Agar pooche" wale jawab hain jo aap khud ke words mein bata sakte hain.

---

## 1. Tech Stack (Kya-Kya Use Hua aur Kyun)

| Technology | Kahan use hua | Kyun use kiya |
|---|---|---|
| **Next.js 16 (App Router, Turbopack)** | Poora frontend + backend (API routes) | SSR/SSG + server actions + file-based routing, SEO, full-stack ek hi framework |
| **React 19** | UI components | Ek hi codebase me guest/customer/merchant/admin UI |
| **TypeScript 5** | Poora code | Type safety — order flow, roles, database shapes |
| **Supabase (Postgres + Auth + Realtime + Storage)** | Database, authentication, realtime updates, image storage | Open-source Firebase alternative; RLS built-in; SQL full control |
| **TanStack React Query** | Server state (shops, products, orders, deals...) | Caching, refetch, invalidation, infinite scroll |
| **Zustand + persist** | Cart store (`store/cartStore.ts`) | Lightweight client state with localStorage persistence |
| **React Context** | Location, Theme, Reviews, MerchantQuickAdd | Cross-component shared UI state |
| **Zod** | Form/API validation | Runtime validation of inputs |
| **Framer Motion** | Animations (modals, stories, carousels) | Smooth UX |
| **Leaflet** | Map pickers (location, radius, delivery area) | Free interactive maps |
| **Recharts** | Analytics charts | SVG charts for dashboards |
| **jsPDF + qrcode** | Invoices/PDFs, shop & table QR codes | Print-ready output without backend |
| **BlurHash** | Image placeholders | Faster perceived load |
| **Resend** | Branded transactional emails (OTP, approvals) | Custom-domain email without SMTP server |
| **web-push (VAPID)** | Browser push notifications | Native notifications |
| **Cloudinary** (optional) | Image upload/delete, WebP conversion | Compression + free tier; falls back to Supabase Storage |
| **Sentry** (optional) | Error monitoring config | Release tracking (full SDK not wired) |
| **Upstash/Redis** (optional) | Distributed rate limiting | In-memory fallback available |
| **Jest + Testing Library** | Unit/component tests | Cart, guards, sanitization, phone format tests |

**Deployment:** Vercel (`trendsmart.pk`), GitHub Actions CI/CD.

---

## 2. Architecture Overview (Poora System Kaise Bana Hai)

```
┌─────────────────────────────────────────────────────┐
│                 Next.js App (Vercel)                 │
│  App Router Pages (client components)                │
│  ├─ Middleware: auth gate, role redirects, security  │
│  ├─ API Routes: /api/orders, /api/auth/*, /api/push  │
│  ├─ Server Components / RSC                            │
│  └─ PWA (manifest + service worker)                  │
├───────────────┬─────────────────────────────────────┤
│  State layers  │                                     │
│  React Query   │  Context (Location/Theme)           │
│  Zustand cart  │  localStorage (clientScope-namespaced)│
└───────────────┴─────────────────────────────────────┘
                    │ HTTPS
┌───────────────────▼─────────────────────────────────┐
│                    Supabase                          │
│  Postgres DB (~40 tables) + RLS policies             │
│  Auth (custom email-OTP flow)                        │
│  Realtime (orders, products, notifications...)       │
│  Storage bucket: trendsmart-media                     │
│  Security DEFINER RPCs (get_my_role, is_admin...)    │
└─────────────────────────────────────────────────────┘
   Integrations: Resend(EMAIL) · Cloudinary · WebPush(VAPID)
                 Nominatim(geo) · Redis(rate limit)
```

**Key architectural decisions:**
- **Single trusted order endpoint**: Sirf `POST /api/orders` server par order bana sakta hai. Client kabhi total khud nahi bhejta — server products table se authoritative prices nikalta hai. (Client-side tampering impossible.)
- **WhatsApp-first, no payment gateway**: Order DB me save hota hai + WhatsApp par jata hai. Payment offline.
- **Client-side cart**: localStorage (Zustand persist), account-scoped. No `carts` table in DB.
- **JSONB order items**: Order ke line items `orders.items_json` me JSONB array hain — no `order_items` table (fast, flexible).
- **Server-authoritative geo checks**: Radius/city/coverage server par bhi enforce hota hai (409 reject), client sirf UX ke liye.

---

## 3. Auth System (Email-OTP Flow)

**Flow:** `signup` → POST `/api/auth/signup` → admin API `auth.admin.createUser({ email_confirm: false })` (user **unconfirmed**) → `issueAndSendOtp()` (6-digit code) → email via Resend → `POST /api/auth/verify-otp` → constant-time verify → `email_confirm: true` → provision `user_roles` + `user_profiles` → login.

**Security features:**
- OTP stored as **HMAC-SHA256 hash** (keyed by `SUPABASE_SERVICE_ROLE_KEY`, bound to email), not plaintext.
- **`timingSafeEqual`** constant-time comparison (timing attacks se bacha).
- 10-min TTL, max 5 attempts (har ghalat code par ek attempt burn hota hai), 30s resend cooldown.
- `email_verification_otps` table par **zero RLS policies** — sirf service-role access.
- Rate limiting per IP (AUTH: 10/min).

**Roles & RBAC:**
- `user_roles` table: `customer | merchant | admin`. Trigger `handle_new_user()` auto-provisions `customer`. Trigger `promote_to_merchant()` auto-promotes on first shop insert.
- **Trust model**: `app_metadata.role` trusted (sirf service-role set kar sakta hai). `user_metadata.role` sirf customer/merchant hint — **admin kabhi user-editable metadata se nahi milta**. Self-promotion to admin blocked in RLS.
- `get_my_role()` SECURITY DEFINER RPC + `is_admin()` helper avoid RLS recursion.

**Middleware enforcement:** per-path required role, email-verification gate, ban gate, role redirects (`_tm_rlc` loop-tracking cookie), `X-User-Role` header, fail-closed.

**Password reset:** `resetPasswordForEmail` + `verifyOtp({ type: "recovery" })` + update password.

**Agar pooche:**
> "Phone OTP kyun nahi? — Design mein phone verification aana tha, lekin codebase mein email OTP primary hai (Twilio envs placeholder hain). Phone sirf delivery contact field hai."

---

## 4. Database Design (~40 Tables)

**Core tables:**
- `user_roles` — RBAC
- `shops` — merchant store (owner_id, category, whatsapp_number, is_live, verification_status, latitude/longitude, service_radius_km, delivery_zones[], min_order_amount, free_delivery_threshold, delivery_fee_flat, delivery_fee_per_km, business_hours, operating_status, announcement, shop_type, subscription_tier, accepts_delivery/pickup, sensitive_info_updated_at)
- `products` — price, compare_at_price (markdown), images jsonb, is_available, stock_status, variants jsonb, price_tiers jsonb, short_code (8-char unique), category_id, sub_category_id, deal_expires_at, orders_count, click_count
- `sub_categories` — taxonomy (category + name + slug + icon + is_active), mandatory "Others"
- `orders` — customer info, items_json (JSONB line items), subtotal/discount/delivery_fee/total_amount, status, order_type (delivery/pickup/dine_in), table_id, client_token (idempotency)
- `reviews` — rating 1-5, merchant_reply, visitor_ip_hash, verified_purchase
- `shop_deals` — schedule_type (weekly/date_range/monthly), badge_text, is_featured, product_id, price/original_price
- `coupons` — code, percent XOR amount (check constraint), min_order, usage_limit/count
- `promotional_ads` + `ad_plans` — sponsored ads + pricing plans
- `dine_in_tables` — QR token, is_active
- `stories`, `wishlists` (`customer_wishlists`, `favorite_stores`), `notifications`, `push_subscriptions`, `leads`, `customer_inquiries`, `support_tickets`, `legal_acceptances`, `analytics_logs`, `sales_events`, `finance_entries`, `daily_revenue_snapshots`, `merchant_subscriptions`, `billing_invoices`, `admin_audit_logs`, `security_audit_log`, `email_verification_otps`, `user_profiles`, `customer_addresses`, `service_packages/portfolio/availability`

**Design choices worth mentioning:**
- **No `categories` table** — categories hardcoded in `types/index.ts` (`SHOP_CATEGORIES`). Simple, fast.
- **No `cart` table** — client-side localStorage.
- **No `order_items` table** — JSONB `items_json`.
- **No `price_tiers` table** — JSONB column on products.
- **No `offers` table** — offers = deals + coupons + compare_at_price + announcement.

**RLS patterns:**
- Public read (anon): `shops`/`products` sirf jab `is_live = true AND verification_status = 'approved'` (merchant verification queue migration se tighten).
- Merchant-owned (FOR ALL via `is_shop_owner`): products, orders, coupons, deals, ads, tables, inquiries...
- User-owned (`auth.uid()`): profiles, wishlists, notifications, tickets...
- Public insert only (anon): orders, leads, inquiries, support tickets, analytics_logs.
- Admin-only: user_roles, audit logs, subscriptions, ad_plans.
- Service-role only: email_verification_otps.

**Safety triggers:** `prevent_mass_delete()` (max 50 rows), `set_updated_at()` (~17 tables), order status transition enforcement (Pending→Processing→Dispatched→Delivered/Cancelled, terminal locked), stock deduction, popularity counters.

---

## 5. Order Pipeline (Sabse Important — Technical)

**`POST /api/orders`** (Node runtime, service-role client):

1. **Auth**: signed-in user + `email_confirmed_at` required (401).
2. **Shape validation**: UUID shopId, name >= 2 chars, phone >= 10 digits, items non-empty.
3. **Shop gate**: is_live, verification approved, fulfillment channel enabled, not closed (`getShopHoursSummary`).
4. **Authoritative pricing**: har line item product table se re-read — price, compare_at_price, is_available, variants, price_tiers, deals, service_packages. Variant-aware pricing via `computeVariantPricing`.
5. **Subtotal**: tier-aware (`priceForQuantity` — pack mode).
6. **Coverage enforcement**: `parseCoverage` (radius / `__pk_city__:<city>` / `__pk_nationwide__`) + Haversine distance; delivery par bahar ho to 409. Pickup skip.
7. **Coupon**: server-side re-validation (expiry, min order, usage limit).
8. **Min order**: pre-discount subtotal check.
9. **Delivery fee**: `computeDeliveryFee` (client se identical shared helper — consistency).
10. **Idempotency**: `client_token` pehle se order bana chuka ho to existing order return karo (double-tap protection).
11. **Atomic coupon redemption**: RPC `increment_coupon_usage` (TOCTOU-safe, race condition prevention).
12. **Soft stock deduction**: RPC `deduct_product_variant_stock`; stock khatam ho to product `is_available=false` ho jata hai par order proceed hota hai (WhatsApp-first philosophy — merchant baat kar leta hai).
13. **Insert order** with full money breakdown + `client_token` + status `Pending`.
14. **Push notifications**: merchant (sale) + customer (confirmation), best-effort.

**Status flow:** `Pending → Processing → Dispatched → Delivered` (or Cancelled). DB trigger enforces valid transitions. Realtime broadcast + web push + in-app notification.

**Tracking:**
- `/api/orders/track` — strict ownership: sirf `customer_user_id === auth.uid()`, shop owner, ya admin. Anonymous = zero rows.
- `get_public_order_summary` RPC — public single-link page `/o/[id]`, **no customer PII**.

**Dine-in pipeline** (`/api/dinein/orders`): no sign-in required; table token = possession proof; 15s per-table cooldown (staff exempt); idempotency via client_token; 4-step dine status (Pending→Preparing→Ready→Served).

**Agar pooche:**
> "Double-click se duplicate order? — `client_token` unique constraint. Same token ka dusra request existing order return karta hai."

---

## 6. Geo-Location System

- `LocationContext` + `geoRadiusService` — GPS detect, manual pin, city/area selection, reverse geocoding via **Nominatim OSM** + city-centroid fallback (~25 PK cities, `CITY_CENTROIDS`).
- GPS location **30 min expiry**; manual/cached kabhi expire nahi.
- `filterShopsByProximity`: Har shop par `distance_km` (Haversine) + `within_radius`.
  - **Radius scope**: hard km cut (5/10/15 km); `maxDistanceKm=0` = "Any" = sort-only.
  - **City scope**: shop location/zones/city match, <= 40km metro slack.
  - **Pakistan**: sab kuch.
  - **Area match**: textual match of chosen colony (pin-less shops visible).
- `isCustomerWithinCoverage` — checkout gate ki single source of truth (client + server dono).
- Shop coverage modes: radius (1-500km), city (`__pk_city__:<City>`), nationwide (`__pk_nationwide__` = 500km).

---

## 7. Search & Ranking (Fuzzy + For You)

**Fuzzy search** (`lib/fuzzySearch.ts`):
- Query expansion: original + words + **Roman-Urdu synonyms** (zinger→burger, aata→atta, cheeni→sugar) + phonetic/typo variants.
- Scoring: exact (100) > prefix > contains > synonym > Levenshtein edit distance (min score 28).
- `buildFuzzyIlikeOr` → PostgREST `.or()` ILIKE clauses for server-side filtering.

**Popularity** (`lib/marketplaceDiversity.ts`):
- `scoreProductPopularity = log(orders_count)*0.4 + log(click_count)*0.3 + (avg_rating/5)*0.2 + log(review_count)*0.1`
- `blendSearchScore = relevance*0.62 + popularity*0.38`
- **Fairness**: `diversifyMarketplaceFeed` — round-robin shop turns, early cap (max 3/shop in For You) so ek discount-heavy shop feed ko flood na kare.
- **Category affinity** (`lib/behavior.ts`): view=1, click=2, search=2, wishlist=3, order=5 weights → homepage category pills reorder + Recently Viewed strip. Sab localStorage, no PII.

---

## 8. Discount Engine (4 Layers)

1. **Direct markdown**: `products.compare_at_price` (+ `deal_expires_at`). `getProductDiscount()` single source of truth → strikethrough + "-N% OFF" badge.
2. **Deals**: `shop_deals` with weekly/date_range/monthly schedules; `isDealOrderableToday()`; orderable as cart items (server resolves from deals table).
3. **Coupons**: percent XOR amount, min_order, usage_limit; client debounced validation + **server re-validation + atomic RPC redemption**.
4. **Variant pricing**: `lib/variantPricing.ts` — per-option absolute price or `price_adj` (add-on), `discount_pct` shortcut, `computeVariantPricing` server-side.

**Price tiers**: pack mode (DP combination — packs sirf tab use hote hain jab saste hon) vs unit mode.

---

## 9. Real-time & Notifications

- **Supabase Realtime** channels: orders, products, inventory, notifications, support tickets, analytics_logs. (REPLICA IDENTITY FULL on notifications for row-level events.)
- **DB triggers** create notifications: order INSERT → merchant sale + buyer confirmation; status change → buyer; ticket INSERT → admins; inquiry → shop owner.
- **Web Push**: VAPID keys, `sendPushToUser` (per-send 10s timeout, auto-prunes 404/410 endpoints), `public/sw.js` handles push + notificationclick.
- **In-app bell**: `NotificationListener` — DB hydrate + realtime subscribe + dedupe + cap 50 + toast/chime + per-account localStorage cache.
- **Realtime status flow**: `transitionOrderStatus` → CustomEvent + callback subscribers + Realtime + web push.

---

## 10. Security (Interview me Impressive Baatein)

- **RLS everywhere** — zero-policy table (OTP) service-role only.
- **Rate limiting**: in-memory token bucket + optional Redis/Upstash (atomic Lua sliding window). Middleware global gate + per-API configs.
- **Sanitization**: HTML sanitize (DOMPurify), SQL/ILIKE literal escaping, CSV formula injection protection, path traversal, phone/URL allowlists, `isValidUUID`.
- **CSP + security headers**: nonce-based CSP, HSTS, X-Frame-Options DENY, COEP/COOP/CORP, Permissions-Policy, header stripping.
- **Secret scanning** in CI + build-time env audit (prod build fail hota hai agar secret NEXT_PUBLIC_ me leak ho).
- **Client data isolation**: `clientScope` — har localStorage key per-account namespaced (`key:guest` / `key:u_<id>`), guest→user bucket migration.
- **Admin gating**: `requireAdminUser()` — get_my_role RPC + app_metadata.role, user-editable metadata deliberately ignored.
- **Sentry** config + `errorService` structured logging (50-entry ring buffer).

---

## 11. PWA & Performance

- `manifest.ts` (standalone, teal theme, 192/512 icons), `sw.js` (v42, push + notificationclick, **no fetch interception** — Next.js navigations na tootein).
- `beforeinstallprompt` captured (native prompt), iOS fallback instructions.
- Images: AVIF/WebP, quality tiers, aggressive caching, blurhash placeholders.
- Webpack chunking (Supabase, framer-motion, jsPDF separate cache groups), deterministic IDs, `optimizePackageImports`.
- Route-level Cache-Control: CDN stale-while-revalidate for public pages; no-store for `/api/`, `/admin/`, `/dashboard/`.

---

## 12. Integrations Summary (Kahan-Kya-Kyun)

| Integration | Files | Note |
|---|---|---|
| Supabase Auth + DB + Realtime + Storage | `lib/supabase/{client,server,admin,middleware,realtime}.ts`, `middleware.ts` | 3 client tiers: anon/RLS, cookie-server, service-role admin |
| Cloudinary | `lib/cloudinary.ts`, `/api/cloudinary/delete` | unsigned upload + signed delete; ownership check (merchant sirf apni assets delete kar sakta hai) |
| Resend | `lib/email.ts` | OTP, approvals, support emails; no-op without key |
| web-push | `lib/webPush.ts`, `pushClient.ts`, `/api/push/*` | VAPID |
| Redis/Upstash | `lib/rateLimiterRedis.ts` | distributed rate limit, in-memory fallback |
| Nominatim + Google Places | `geoRadiusService`, `/api/places/search` | reverse/forward geocoding |
| jsPDF + qrcode | invoiceService, tables page | PDF bills, QR codes |
| recharts | analytics | charts |

---

## 13. Deployment & CI/CD

- **Vercel** — production `https://trendsmart.pk`.
- **GitHub Actions** (`.github/workflows/deploy.yml`):
  1. `quality-gate`: tsc --noEmit, eslint, depcheck.
  2. `build`: `next build --turbopack`.
  3. `deploy`: Vercel action (main/master; no-op bina VERCEL_TOKEN — GitHub App auto-deploys).
  4. `sentry-release`: sourcemap upload (agar SENTRY_AUTH_TOKEN ho).
- **security-scan.yml**: npm audit, secret scanner, ESLint SAST, CodeQL (weekly), tsc.
- **Env**: `.env.example` me documented (Supabase URL/keys, VAPID, Cloudinary, Resend, Sentry, Upstash, Twilio placeholders).

---

## 14. Design Decisions & Trade-offs (Interview Gold)

| Decision | Trade-off |
|---|---|
| **WhatsApp-first ordering** | Zero payment infra, instant adoption; lekin order fulfilment manual hai, revenue tracking manul |
| **Client-side cart (localStorage)** | Fast, guest-friendly, zero DB load; lekin cross-device sync nahi |
| **JSONB order items** | Flexible, fast inserts; lekin relational queries/analytics harder |
| **Auto-approve merchants** | Instant onboarding, viral growth; lekin platform quality control kam — strict queue schema-ready hai (pending/approved/rejected) |
| **Email OTP only** | Free, spam-hard; lekin phone-verified identity nahi |
| **Hardcoded categories** | Simple, fast; lekin admin dynamic categories limited (sub-categories DB me hain) |
| **Single order API** | Server-authoritative, tamper-proof totals; lekin ek endpoint = bottleneck (fine for scale) |
| **Soft stock deduction** | Order kabhi block nahi hota (WhatsApp-first); lekin over-selling ho sakti hai (merchant resolves) |
| **Public order link (no PII)** | Customer privacy + WhatsApp link bhejna easy; lekin us link se order modify nahi hota |

---

## 15. Interview Q&A (Ready Jawab)

**Q: "Tell me about this project."**
> "TrendsMart ek hyper-local multi-vendor marketplace hai. Next.js 16 + Supabase par bana hai. Customers local shops browse karte hain aur WhatsApp ke zariye order karte hain. Main architecture: guest browsing bina login, email-OTP authentication, role-based dashboards (customer/merchant/admin), geo-radius filtering, fuzzy Urdu-aware search, multi-layer discount system (markdown, deals, coupons, variants), merchant dashboard with products/deals/orders/dine-in/analytics/ads, aur PWA + realtime notifications."

**Q: "Why Next.js?"**
> "App Router, React Server Components, built-in API routes, image optimization, SEO (robots/sitemap/metadata), aur PWA-ready. Full-stack ek hi codebase — 3 alag roles ke dashboards shared components se."

**Q: "How do you prevent clients from manipulating order totals?"**
> "Order placement sirf server-side `POST /api/orders` se hota hai. Client price nahi bhejta — server products table se authoritative prices, variants, tiers, deals read karta hai. Delivery fee same shared helper se compute hoti hai, coupons server par re-validate hote hain, geo coverage server par enforce hoti hai (409 reject)."

**Q: "How does RLS (Row Level Security) work?"**
> "Postgres par har query ke liye policy check hoti hai. Jaise `shops_public_read` policy: `is_live = true AND verification_status = 'approved'` ya owner. Merchant FOR ALL policy: `is_shop_owner(shop_id)` — helper `shops.owner_id = auth.uid()`. Admin policies `is_admin()` SECURITY DEFINER function check karti hai. Sab user input se bacha hai kyunki access DB level par hai, na sirf app level par."

**Q: "How do you handle duplicate order submission (double-click)?"**
> "Client ek `client_token` (idempotency key) bhejta hai. Orders table par unique constraint hai. Agar same token ka order pehle se exist karta hai, existing order return hota hai instead of duplicate insert."

**Q: "How does the WhatsApp order flow work technically?"**
> "Checkout modal cart compile karti hai → `createOrder()` POST /api/orders (server validates sab) → success par localStorage history save → `buildWhatsAppMessage()` ek formatted text banati hai → `window.open('https://wa.me/<shop_number>?text=...')`. Shop number DB se aata hai, sanitized. Order link `/o/[id]` public summary page par jata hai — customer PII ke baghair."

**Q: "How is search Urdu/fuzzy?"**
> "`lib/fuzzySearch.ts` query ko expand karta hai — synonyms (zinger→burger), phonetic variants, typo collapse. Scoring: exact > prefix > contains > synonym > Levenshtein edit distance. Server-side ILIKE filters + client-side ranking blend (relevance 0.62 + popularity 0.38)."

**Q: "How does 'For You' ranking avoid one-shop domination?"**
> "`diversifyMarketplaceFeed` round-robin shop turns aur early per-shop cap (max 3 items For You lane me) — fairness. Popularity score log-scales orders/clicks/rating/reviews. Discount signal sqrt-capped."

**Q: "How does realtime work?"**
> "Supabase Realtime subscriptions (Postgres WAL-based) on orders/products/notifications tables. DB triggers notifications banate hain. Web Push VAPID ke zariye bheja jata hai. Customer tracking page par order status live update hota hai."

**Q: "Biggest technical challenge?"**
> "Ek multi-role app (guest/customer/merchant/admin) me security aur data isolation — RLS + middleware role gates + clientScope (per-account localStorage namespacing) teeno layers par. Aur WhatsApp-first order pipeline ko tamper-proof banana — single server-authoritative API."

**Q: "What would you improve?"**
> "Phone OTP verification, server-side cart sync, payment gateway (JazzCash/COD), WhatsApp Business API auto-send, online maps tracking, server-side full-text search for scale, subscription UI wiring."

---

*Is file ko interview se pehle 2-3 baar parh len aur Section 15 ke jawab apne words mein rehearse kar len.*
