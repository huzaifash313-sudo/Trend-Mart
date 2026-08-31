# 🛒 TrendsMart — Complete Feature, Mechanism & Strategy Documentation

> **Platform:** Hyper-Local Multi-Vendor Marketplace + WhatsApp Ordering System
> **Goal:** Production-Ready E-Commerce Ecosystem (Pakistan-focused, PKR)
> **Built with:** Next.js 16 (App Router, Turbopack) · React 19 · TypeScript · Supabase (PostgreSQL, Auth, Realtime, Storage) · Tailwind CSS v4 · TanStack React Query · Zustand · Framer Motion · Resend (email) · Leaflet (maps) · Web Push · PWA
> **Core business decision:** WhatsApp-first checkout — the merchant is the human gatekeeper. Orders are confirmed in WhatsApp, not by a payment gateway. Isliye platform `$0` transaction cost par chalta hai (COD / WhatsApp).

---

## Table of Contents
1. [Platform Roles & Access Control](#1-platform-roles--access-control)
2. [Authentication & Verification](#2-authentication--verification)
3. [Storefront & Discovery (Customer Side)](#3-storefront--discovery)
4. [Search & "For You" Ranking Strategy](#4-search--for-you-ranking-strategy)
5. [Product Experience](#5-product-experience)
6. [Cart, Checkout & WhatsApp Order Flow](#6-cart-checkout--whatsapp-order-flow)
7. [Order Lifecycle & Live Tracking](#7-order-lifecycle--live-tracking)
8. [Merchant Dashboard Features](#8-merchant-dashboard-features)
9. [Merchant Store Controls (Radius, Slabs, Discounts, QR)](#9-merchant-store-controls)
10. [Deals, Coupons & Promotions](#10-deals-coupons--promotions)
11. [Super-Admin Panel](#11-super-admin-panel)
12. [Geo-Location & Delivery Radius System](#12-geo-location--delivery-radius-system)
13. [Reviews & Ratings](#13-reviews--ratings)
14. [AI Chat Assistant & Support Systems](#14-ai-chat-assistant--support-systems)
15. [Notifications (In-App Realtime + Web Push)](#15-notifications)
16. [PWA & Offline Support](#16-pwa--offline-support)
17. [Theme Engine & Appearance Customization](#17-theme-engine--appearance)
18. [SEO & Performance Engineering](#18-seo--performance-engineering)
19. [Security, RLS & Anti-Abuse](#19-security-rls--anti-abuse)
20. [Analytics, Finances & Audit](#20-analytics-finances--audit)
21. [Full Route/Page Inventory](#21-full-routepage-inventory)
22. [Database Schema Overview](#22-database-schema-overview)
23. [API Routes — Mechanism & Strategy](#23-api-routes--mechanism--strategy)
24. [Status: Done vs Pending](#24-status-done-vs-pending)

---

## 1. Platform Roles & Access Control

| Role | Capabilities |
|---|---|
| **Guest (Unauthenticated)** | Free browsing of all shops, categories, sub-categories & products. Full local cart + item selection. No sign-up needed until checkout. |
| **Customer** | Email/OTP auth, personal dashboard (profile, addresses, past orders, live tracking, wishlist, settings). |
| **Merchant** | "Register Store" onboarding (name, category, phone, logo, banner). Full dashboard for products, orders, analytics, deals, coupons, finances, ads, leads, QR code. |
| **Super-Admin** | Global platform control: merchant moderation, analytics, category management, ad moderation, support inbox, audit logs, live transaction feed. |

### ⚙️ Kese Kaam Karta Hai
1. **DB se role** — `user_roles` table mein ek row per user (`app_role` enum: customer/merchant/admin). Ye authoritative source hai.
2. **Signup trigger** — jab naya user auth hota hai, DB trigger `handle_new_user()` signup form ke selected role ko `raw_user_meta_data` se parh kar customer/merchant assign karta hai.
3. **Shop promotion** — jab user apni pehli shop banata hai, `promote_to_merchant()` trigger usse automatically merchant bana deta hai (kabhi admin ko overwrite nahi karta).
4. **Middleware enforcement** — Edge middleware har request par session refresh karta hai, `get_my_role()` RPC se role nikalta hai, aur route ke hisaab se allow/redirect karta hai (public → customer → merchant → admin hierarchy).
5. **Defense-in-depth** — Client-side guards bhi hain (dashboard pages, account page), taake agar koi bypass kare toh UI khud bhi rok de.

### 🎯 Strategy
- **Role kabhi user-editable metadata se nahi** — sirf `user_roles` table / `app_metadata.role` se. Iska matlab user apne request mein "role: admin" bhej kar escalation nahi kar sakta.
- **Guest-first funnel** — sign-up ke bina browsing + cart, taake conversion barrier zero ho. Order time par hi auth mandatory hota hai.
- **DB trigger promotion** — merchant banna code mein nahi, DB level par hota hai, isliye koi bhi client-side cheat promotion ko bypass nahi kar sakta.

---

## 2. Authentication & Verification

### Features
- Email signup/sign-in with role selection (Customer/Merchant), full name, Pakistani phone, password strength meter, live Zod validation.
- Mandatory Terms & Privacy acceptance (audited in `legal_acceptances`).
- 6-digit Email OTP modal (auto-focus, paste, auto-submit, 30s resend cooldown).
- Email verification gate → `/auth/verify-notice` for unverified users.
- Password reset (forgot-password → OTP → reset-password).
- OAuth/magic-link callback with open-redirect protection.
- Phone verification flag `phone_verified_at` (verified phone = no OTP re-prompt at checkout).
- Sensitive-info lock: store name/phone numbers changes need password + once per week.

### ⚙️ Kese Kaam Karta Hai
1. **Signup** → `signUpWithEmail` role + profile metadata ke sath, `recordLegalAcceptance` T&C save karta hai.
2. **OTP** → Supabase email OTP bhejta hai; user 6-digit code enter karta hai; verify hone par `claimSignupRole` role finalize karta hai.
3. **Gate** → middleware check karta hai `email_confirmed_at`; nahi to `/auth/verify-notice` par bhej deta hai.
4. **Password reset** → `requestPasswordReset` (email OTP) → `verifyRecoveryOtp` → `updatePasswordAfterRecovery`.
5. **Sensitive info** → `verifyPassword` se password confirm, phir `sensitive_info_updated_at` timestamp compare — 30 din ka lock.

### 🎯 Strategy
- **Phone SMS OTP intentionally removed** (SQL comment: *"Phone SMS OTP removed — email verify only"*) — WhatsApp-first soft launch mein SMS cost bachana (har OTP ~$0.05). Infrastructure `phone_verified_at` ready hai, baad mein SMS provider laga sakte hain.
- **Verification strict checkout par** — `.cursorrules` ke mutabiq "mandatory verification strictly at the time of order placement/checkout"; verify-gate middleware isi ko enforce karta hai.
- **Legal acceptance DB audit** — document + version + timestamp, taake compliance ka proof ho.

---

## 3. Storefront & Discovery

### Features
- Homepage: swipeable category pills (mobile), personalized category ordering (top-affinity from localStorage).
- Stories tray (24h auto-expiry, seen/unseen rings, owner quick-add).
- Hero slider + Promo Ads carousel (impression/click tracking).
- Featured Deals strip + Offer Days strip (next-14-day deal calendar).
- Recently Viewed strip (local behavior memory).
- Live Shops responsive grid (2-col mobile / 3 tablet / 4–5 desktop) with Live badges, distance chips, offer tickers, favorites.
- Cross-store product feed: 7 sort modes, infinite scroll (server cursor pagination), area radius filter.
- Merchants self-exclude from their own shop in public feeds.

### ⚙️ Kese Kaam Karta Hai
1. **Homepage data** — React Query hooks (`useShops`, `useStories`, `useDeals`, `useShopCoupons`) data fetch karte hain; `fuzzyFilterAndRank` client-side search, `filterShopsByProximity` geo-radius filtering.
2. **Personalization** — `getTopAffinityCategories` localStorage se user ki browsing history parh kar categories ko re-order karta hai.
3. **Cross-tab sync** — `trendsmart:stories-updated` / `deals-updated` window events caches invalidate karte hain, taake do tabs mein data stale na ho.
4. **Infinite scroll** — IntersectionObserver sentinel + server cursor pagination (48 per page), "Nearest" sort haversine distance se re-sort karta hai.

### 🎯 Strategy
- **"Zero scroll friction" for mobile** — horizontal category pills vertical scrolling kam karte hain (`.cursorrules` requirement).
- **Self-exclusion** — merchant apne storefront par apni hi shop nahi dekhta, taake unhe spam na lage aur testing realistic ho.
- **Realtime-friendly** — window-event invalidation + React Query 60s staleTime balance karta hai: baar-baar server hits nahi, phir bhi data fresh.

---

## 4. Search & "For You" Ranking Strategy

### ⚙️ Kese Kaam Karta Hai — Search (`lib/fuzzySearch.ts`)
1. **Query expansion** — user ka query `expandSearchQuery` se expand hota hai: original phrase → individual words → **Urdu-English synonyms** (e.g. `aloo`→`potato`, `murgh`→`chicken`, `pyaz`→`onion`) → phonetic variants.
2. **Scoring cascade** — har match score hota hai (0–100):
   - **Exact = 100** → **Prefix = ~86** → **Contains = ~72** → **Synonym match** → **Levenshtein edit-distance** (typo tolerance, e.g. "zingger" → "zinger").
   - Multi-word queries: jin titles mein **zyada words match** ho unhe upar rank karo (coverage boost).
3. **Filtering** — `fuzzyFilterAndRank` items ko score >= 28 par filter karta hai, phir score desc, tie par chhoti titles.
4. **Suggestions** — `suggestSearchCorrections` "Did you mean" style suggestions deta hai (synonym map + edit distance ≤ 2).
5. **Deal day search** — "monday deal", "14 august" jaise phrases bhi searchable hain (days/months synonyms map mein hain).

### ⚙️ Kese Kaam Karta Hai — "For You" fair-mix feed (`lib/marketplaceDiversity.ts`)
1. **3 signals** — har product ko `scoreForYouBalanced` milta hai:
   - **Deal signal** (√-capped: 90% OFF is NOT 2× better than 45%) — weight 0.45
   - **Freshness** (created_at normalized) — weight 0.28
   - **Popularity proxy** (log-scale clicks/orders, image bonus) — weight 0.2
2. **3 lanes** — deal lane / fresh lane / balanced lane; slot pattern `deal → fresh → balanced → deal → …`.
3. **Equal shop turns** — round-robin: har shop ko ek turn, `MAX_PER_SHOP_EARLY` soft cap (For You = 3). Ek shop jo sab kuch 40% off kare woh top par flood nahi kar sakti.
4. **Overflow** — cap ke baad bachi items lower position par interleaved hain (dump nahi hoti).

### 🎯 Strategy
- **Daraz-style discovery bina cold-start problem** — real click/order data na hone par image + rating + recency proxies use hote hain.
- **Discount dominance ko damp karna** — √ function + soft caps, taake "sab sasta" strategy ek hi shop ko feed nahi de de.
- **Pakistan-specific** — Urdu/Roman-Urdu synonyms, desi dishes (biryani, karahi, samosa, desi ghee), "anday wala burger" tak — ye global search engines nahi samajhte.

---

## 5. Product Experience

### Features
- Quick-view modal (deep-linkable via `?product=<id>`).
- Standalone product pages `/p/[code]` via 8-char base62 short code.
- Product galleries with lightbox + keyboard nav.
- Variant systems: generic `VariantSelector` + `GarmentVariantSelector` (color swatches, "Only N left", per-option price, variant-image switching).
- Markdown pricing: strikethrough + "% OFF" badge (hidden after `deal_expires_at`).
- In-stock / Out-of-stock toggle.

### ⚙️ Kese Kaam Karta Hai
1. **Short code** — har product ko unique 8-char code milta hai (`lib/shortCode.ts`); WhatsApp message mein `/p/<code>` deep link hota hai, taake customer 2 clicks mein product par pahunche.
2. **Quick view** — product card se modal khulta hai (cart-first), URL par `?product=<id>` lagta hai taake share/refresh par state nahi khoti.
3. **Variants** — JSONB `variants` array (color groups hex swatches vs size chips), per-option `price_adj` / `is_available` / `stock`; checkout par variant availability server-side re-check hoti hai.
4. **Discount badge** — `getProductDiscount` original_price vs price se percent nikalta hai; `deal_expires_at` ke baad badge gayab.

### 🎯 Strategy
- **Variant matrix CSV-friendly** — merchants (especially boutiques/food) ke liye 2-group variants enough hain; full matrix complexity intentionally limited.
- **WhatsApp-first deep links** — order message mein product ka short link, taake WhatsApp conversation se wapas app mein 1-click ho sake.

---

## 6. Cart, Checkout & WhatsApp Order Flow

### ⚙️ Kese Kaam Karta Hai — Cart (`store/cartStore.ts`)
1. **Zustand + persist** — cart state `trendsmart_cart` localStorage mein save hota hai; SSR par no-op storage (hydration safe).
2. **Sanitize-on-merge** — localStorage se load karte waqt har item `sanitizeCartItem` se guzarta hai (HTML strip, price/quantity clamp, URL validation) — corrupted/hacked localStorage crash nahi karta.
3. **Unique cart ID** — `productId + variant + notes` key se same product different variant/notes alag cart lines hain.
4. **Per-shop grouping** — cart items shop_id ke hisaab se grouped; checkout per-shop hota hai (multi-shop carts hain lekin har shop ka order alag WhatsApp message).

### ⚙️ Kese Kaam Karta Hai — Checkout (`WhatsAppCheckoutModal` → `POST /api/orders`)
1. **Auth/email gate** — checkout start par verified email required.
2. **Review cart** — editable quantities + coupon field (debounced `validateCoupon`).
3. **Shipping details** — profile/address auto-fill (Pakistani 03xx phone format), GPS "Use my precise location" + reverse geocode, live pin requirement.
4. **Slab checks (client preview)** — min order, free-delivery threshold, flat + per-km fee, coverage gate `isCustomerWithinCoverage`, closed-shop block `getShopHoursSummary`.
5. **Server re-validation** — `POST /api/orders` har cheez server par dubara check karta hai (details Section 23).
6. **Idempotency** — har checkout attempt par client `idempotencyKey` (UUID) generate karta hai; server duplicate token par same order wapas karta hai (double-click = 1 order).
7. **Success** — WhatsApp message compile hota hai (items + short links + coupon discount + Maps pin + order ref) → `wa.me/<merchant>` opens; local order history save; Web Push merchant + customer ko.

### 🎯 Strategy
- **Trust-less client** — client kabhi price, discount, ya delivery fee final nahi karta; server authoritative prices DB se re-read karta hai. Client-par price tampering impossible.
- **Idempotency-first** — `client_token` + unique partial index; coupon increment/stock deduction mutation se PEHLE check hota hai, taake retry double-spend na kare.
- **Sanitized WhatsApp payload** — `sanitizePayload*` har item/notes/text se HTML, control chars, aur prompt-injection hata deta hai (WhatsApp message bhi XSS attack vector ban sakta hai).
- **Resume-after-login** — guest cart checkout par login chahye; `tm_resume_checkout` sessionStorage checkout flow ko wapas resume karta hai.

---

## 7. Order Lifecycle & Live Tracking

### ⚙️ Kese Kaam Karta Hai
1. **Status flow (DB-enforced)** — `Pending → Processing → Dispatched → Delivered`; `Cancelled` allowed from Pending/Processing/Dispatched. `enforce_order_status_flow()` BEFORE UPDATE trigger illegal jumps (e.g. Pending → Delivered) ko reject karta hai.
2. **Money breakdown** — `subtotal_amount`, `discount_amount`, `delivery_fee`, `coupon_code`, `total_amount` server par calculate hoke store hote hain.
3. **Merchant desk** — Realtime subscription `subscribeToOrders` naye/updated orders par sound + toast; status chips with counts; `getValidTransitions` sirf valid next states dikhata hai.
4. **Customer tracking** — `/orders/tracking` phone YA order-ID se search; `buildStatusTimeline` color-coded timeline banata hai (completed green, active colored, future grey); live update par "Just Updated" ring.
5. **Strict ownership** — `/api/orders/track` har request par re-verify karta hai: `customer_user_id = auth.uid()` YA shop owner YA admin. Phone number ab "bearer token" nahi — sirf logged-in owner apne orders dekh sakta hai.
6. **Realtime push** — `orders` table supabase_realtime publication par hai, isliye tracking page live status updates leta hai.

### 🎯 Strategy
- **Trigger-enforced lifecycle** — status transitions DB level par guard hote hain, taake merchant UI bug ya race condition se order kabhi invalid state mein na jaye.
- **Phone + user-id dual check** — kisi aur ka phone number enter kar ke order dekhna impossible (SQL: phone ke last-10 digits user ke profile phone se match honne chahiye).
- **Soft stock deduction** — WhatsApp-first ho ne se checkout stock par kabhi BLOCK nahi hota; stock khatam hone par product auto "Sold Out" ho jata hai (Section 23 detail).

---

## 8. Merchant Dashboard Features

### Features & Mechanism
| Feature | Kese kaam karta hai |
|---|---|
| **Products engine** | CRUD + sub-category + markdown pricing + multi-image + variants + in-stock toggle; list search/filter/sort; bulk actions (available/out-of-stock/% discount/delete); CSV import/export. `trendsmart:products-updated` cross-tab sync. |
| **Batch creator** | Desktop single-line table / mobile stacked cards, "+5 Rows", per-row images, seeds sub-categories via API, `bulkCreateProducts`. |
| **Inventory matrix** | `inventory_variants` relational rows + JSONB variants; auto SKU `PROD-{id}-{GROUP}-{OPTION}`; low-stock thresholds; Realtime live sync `subscribeToInventory`; dirty-tracking batch save; alert severity (healthy/low/critical/out). |
| **Order desk** | Realtime new-order sound/toast; status transitions; search; WhatsApp customer contact; itemized breakdown. |
| **Analytics** | 7/30/90-day; KPI cards (revenue/orders/AOV/customers); daily revenue line; top products; lead-source donut; top-clicked products from `analytics_logs`; CSV export. |
| **Finances** | Manual income/expense ledger; summary cards (revenue/expenses/pending/net profit); pending-order payment pipeline; CSV export. |
| **Settings** | Live toggle, socials, fees (min order/free threshold/flat+per-km), Web Push alerts, QR download, audit logs. |
| **Leads** | Source badges (WhatsApp/Form/Booking), mark-converted, notes, delete, WhatsApp links. |
| **Inquiries** | Contact-form messages inbox. |
| **Ads** | Ad request lifecycle pending→approved/rejected, counters, Live/Paused. |
| **Service portfolio** | Before/after photos for service shops. |
| **Quick-add FAB** | Floating "+" chooser: product/bulk/deal/story/coupon/QR. |

### 🎯 Strategy
- **"Lightning-fast" product addition** — 4-field minimal form + batch rows, taake dukaandar mobile par bhi 1 minute mein 10 products add kar sake.
- **Realtime everywhere** — inventory live-sync aur order desk realtime, taake double-device editing ka conflict kam ho.
- **CSV everywhere** — data portability: merchants apna catalog/ledger export kar sakte hain.

---

## 9. Merchant Store Controls

### ⚙️ Kese Kaam Karta Hai
1. **Delivery radius** (`ShopLocationRadiusPicker`) — GPS pin + reverse geocode, radius presets 3–100 km + custom, coverage mode select karta hai: **custom radius / specific city / all Pakistan**, encoded in `delivery_zones` (`__pk_nationwide__` / `__pk_city__:Lahore`).
2. **Slabs** — `min_order_amount`, `free_delivery_threshold`, `delivery_fee_flat`, `delivery_fee_per_km` shop row par; checkout aur server dono enforce karte hain.
3. **Markdown pricing** — original price + discounted price; "% OFF" badge auto.
4. **QR code** — `ShopQrCode` public store URL (`/shop/{slug}`) encode karta hai; brand-green, print-ready 1024px PNG download + link copy.
5. **Business hours** — `business_hours` JSON + `operating_status`; owner live Open/Closed toggle; `StoreStatusBadge` / `getShopHoursSummary` customer ko dikhata hai.
6. **Sensitive lock** — name/WhatsApp/location change par password + 30-day `sensitiveInfoLockedUntil`.

### 🎯 Strategy
- **Merchant control = trust** — dukaandar ko delivery limits apne haath mein chahiye (3km wala shop 10km ka order nahi lena chahta). System isko har jagah enforce karta hai — browse filter, checkout gate, server API.
- **Free-delivery as conversion tool** — "Rs. 2000 par delivery free" merchant ko upselling deta hai, customer ko saving. Server hi calculate karta hai taake client tamper na ho.
- **QR printability** — physical stores ka real use case: counter stand/flex par QR, scan → store web profile.

---

## 10. Deals, Coupons & Promotions

### ⚙️ Kese Kaam Karta Hai — Scheduled Deals (`lib/dealSchedule.ts`)
1. **3 schedule types** — `weekly` (weekdays array) / `date_range` (starts_on → ends_on) / `monthly` (day_of_month), DB CHECK constraints per type.
2. **Pakistan timezone** — `toPkDateKey()` Asia/Karachi timezone mein aaj ki date nikalta hai; deal "aaj orderable hai?" ka decision PK calendar day par hota hai.
3. **When-tags** — `formatDealWhenTag` customer-friendly labels banata hai: "Monday deal", "Fri & Sat deal", "14 August deal", "Monthly 5th deal".
4. **Orderability gate** — `isDealOrderableToday` deal ko sirf active day(s) par order hone deta hai (UI + server dono).
5. **Featured** — `is_featured` deals spotlight strip mein upar.

### ⚙️ Kese Kaam Karta Hai — Coupons (`services/couponService.ts` + DB)
1. **XOR constraint** — DB me check: `discount_percent` XOR `discount_amount` (dono ek saath impossible).
2. **Atomic usage** — `increment_coupon_usage()` single UPDATE statement: `usage_count = usage_count+1 WHERE usage_limit IS NULL OR usage_count < usage_limit`. Concurrency mein kabhi over-redeem nahi ho sakta (TOCTOU closed).
3. **Validation** — client `validateCoupon` (expiry, min order, usage limit, discount calc); server `/api/orders` dubara validate karta hai.
4. **Homepage ticker** — `fetchActiveCouponsForShops` active coupons ko shop cards par offer ticker mein dikhata hai (max 3 per shop).

### ⚙️ Kese Kaam Karta Hai — Promotional Ads
1. Merchant ad request → DB trigger `guard_promotional_ads_review_fields()` force `pending` karta hai (admin bypass).
2. Admin approve → ad `homepage_top` / `homepage_feed` placement par live hota hai.
3. `increment_ad_impression/click` RPCs counters update karte hain (client tamper-proof).
4. Public RLS sirf approved + active + window ke andar wale ads dikhata hai.

### 🎯 Strategy
- **"Global coupon system se alag"** — `.cursorrules` kehta hai product discounts alag, coupon codes alag. Yeh alag tables/features hain jo compose hote hain (product discount + coupon + delivery slab sab ek sath).
- **Atomicity is non-negotiable** — coupon usage race condition mein double-redeem hone se platform ko direct revenue loss hota; isliye SQL-level atomic increment.
- **Deal scheduling scarcity** — "sirf Monday ko deal" urgency paida karta hai aur deal day calendar (`OfferDaysStrip`) aane wale deals ka anticipation.

---

## 11. Super-Admin Panel

### Features & Mechanism
| Tab | Kese kaam karta hai |
|---|---|
| **Overview** | Total/active/suspended merchants, total orders, total/today revenue, pending verifications, merchant status distribution, live activity feed. |
| **Approval Queue** | Approve/reject pending stores — **legacy** (SQL ne auto-approve kiya hai, stores instant-live hain). Approve `is_live` flip karta hai. |
| **Merchants** | Searchable/filterable table: order counts, revenue, verification status, Suspend/Activate, Delete (cascade). Toggles branded approval emails bhejte hain (`/api/notifications/merchant-approval`). |
| **Live Transactions** | Realtime order-status feed `subscribeToPlatformTransactions`. |
| **Categories** | Platform taxonomy — main category par sub-categories add/toggle. |
| **Ads** | Approve/reject merchant ads, create "Platform Ads" (instant live), view counters, live toggles. |
| **Support inbox** | Tickets filterable by status/category, status transitions (`updateSupportTicket`). |
| **Audit logs** | Severity badges, old/new value diffs, search/filters, stats, pagination. |

### 🎯 Strategy
- **Approval queue inversion (important!)** — `.cursorrules` strict approval queue maangta hai, lekin SQL (`DISABLE_merchant_approval_queue.sql`) ne deliberately ise off kiya: default `verification_status='approved'`, `is_live=true`. Reason: **WhatsApp-first soft launch mein instant-live onboarding** — merchant signup kare aur turant sell kar sakke. Admin UI legacy hai aur baad mein strict mode toggle kiya ja sakta hai.
- **Monetization path ready** — ads moderation + revenue counters platform ke paid-ad revenue model ka base hain.

---

## 12. Geo-Location & Delivery Radius System

### ⚙️ Kese Kaam Karta Hai (`services/geoRadiusService.ts`)
1. **GPS detection** — `requestUserLocationDetailed` high-accuracy GPS, 15s timeout, typed error codes (denied/timeout/unsupported) with friendly Urdu-ish UI messages.
2. **Haversine distance** — `haversineDistance` NaN-safe, clamped lat/lng, earth radius 6371km.
3. **Coverage modes** — har shop ka `delivery_zones` parse hota hai:
   - `__pk_nationwide__` → all Pakistan
   - `__pk_city__:Lahore` → sirf Lahore
   - empty → radius mode (`service_radius_km`)
4. **Merchant radius ALWAYS enforced** — "All Pakistan" browse scope mein bhi, 5km wali shop 5km ke bahar kabhi visible nahi. Yeh rule sab kuch override karta hai.
5. **City fallback** — `CITY_CENTROIDS` (25+ Pakistani cities) se city centroid matching; `findNearestCity` GPS ko nearest supported city se map karta hai.
6. **Reverse geocode** — Nominatim (zoom 18 building/street detail) + **GPS nearest-city is authoritative** (agar OSM galat city bataye, e.g. "Peshawar, E-8, Islamabad", toh GPS city wins); conflicting city tokens scrub hote hain.
7. **Location cache TTL** — GPS location 30 min valid; manual/city selection indefinite.
8. **Place search** — `/api/places/search` Google Places → Photon → Nominatim fallback, Pakistan-bounded, coordinate-biased, dedup.
9. **Checkout gate** — `isCustomerWithinCoverage` single source of truth: coverage gate + server API dono isi par chalte hain.

### 🎯 Strategy
- **Hack-free city resolution** — OSM Pakistan data ke "multiple city" bugs ko GPS-centroid authority + token scrubbing se solve kiya gaya — ye ek real-world Pakistan-specific data problem hai.
- **Per-shop radius independent of browse scope** — customer "kitne KM mein dikhao" filter alag (browse preference), merchant service radius alag (business rule). Business rule hamesha jeet ta hai.
- **Graceful degradation** — GPS deny hone par city picker, coordinates nahi to city-centroid distance approximations.

---

## 13. Reviews & Ratings

### ⚙️ Kese Kaam Karta Hai
1. **Verified purchase** — POST `/api/reviews`: signed-in required, apni shop ka review nahi, ek user ek shop ka sirf ek review (partial unique index `uq_reviews_shop_user`), purchase verification (`customer_user_id` + phone fallback).
2. **Anti-spam** — IP rate limits (daily caps + same-shop weekly via hashed IP), sanitized comments (HTML/ALL-CAPS/spam checks).
3. **Merchant reply** — owner `PATCH` sirf reply fields update kar sakta hai (RLS restrict).
4. **Aggregates** — `refresh_shop_rating_stats()` trigger INSERT/UPDATE/DELETE par `shops.avg_rating` + `review_count` maintain karta hai → fast `★ 4.5 (4.2k)` cards.
5. **UI** — rating distribution bars, verified badges, reply threading, pagination, quick rating modal.

### 🎯 Strategy
- **One-review-per-user** — fake/spam review flooding rokta hai; verified-purchase flag trust barhata hai.
- **Denormalized aggregates** — home feed par rating query har baar 1000 reviews count nahi karti; trigger denormalization O(1) read deta hai.

---

## 14. AI Chat Assistant & Support Systems

### ⚙️ Kese Kaam Karta Hai — AI Chatbot (`POST /api/chat`)
1. **Session-scoped** `ChatWidget` floating — storefront par shop-context ke sath.
2. **Sanitization first** — strip HTML/scripts/prompt-injection patterns (LLM prompt injection ko bhi simple rules engine bypass karta hai).
3. **Intent detection** — keyword-based: pricing/hours/product/location/order/contact/greeting, **Urdu + English**.
4. **Rule-based responses** — shop ka context (products, prices, hours, location) se answers; conversations `chat_logs` mein logged + helpful/not-helpful feedback.

### ⚙️ Kese Kaam Karta Hai — Support System
1. **Public support desk** (`/support`) — categorized ticket form (General/Order/Merchant/Technical/Billing/Other) → `support_tickets` via `/api/support/notify` (rate-limited, sanitized).
2. **Emails** — user ko confirmation, `SUPPORT_TEAM_EMAIL` ko alert (Resend).
3. **Admin inbox** (`/admin/support`) — status lifecycle open→in_progress→resolved→closed.
4. **FAQ** — customer + "New Business Owner Guide" accordions.
5. **Legal pages** — Terms, Privacy, Refund Policy, Merchant Guidelines (`LegalPageLayout`).

### 🎯 Strategy
- **Rule-based > raw LLM** — chat ek halka business-assistant hai (abhi paid LLM API cost bachana). Intent detection deterministic hai, isliye hallucination ka risk kam.
- **Ticket + email + admin inbox** — support funnel closed-loop: customer → ticket → admin resolution → email response.

---

## 15. Notifications

### ⚙️ Kese Kaam Karta Hai
1. **Realtime in-app** (`NotificationListener` / `AppNotifications`) — Supabase Realtime subscriptions:
   - `orders` → merchant ko naya order (sound + toast)
   - `customer_inquiries` → merchant inbox
   - customer ko order-status updates (`subscribeToCustomerOrders`)
2. **Web Audio chime + `trendsmart:toast` bridge** + unread badge + mute toggle + localStorage history (50 items) + slide-out panel.
3. **Web Push** (`lib/webPush.ts`) — VAPID keys, per-send 10s timeout, **404/410 subscriptions auto-deleted** (dead endpoints cleanup). `/api/push/notify-order` sirf owning merchant/customer ko allow karta hai aur status DB se authoritative read karta hai.
4. **Order placement** — `/api/orders` success par merchant + customer dono ko OS push.
5. **Auto-registration** — `AutoSubscribeWebPush` sirf tab jab permission already granted ho (kabhi bina gesture ke prompt nahi).
6. **Dashboard bell** — low stock / pending orders / urgent inquiries live counts (`alertService`).

### 🎯 Strategy
- **WhatsApp-first, push-secondary** — OS push orders pehle se notify karta hai, taake merchant WhatsApp khole bhi to order ka pata ho.
- **Never prompt outside gesture** — browser push permission policies; auto-subscribe sirf granted users ke liye (UX + compliance).
- **Self-healing subscription table** — 404/410 cleanup means stale push rows kabhi nahi jamte.

---

## 16. PWA & Offline Support

### ⚙️ Kese Kaam Karta Hai
1. **Manifest** (`app/manifest.ts`) — standalone, portrait, teal, 192/512 + maskable icons.
2. **Service worker** (`public/sw.js`) — `skipWaiting`, cache clearing on activate, **no fetch interception** (Next.js navigation nahi tooti), Web Push handlers with tag-collapsing + window focus/navigate.
3. **Install** — `beforeinstallprompt` capture → `PwaInstallTip` (Android native prompt / iOS Share → Add to Home Screen copy).
4. **Splash** — `AppSplash` staged logo → wordmark → feature intro; prefetch shops/stories/deals during hold; `InteractionUnlock` failsafes (crash/tab-restore) — React-owned DOM nodes kabhi detach nahi hote.
5. **Offline page** — `/offline` static fallback jab navigation fail ho.
6. **Chunk reload guard** — stale-deploy `ChunkLoadError` par 1 auto-reload (15s expiry guard).

### 🎯 Strategy
- **No-fetch-interception service worker (critical design)** — Next.js navigation/app router is too complex for naive SW caching; sirf push + install + offline fallback karta hai, taake stale-cache bugs se bacha jaye.
- **"Add to Home Screen" bina Play Store** — PWA ka target: Pakistani merchants/users jinke pas low-end Android devices hain; native-app feel bina store friction.

---

## 17. Theme Engine & Appearance

### ⚙️ Kese Kaam Karta Hai
1. **Pre-paint bootstrap** — `layout.tsx` mein inline `THEME_BOOTSTRAP` script first paint se PEHLE `trendsmart_theme_prefs_v4` parh kar CSS variables set karta hai (dark/light class, font scale, grid layout, card style) — **no flash of wrong theme**.
2. **ThemeContext** — live toggle `useTheme`, localStorage persistence.
3. **Font scaling** — 14–20px slider, CSS variables se live apply.
4. **Grid/card styles** — custom grid layout options + card styling prefs.
5. **Merchant storefront** — `merchant_theme_preferences`: accent color override, layout style, dark default, announcement banner / WhatsApp float toggles.

### 🎯 Strategy
- **"No invisible/unreadable text bugs"** — `.cursorrules` requirement; pre-paint script + CSS-variable tokens (not hardcoded colors) isi ko guarantee karte hain.
- **Accessibility** — font scaling user control WCAG-friendly.

---

## 18. SEO & Performance Engineering

### SEO Mechanism
- **Dynamic sitemap** (1h ISR): home/products/deals/search/FAQ/support/legal/wishlist + category routes + up to 5k live shops (priority 0.7–0.9, story boost) + product deep links `/p/<code>`.
- **robots.txt** — disallow dashboard/auth/admin/api/orders/account/settings; GPTBot/CCBot opt-out; sitemap pointer.
- **JSON-LD** — `LocalBusinessSchema` (category → Schema.org type mapping), `ProductSchema`, `SearchActionSchema`, `BreadcrumbListSchema`.
- **Per-shop metadata** server-side (UUID or slug), SEO-friendly image URLs (content-disposition inline).

### Performance Mechanism
- **CDN edge caching** — `/shop/*` (s-maxage 600, SWR 86400), `/products` `/deals` `/search` `/` (short TTL + SWR), immutable `/_next/static/*`.
- **Image pipeline** — AVIF/WebP, device/image breakpoints, min cache TTL 1h prod, remote patterns restricted to Supabase.
- **Code splitting** — manual splitChunks (Supabase/Framer/jsPDF vendors), deterministic chunk IDs, `removeConsole` prod, bundle analyzer opt-in.
- **React Query tuning** — 60s staleTime, 5m gcTime, retry 1, no window-focus refetch.
- **Data layer** — `search_vector` tsvector + GIN, pg_trgm, covering indexes, server cursor pagination, 8k+ product memoization.

### 🎯 Strategy
- **Vercel-native** — no `output: standalone` (Vercel adapter crash issue documented in next.config), Turbopack default, typescript errors fail build in CI.
- **Balance freshness & cost** — public pages SWR-cached, admin/dashboard/api no-store.

---

## 19. Security, RLS & Anti-Abuse

### ⚙️ Kese Kaam Karta Hai
1. **RLS everywhere** — ~38 tables; tenant isolation via SECURITY DEFINER helpers `is_shop_owner()` / `is_admin()` with empty `search_path` (RLS recursion 500 fix — `20260811150000` migration).
2. **Strict order ownership** — customer rows: `customer_user_id = auth.uid()` AND phone last-10-digits match profile; tracking RPCs guests ko zero rows.
3. **Role integrity** — `set_my_signup_role()` blocks admin escalation + merchant→customer downgrade while owning shop.
4. **Rate limiting** — middleware distributed limiter (stricter 10/15s on auth/admin/dashboard/api), review IP caps, support rate limit.
5. **Sanitization suite** — Zod schemas, HTML/script/prompt-injection strip, ALL-CAPS/spam filters, response sanitizer, open-redirect protection.
6. **Security headers** — CSP, HSTS preload, X-Frame-Options DENY, nosniff, Referrer-Policy, Permissions-Policy, CORP/COOP/COEP.
7. **Build-time env audit** — `lib/envAudit.ts` production build FAIL karta hai agar `NEXT_PUBLIC_*` mein secret mile.
8. **Mass-delete protection** — `prevent_mass_delete()` cap 50 rows/statement on 10 tables.
9. **Audit trail** — `admin_audit_logs`, `security_audit_log` (auto triggers), `subscription_audit_log`, `legal_acceptances`, `rls_tenant_audit_summary` view.
10. **Ad counter protection** — SECURITY DEFINER RPCs; merchant ads force-pending.
11. **Sentry** — ErrorBoundary + error service telemetry (DSN-gated).

### 🎯 Strategy
- **Defense-in-depth at 3 layers** — Edge middleware (route guard) → client-side guards (UI) → RLS/SQL (data). Har layer independent.
- **"Phone number is not a bearer token"** — order tracking mein strict ownership; yehi sabse sensitive data-leak vector tha aur isko hardest migrate (`20260818010000_strict_order_ownership.sql`) se band kiya gaya.
- **Idempotency + atomicity** — financial integrity (coupons, stock, orders) concurrency-safe.

---

## 20. Analytics, Finances & Audit

### Mechanism
- **Event capture** — `analytics_logs` (shop_view/product_click, IP + UA), `sales_events` (sale/refund/lead/inquiry with source), realtime-enabled.
- **Daily snapshots** — `generate_daily_revenue_snapshot()` per-shop/day aggregation (revenue, order count, unique customers, top product).
- **Merchant dashboards** — Recharts: area/bar/pie, 7/30/90-day, KPI cards, top products, lead-source donut, category distribution, peak hours.
- **Finance ledger** — `finance_entries` manual income/expense + pending-order payment pipeline (Pending/Processing totals).
- **CSV exports** — analytics, finances, inventory.
- **Subscription/billing tables** — `merchant_subscriptions` (free_trial tier, usage counters, suspension), `billing_invoices` (amount_pkr, commission, period).

### 🎯 Strategy
- **Analytics without Google Analytics** — first-party events (RLS + Realtime) se built-in; ad impressions/clicks ka monetization-proof bhi yahi data hai.
- **Manual + automatic finance** — merchant apna ledger bhi manage karta hai aur system orders bhi count karta hai; CSV export GST/records ke liye.

---

## 21. Full Route/Page Inventory

### Public / Storefront
| Route | Purpose |
|---|---|
| `/` | Homepage: categories, stories, deals, ads, recently viewed, live shops |
| `/products` | Cross-store marketplace feed (infinite scroll, 7 sort modes) |
| `/deals` | Scheduled deals browser with 14-day calendar |
| `/search` | Legacy redirect → `/products` |
| `/shop/[id or slug]` | Individual storefront (products, deals, coupons, reviews, service mode, owner-manage mode) |
| `/p/[code]` | Standalone product page (WhatsApp deep link via short code) |
| `/wishlist` | Shops + products favorites |
| `/faq` | FAQ accordion (customers + merchant guide) |
| `/support` | Public support ticket desk |
| `/legal/terms` · `/legal/privacy` · `/legal/refund-policy` · `/legal/merchant-guidelines` | Legal/policy pages |
| `/offline` | PWA offline fallback |

### Auth
| Route | Purpose |
|---|---|
| `/login` · `/signup` | Split-screen auth forms with role selection + legal acceptance |
| `/forgot-password` · `/auth/reset-password` | Password reset (OTP → new password) |
| `/auth/verify-notice` | Email-verification gate |
| `/auth/callback` | OAuth/magic-link session exchange |

### Customer
| Route | Purpose |
|---|---|
| `/account` | Customer portal hub (verification, profile, stats) |
| `/account/addresses` | Delivery address book (CRUD + defaults) |
| `/account/become-merchant` | Store registration / merchant onboarding |
| `/orders` | Order lookup by phone |
| `/orders/tracking` | Live order tracking portal |
| `/settings` | Settings hub |
| `/settings/appearance` | Theme, font scale, storefront display toggles |
| `/settings/notifications` | In-app + Web Push preferences |
| `/settings/privacy` | Password, clear local data, 2FA (coming soon) |
| `/settings/location` | Delivery-area / GPS management |
| `/auth/settings` | Full account settings (photo, delivery profile, email/password) |

### Merchant Dashboard
| Route | Purpose |
|---|---|
| `/dashboard` | Redirect hub → storefront owner-mode |
| `/dashboard/products` | Product & inventory engine |
| `/dashboard/products/new` | Batch product creator |
| `/dashboard/orders` | Real-time order desk |
| `/dashboard/analytics` | Advanced analytics (Recharts) |
| `/dashboard/finances` | Financial ledger & payment pipeline |
| `/dashboard/settings` | Store settings (live, social, fees, alerts, QR, audit) |
| `/dashboard/settings/audit-logs` | Merchant audit log |
| `/dashboard/leads` | Customer lead management |
| `/dashboard/inquiries` | Contact-form inbox |
| `/dashboard/ads` | Promotional ad requests |
| `/dashboard/services/portfolio` | Service portfolio manager |

### Admin
| Route | Purpose |
|---|---|
| `/admin/dashboard` | 6-tab Super-Admin control panel |
| `/admin/support` | Support ticket inbox |
| `/admin/audit-logs` | Platform-wide audit viewer |

---

## 22. Database Schema Overview

**38 tables** across: marketplace core (`user_roles`, `shops`, `products`, `inventory_variants`, `sub_categories`, `orders`, `orders_archive`, `reviews`, `stories`, `coupons`, `shop_deals`, `promotional_ads`), customer personalization (`customer_wishlists`, `favorite_stores`, `customer_addresses`, `user_profiles`), communication (`customer_inquiries`, `leads`, `support_tickets`, `legal_acceptances`, `chat_logs`), monetization (`merchant_subscriptions`, `billing_invoices`, `subscription_audit_log`), analytics/audit (`analytics_logs`, `sales_events`, `daily_revenue_snapshots`, `finance_entries`, `admin_audit_logs`, `security_audit_log`, `maintenance_logs`, `merchant_theme_preferences`), service-provider (`service_packages`, `service_portfolio`, `service_availability`), push (`push_subscriptions`).

**Key patterns:** idempotent migrations (`IF NOT EXISTS`, DO blocks — SQL Editor workflow ke liye safe re-run), RLS everywhere, SECURITY DEFINER helpers with empty search_path, realtime publication on `orders`, `customer_inquiries`, `products`, `reviews`, `inventory_variants`, `analytics_logs`, `prevent_mass_delete()` 50-row cap, `set_updated_at()` on ~17 tables.

---

## 23. API Routes — Mechanism & Strategy

### `POST /api/orders` — Trusted order placement (most critical route)
**Mechanism (exact order):**
1. Auth: signed-in + `email_confirmed_at` required (401 otherwise).
2. Shape validation: shopId UUID, name ≥2 chars, PK phone digits ≥10, items array non-empty.
3. Read shop (admin/service-role client): `is_live`, `verification_status`, business hours (`getShopHoursSummary` closed → 409).
4. **Authoritative prices** — har item ka product/deal/service_package DB se re-read; shop mismatch → 400; unavailable/out-of-stock variant → 409; invalid price → 409.
5. Subtotal = authoritative prices × quantity.
6. **Coverage** — parse `delivery_zones` (city/radius/nationwide); haversine distance; out-of-radius/city → 409 with friendly distance message.
7. **Coupon** — server-side select active coupon, check expiry/min-order/usage-limit, compute discount (min with subtotal).
8. **Min order** — pre-discount subtotal check (merchant intent matches client gate).
9. **Delivery fee** — free if subtotal ≥ threshold, else flat + per-km × distance.
10. **Idempotency** — `client_token` lookup BEFORE any mutation; existing order returned.
11. **Atomic coupon increment** — `increment_coupon_usage` RPC (legacy fallback if RPC missing).
12. **SOFT stock deduction** — `deduct_product_variant_stock` RPC; false → product auto `is_available=false` (Sold Out for others) but **THIS order proceeds**.
13. Insert order with full money breakdown (`customer_user_id` set).
14. Web Push → merchant + customer (best-effort, non-blocking).

**Strategy:**
- **"Trust nothing from client"** — prices, coupons, fees, coverage sab server-side. Client sirf "kya order karna hai" batata hai, "kitne mein" nahi.
- **Soft stock (critical WhatsApp-first decision)** — merchant human gatekeeper hai; digital stock guide hai, blocker nahi. Comment in code: *"we NEVER reject an order over a stock number."*
- **Retry-friendly** — older DB column fallback (money breakdown retry with core fields) taake schema mismatch par checkout 500 na ho.

### `GET /api/orders/track`
Requires session; RPCs `track_order_by_id` / `track_orders_by_phone` then **server re-filters every row** to buyer/owner/admin. Guests → zero rows.

### `POST/PATCH /api/reviews`
Verified-purchase only, one-per-user, IP rate limits, sanitization; PATCH = owner reply only.

### `POST /api/chat`
Sanitize → shop context build → keyword intent detection (Urdu+English) → rule-based response → `chat_logs` log.

### `GET /api/places/search`
Google Places (new text search) → legacy → Photon → Nominatim; Pakistan-bounded, coordinate-bias, dedup, server-only key.

### Push APIs
- `POST/DELETE /api/push/subscribe` — upsert per user/endpoint; DELETE by user/endpoint.
- `GET /api/push/status` — non-secret health (VAPID configured? admin ready?).
- `POST /api/push/notify-order` — owner/customer only; authoritative status from DB.

### Misc
- `POST /api/notifications/merchant-approval` — admin-only branded email (`requireAdminUser` + Resend).
- `GET /api/sub-categories` — validated against `SHOP_CATEGORIES`, in-memory TTL cache + ETag/304, "Others/General" fallback.
- `POST /api/support/notify` — rate-limited, sanitized, admin-client insert + guest fallback, confirmation + team alert emails.

---

## 24. Status: Done vs Pending

### ✅ Implemented & Coded
- Full RBAC (guest / customer / merchant / admin) with middleware + DB enforcement
- Email auth (signup, sign-in, OTP verification, password reset, verify-gate)
- Homepage storefront: categories, stories, ads carousel, deals strips, recently viewed, live shops grid
- Products feed with 7 sort modes, infinite scroll, fuzzy search (Urdu/English synonyms), fair-mix "For You" feed
- Deals engine (weekly/date-range/monthly schedules in Asia/Karachi, featured, day calendar)
- Multi-item cart + WhatsApp checkout (auto-fill, slabs, coupons, GPS, sanitized message, idempotent server order)
- Order lifecycle (Pending → Processing → Dispatched → Delivered) + live tracking with strict ownership
- Merchant dashboard: products, batch creator, inventory matrix (realtime), orders, analytics, finances, settings, leads, inquiries, ads, portfolio, QR code
- Delivery radius & slab system (radius picker, coverage modes, per-km fees, server enforcement)
- Markdown pricing with "% OFF" badges
- Coupons (atomic usage, min order, limits) + scheduled deals + sponsored ads
- Reviews & ratings (verified purchase, replies, aggregates, anti-spam)
- AI chatbot (rule-based, Urdu+English), support tickets, FAQ, legal pages
- Notifications: realtime in-app + Web Push (orders, inquiries, status updates)
- PWA: manifest, service worker, install tips, splash, offline page, chunk-reload guard
- Theme engine: dark/light, font scaling, grid/card styles, merchant themes, pre-paint bootstrap
- Super-admin panel: overview, merchants, approval, categories, ads, support, audit
- Analytics & audit: dashboards, logs, CSV exports, realtime feed
- Security: RLS hardening, idempotency, rate limiting, sanitization, security headers, env audit, mass-delete protection

### 🔜 Planned / Partially Wired (from `.cursorrules` roadmap)
- **SMS Phone OTP at checkout** — removed in favor of email-only verification; `phone_verified_at` infrastructure exists
- **Strict merchant approval queue** — DB configured for auto-approve (instant-live) via `DISABLE_merchant_approval_queue.sql`; admin UI exists but legacy
- **Cloudinary image storage engine** — currently Supabase Storage; Cloudinary free-tier WebP compression is a documented goal
- **Custom SMTP for all transactional email** — Resend wired; Supabase Auth custom SMTP config is an ops task
- **2FA / View My Data** — marked "coming soon" in `/settings/privacy`
- **Native app wrapper** (Capacitor/TWA) — PWA covers it for now
- **Bulk-price tiers** in product form — marked "coming soon" in UI
- **Payment gateway** — intentionally $0 (WhatsApp-first / COD); Stripe/JazzCash placeholders only

---

*Generated Aug 2026 — expanded feature inventory with per-feature mechanism ("kese kaam karta hai") and strategy ("kyun aisa banaya") from full codebase review.*
