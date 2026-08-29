# TrendMart — Launch Plan, Changes & Full Accounting (Ek Hi File)

> Updated: 2026-08-29 · Ye file sab kuch cover karti hai: jo changes kiye, subscription + ads ka poora hisab, future systems, aur paid-stories ka decision.

---

## 1. Jo 11 Changes Kiye Hain — Aur Kyon (Maqsad)


| #   | Change                                                                                                                                                                      | File                                         | Maqsad / Kyon                                                                                                                                                                                                                      |
| --- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | **AI crawlers allowed** (GPTBot, ClaudeBot, PerplexityBot, Google-Extended, Bing Copilot, CCBot…)                                                                           | `app/robots.ts`                              | Pehle robots.txt **saare AI bots ko block** kar raha tha — ab ChatGPT/Claude/Perplexity TrendMart padh kar link de sakte hain (aapki SEO requirement). Private routes (dashboard/admin/orders) sab agents ke liye band rehte hain. |
| 2   | **Homepage scalable** — public catalog (shops + stories) 5-min `unstable_cache` me; guests ab `getUser()` call skip karte hain                                              | `lib/homeData.ts`                            | Pehle har request par Supabase 300-row query + auth call hoti thi. Ab 1,000s concurrent hits cache se serve hoti hain.                                                                                                             |
| 3   | **Shop SEO strong** — LocalBusiness JSON-LD ab server-render hota hai **geo coordinates** (lat/lng), schema type (Restaurant/GroceryStore), WhatsApp number, hours ke saath | `app/shop/[id]/layout.tsx`, `page.tsx`       | "burger near Peoples Colony Gujranwala" jaisi local search me rank karne ka sabse bada signal. Google ab raw HTML me structured data dekhta hai.                                                                                   |
| 4   | **Product pages ko SEO mila** — pehle `/p/[code]` par zero title/canonical/schema tha. Ab server metadata + Product JSON-LD (price, availability, rating, seller)           | naya `app/p/[code]/layout.tsx`               | Ye aapke sabse zyada crawled URLs hain (sitemap me hain) — ab rich snippets mil sakti hain.                                                                                                                                        |
| 5   | **Dine-in spam fix (security)** — koi bhi `{source:"staff"}` bhej kar 15s cooldown skip kar sakta tha                                                                       | `app/api/dinein/orders/route.ts`             | Ab staff order sirf shop owner/admin session se jata hai, warna 403.                                                                                                                                                               |
| 6   | **Order idempotency fix (security)** — lookup user-scope nahi tha (leaked token se kisi aur ka naam/phone/items parh sakte the) + concurrent duplicate par confusing 500    | `app/api/orders/route.ts`                    | Ab token sirf usi user ka order wapas karta hai, aur duplicate race me winning order return hota hai.                                                                                                                              |
| 7   | **"System" theme mode fix** — OS dark mode follow karne wala option reload ke baad khona tha                                                                                | `context/ThemeContext.tsx`, `app/layout.tsx` | UI consistency: OS dark mode users ke liye ab theme persist hota hai.                                                                                                                                                              |
| 8   | **CartBar per-shop subtotal fix** — quantity tiers ignore ho rahe the (6-pack 6×200 bill hota tha)                                                                          | `components/CartBar.tsx`                     | Ab sab jagah total match karta hai.                                                                                                                                                                                                |
| 9   | **Order PII console se hatai** — name/phone/address/coords browser console me dump ho rahe the                                                                              | `components/WhatsAppCheckoutModal.tsx`       | Privacy. Error logs ab sirf message-level hain.                                                                                                                                                                                    |
| 10  | **Distributed rate limiting** — Upstash REST adapter (bina dependency) + env bootstrap                                                                                      | `lib/rateLimiterRedis.ts`, `middleware.ts`   | `UPSTASH_REDIS_REST_URL` + `UPSTASH_REDIS_REST_TOKEN` set karo → rate limit global ho jata hai (coordinated attacks se bachav).                                                                                                    |
| 11  | **Admin audit trail live + admin gate** — approve/reject/suspend/delete/ban ab `admin_audit_logs` me write karte hain; dashboard me client-side admin check                 | `app/admin/dashboard/page.tsx`               | "Security trail" tab ab actually kaam karta hai; non-admin client-side se bhi block hota hai.                                                                                                                                      |


---



## 2. Monthly Subscription System — Poora Hisab (SINGLE PLAN — CORRECTED)

**Code:** `services/subscriptionService.ts` · Tables: `merchant_subscriptions`, `billing_invoices`, `subscription_audit_log`

### Asli model (aapka — ab code me fix kar diya)
- **Zero commission** — TrendMart har merchant ke orders ka koi % NAHI leta.
- **Ek hi fee** — **Rs 1,000/month** (sabhi merchants ke liye).
- **Koi product limit nahi** — effectively unlimited (code me 100k soft cap).
- **Koi storage limit nahi** — effectively unlimited (100 GB soft cap).
- **Free trial = 1 month (30 din)** — 14 din nahi.
- **Sabko same best features** — koi feature tier nahi; free trial wale ko bhi full features.

### Code me kaise implement hai
- `TRENDMART_MONTHLY_FEE_PKR = 1000`
- `TRENDMART_COMMISSION_PCT = 0`
- `TRENDMART_FREE_TRIAL_DAYS = 30`
- `TRENDMART_MAX_PRODUCTS = 100_000` (soft cap — asli dukaan kabhi nahi bharti)
- `TRENDMART_MAX_STORAGE_MB = 100_000` (soft cap)
- `TRENDMART_ALL_FEATURES` — full list (storefront, WhatsApp orders, advanced analytics, coupons, stories, CSV, inventory, variants, invoices, API, white-label, priority support)
- `SUBSCRIPTION_TIERS` me `free_trial` → Rs 0 + 30-din trial; `starter/pro/enterprise` teeno → **same "TrendMart Standard" Rs 1,000/mo, 0% commission, unlimited, full features**. (Enum 4 values is liye rakha hai ke DB me legacy rows `'starter'/'pro'/'enterprise'` bhi theek kaam karein.)

### Invoice ka hisab (formula)
```
Monthly Invoice = Rs 1,000 (flat) + (Orders × 0% commission) = Rs 1,000
```
Free trial ke mahine me: invoice 0 (waived). Uske baad har mahine: **Rs 1,000 flat**.

### Lifecycle (auto-checks in code)
`active` → billing period khatam + unpaid invoice → `grace_period` (**5 din**) → agar na bhara → `suspended` (storefront `is_live=false`). Free trial khatam → `expired` → payment ke baad active.

> ⚠️ **Sach: abhi koi payment gateway wired NAHI hai.** Admin `merchant_subscriptions.tier` manually change karta hai (ya future me gateway). Ye launch se pehle ka sabse bara gap hai — wallet/billing UI bhi complete nahi.

---



## 3. Paid Ads System — Poora Hisab

**Code:** `services/adsService.ts` · Tables: `ad_plans`, `promotional_ads` · UI: `/dashboard/ads`, admin "Ads" tab + `AdPlansManager`

### Seed pricing (already in DB via migration)


| Plan                       | Placement    | Duration | Price        |
| -------------------------- | ------------ | -------- | ------------ |
| Starter Banner — 7 Days    | homepage_top | 7 din    | **Rs 350**   |
| Popular Banner — 1 Month   | homepage_top | 30 din   | **Rs 1,000** |
| Premium Top Spot — 1 Month | homepage_top | 30 din   | **Rs 1,500** |


(Admin `AdPlansManager` se prices add/edit/delete kar sakta hai.)

### Flow

1. Merchant `/dashboard/ads` me plan select + creative (title, image, link) upload karta hai → `createAdRequest`
2. Status `pending` (DB trigger `guard_promotional_ads_review_fields` — merchant khud approve NAHI kar sakta)
3. Super-Admin "Ads" tab se approve/reject (rejection reason ke saath)
4. Approve hone par ad homepage carousel (`PromoAdsCarousel`) me date-window + `is_active` ke hisab se dikhta hai
5. Monetization tracking: `increment_ad_impression` / `increment_ad_click` RPCs (impressions/clicks count), `price_paid` + `ad_plan_id` request time par record



### Platform ads

Admin khud "house ads" bana sakta hai (`shop_id = NULL`, pre-approved) — e.g. TrendMart promotions.

---



## 4. Paid Stories — ❌ KHATAM (Decision Done)

**Decision (aapki): Stories ab FREE + Unlimited hain — koi paid story plan nahi.**

- `20260828230000_unlimited_free_stories.sql` pehle se hi free default = **100 stories/shop/day** (soft ceiling), pro = 200. Limit par posting **kabhi block nahi** karti — oldest story replace hoti hai.
- Naya migration `20260829010000_remove_paid_story_plans.sql` → `story_plans` me jo "Pro Stories — 200 / Rs 300" wali paid row hai wo **deactivate** kar di jayegi. Ab sirf ek free row active rahegi.
- Result: merchants ke liye stories 100% free engagement tool — isse engagement + storefront attraction badhega, jo SEO/social sharing me bhi madad karta hai.

---



## 5. Future Systems Jo Bana Sakte Hain (Priority Order)

1. **Payment Gateway wiring** — Stripe/JazzCash/Easypaisa for subscriptions + ads. Sabse zaroori (iske bina subscription/ads revenue collect nahi ho sakta). `subscriptionService` aur `ad_plans` ready hain, sirf gateway hook-up chahiye.
2. **Full-text search (Postgres** `tsvector` **+ GIN)** — "burger gujranwala peoples colony" jaisi searches server-side fast + relevant. Abhi search browser me hoti hai (500 rows tak pull).
3. **SEO Area landing pages** — `/area/{city}/{area}` ("Burger shops in Peoples Colony Gujranwala") with live shop lists. Local SEO ka highest-ROI build.
4. **Shop pages ko SSR/ISR convert** — Google ke liye full server HTML + speed (homepage wala pattern copy karo).
5. **Delivery rider system** — rider assignment + delivery status milestones.
6. **Loyalty points / referral program** — customers ko points + merchant referral bonus.
7. **Digital wallet / COD tracking** — order value ledger jo `finances` page se sync ho.
8. **Slug URLs** (`/shop/{slug}`) with 301s — cleaner + keyword-rich links.

---

## 5B. Story Feature — WhatsApp-Style (UPDATED 2026-08-29)

**User decision:** Stories ko poora WhatsApp/Instagram jaisa banana hai — top par stories dikhti rahen, aur nayi story **bottom-nav ke + se** lag sakti hai.

### Jo code me kiya
| Change | File |
|---|---|
| Bottom-nav ka **+ button ab WhatsApp-style action sheet** kholta hai (merchants ke liye): **New Story** sabse upar, phir Add Product, Bulk Add, Add Deal, Add Coupon. Har option quick-add modal ko us tab ke saath kholta hai | `components/BottomNav.tsx` |
| Action sheet backdrop + route badalne par auto-close | `components/BottomNav.tsx` |
| **Story viewer me "Delete my story"** — merchant apni story viewer me hi delete kar sakta hai (confirm ke saath), like WhatsApp status | `components/StoriesViewer.tsx` |
| **Story viewer me time-ago badge** (5m · 2h · 1d) — WhatsApp jaisa | `components/StoriesViewer.tsx` |
| Homepage se `myShopId` StoriesViewer ko pass hota hai taake delete sirf apni stories par aaye | `components/HomeClient.tsx` |
| (Pehle se) Stories unlimited + free; posting par homepage tray instantly refresh (`trendmart:stories-updated` event) | `services/storyService.ts`, `HomeClient.tsx` |

### Story flow (ab kaise chalta hai)
1. Merchant bottom-nav ka **+** dabata hai → action sheet → **New Story**.
2. Story image upload + caption → **Post story**.
3. Story turant homepage ke top par "Your story" ring + public tray me appear hoti hai (24 hours).
4. Viewer me apni story par trash icon → delete.
5. Customer ke liye: tray par unseen ring, viewer me swipe/tap/hold-pause/progress — sab WhatsApp jaisa.

---

## 5C. Products / Images — Cloudinary Block Check (UPDATED 2026-08-29)

### Code me verified — images BLOCKED NAHI hain
- `next.config.ts` → `images.remotePatterns` me `**.cloudinary.com` ✓ (next/image Cloudinary par kaam karta hai).
- CSP (`img-src 'self' data: https: blob:`) → Cloudinary CDN URLs load hote hain ✓.
- Product images `getSafeImageUrl()` + `onError` fallback se render hoti hain ✓.
- Upload: Cloudinary unsigned preset se; agar Cloudinary fail ho to **automatically Supabase Storage par fallback** (merchant ka upload kabhi naheen toota) ✓.

### Aapko ek baar verify karo (dashboard settings)
1. **Cloudinary dashboard** → Settings → Upload → **Unsigned preset** banao aur wo `NEXT_PUBLIC_CLOUDINARY_UPLOAD_PRESET` me daalo (mode = Unsigned, folder allowed).
2. Agar DB me product image URL `supabase.co/storage/...` jaisa hai, to Cloudinary upload fail ho kar fallback use hua hai — preset check karo.
3. Delete ke liye server env: `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY`, `CLOUDINARY_API_SECRET`.
4. Demo/seed images (Unsplash/themealdb) bhi remotePatterns me hain — wo load hoti hain.

> **Note:** Is machine par terminal sandbox na hone ki wajah se `npm run build` nahi chal saka — ye sab changes careful review ke baad likhe hain. Build/test locally zaroor chalao.

---



## 6. Status — Sab Theek Hai?

✅ **Theek / Done:**

- 11 launch-critical fixes applied (upar table).
- Security strong: RLS tenant isolation, orders PII closed, AI crawlers allowed sirf public par, audit trail live, no hardcoded secrets.
- SEO base ready: robots (AI-friendly), sitemap, LocalBusiness + Product schema, OG images, canonical URLs.
- Performance base ready: homepage cache, image pipeline (~100KB WebP), chunk splitting, infinite scroll.

⚠️ **Launch se pehle zaroori (baqi):**

1. `npm run build` + `npm test` chalao locally (is machine par terminal sandbox nahi thi, is liye main verify nahi kar saka — code careful review ke baad likha hai).
2. **Ek authoritative migration set** apni real Supabase project par apply karo (recommend: `RUN_ALL_IN_ONE_20260820.sql` base + naye `2026082X` migrations, including paid-stories removal).
3. **Env vars set karo**: `NEXT_PUBLIC_SITE_URL` (real domain), `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_STORAGE_BUCKET`, `RESEND_API_KEY`, `VAPID` keys, `GOOGLE_MAPS_API_KEY`, `UPSTASH_REDIS_REST_URL/TOKEN`.
4. **Decision**: merchant approval queue — spec strict admin queue chahta hai, lekin launch-hardening migration shops ko instant-live karta hai. Ek choose karo.
5. Admin dashboard ke O(all data) queries ko server-side aggregates par rebuild karo (500+ orders ke baad).

---

*Ye file single source of truth hai — isi ko follow karo.*