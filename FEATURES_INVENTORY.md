# 🧾 TrendMart — Features Inventory (Kya Hai / Kya Nahi Hai)

> **Status note:** This inventory is historical and is superseded for current status by the live codebase and `.cursorrules` requirements. Current operational rules: phone SMS OTP is disabled (email verification only), merchants are auto-approved/live on store creation, and product stock is strictly In Stock / Out of Stock only (no numeric stock counts).

> Last updated: 8 April 2026  
> Status after: Day 1 (DB Schema) + Day 2 (Home & Shop Detail) + Day 3 (Auth & Dashboard) + Day 4 (Production Polish)

---

## 📊 SUMMARY TABLE — Everything at a Glance

| # | Feature | Status | Frontend | Backend | Auth | Notes |
|---|---|---|---|---|---|---|
| 1 | Database Schema (shops + products) | ✅ DONE | N/A | SQL ready | RLS policies ready | Run `schema.sql` + `auth-schema.sql` in Supabase |
| 2 | Home Page — Browse Shops | ✅ DONE | ✅ | ✅ | ⬚ Public | Sticky header, search, categories, stories, shop cards |
| 4 | Home Page — Search Bar | ✅ DONE | ✅ | ✅ | ⬚ Public | Filters by shop name & category |
| 5 | Home Page — Category Filter Pills | ✅ DONE | ✅ | ✅ | ⬚ Public | All, Food, Grocery, Boutique, Electronics, Cosmetics |
| 6 | Home Page — Stories Tray | ⚠️ PARTIAL | ✅ UI only | ❌ Hardcoded | ⬚ Public | 6 placeholder stories, NO add/edit/delete |
| 7 | Home Page — Shop Cards Grid | ✅ DONE | ✅ | ✅ Supabase | ⬚ Public | Links to `/shop/[id]`, WhatsApp button |
| 8 | Shop Detail Page (`/shop/[id]`) | ✅ DONE | ✅ | ✅ Supabase | ⬚ Public | Shop info + product catalog + WhatsApp per product |
| 9 | WhatsApp Ordering | ✅ DONE | ✅ | ✅ (phone from DB) | ⬚ Public | `wa.me` deep-link with pre-filled message |
| 10 | Authentication — Sign Up | ✅ DONE | ✅ `/auth` | ✅ Supabase Auth | ✅ Email+Password | Email confirmation supported |
| 11 | Authentication — Sign In | ✅ DONE | ✅ `/auth` | ✅ Supabase Auth | ✅ Session cookie | Redirects to `/dashboard` |
| 12 | Authentication — Sign Out | ✅ DONE | ✅ Dashboard header | ✅ | ✅ | `signOut()` + redirect to `/auth` |
| 13 | Auth Callback (Email Confirm) | ✅ DONE | ✅ `/auth/callback` | ✅ | ✅ | Exchanges code for session |
| 14 | Session Middleware | ✅ DONE | N/A | ✅ `middleware.ts` | ✅ Cookie refresh | `@supabase/ssr` |
| 15 | Protected Merchant Dashboard | ✅ DONE | ✅ `/dashboard` | ✅ | ✅ | Redirects unauthenticated to `/auth` |
| 16 | Create New Shop (Dashboard) | ✅ DONE | ✅ Form | ✅ Insert | ✅ RLS | Name, category, location, WhatsApp, logo URL, live toggle |
| 17 | Edit Shop Details (Dashboard) | ✅ DONE | ✅ Form | ✅ Update | ✅ RLS | Same fields, owner-only |
| 18 | Add Product (Dashboard) | ✅ DONE | ✅ Form | ✅ Insert | ✅ RLS | Name, description, price, image URL, availability |
| 19 | Edit Product (Dashboard) | ✅ DONE | ✅ Form populates | ✅ Update | ✅ RLS | "Edit" button + "Cancel" |
| 20 | Delete Product (Dashboard) | ✅ DONE | ✅ Trash icon | ✅ Delete | ✅ RLS | Confirm dialog + optimistic remove |
| 21 | Product List in Dashboard | ✅ DONE | ✅ Compact rows | ✅ Fetch | ✅ RLS | Thumbnail, name, price, status |
| 22 | Shop Live Toggle | ✅ DONE | ✅ Checkbox | ✅ Update | ✅ RLS | Controls visibility on homepage |
| 23 | `is_live` badge on Shop Cards | ✅ DONE | ✅ Red "LIVE" pulse badge | ✅ Read from DB | ⬚ Public | |
| 24 | Dark Mode | ✅ DONE | ✅ All pages | N/A | N/A | Tailwind `dark:` classes everywhere |
| 25 | Mobile Responsive | ✅ DONE | ✅ All pages | N/A | N/A | `sm:`, `lg:` breakpoints |
| 26 | Loading States (Skeletons) | ✅ DONE | ✅ All pages | N/A | N/A | Animated pulse placeholders |
| 27 | Error States | ✅ DONE | ✅ All pages | N/A | N/A | Retry / Go back buttons |
| 28 | Empty States | ✅ DONE | ✅ All pages | N/A | N/A | Friendly messages |
| 29 | TypeScript | ✅ DONE | ✅ 0 errors | ✅ | N/A | `npx tsc --noEmit` passes |
| 30 | Production Build | ✅ DONE | ✅ | ✅ | ✅ | `npm run build` — 7 routes, 811ms |
| 31 | Vercel Deploy Ready | ✅ DONE | N/A | N/A | N/A | Just need env vars |

---

## ❌ MISSING FEATURES — Not Yet Implemented

| # | Feature | What's Missing |
|---|---|---|
| 1 | **Auth Button on Homepage** | Home page (`/`) mein koi "Sign In" ya "Dashboard" ka button nahi hai. User ko manually `/auth` type karna parega. |
| 2 | **Navigation / Bottom Tab Bar** | Mobile app jaisa koi bottom navigation nahi hai — Home, Search, Dashboard, Profile tabs missing. |
| 3 | **Story CRUD** | Stories section mein 6 hardcoded placeholder hain. Merchant story add/edit/delete nahi kar sakta. Koi `stories` table bhi nahi hai database mein. |
| 4 | **Admin Panel** | Koi admin panel nahi hai — no user management, no shop approval, no analytics, no reports. |
| 5 | **Settings Page** | Merchant apna password change nahi kar sakta, profile update nahi kar sakta (sirf shop details). |
| 6 | **Order Management** | Orders ka koi table nahi hai. WhatsApp ke through order hota hai lekin koi order tracking system nahi. |
| 7 | **Notifications** | No push notifications, no email notifications for new orders. |
| 8 | **Image Upload** | Sirf URL-based images hain. File upload (Supabase Storage) integrated nahi hai. |
| 9 | **Search Results Page** | Search sirf home page par filter karta hai, koi dedicated search results page nahi hai. |
| 10 | **Pagination / Infinite Scroll** | Shops aur products ki pagination nahi hai. Agar 100+ shops ho jayen to sab ek hi page par load hongi. |
| 11 | **Shop Slug / SEO URLs** | Shop URLs `/shop/[uuid]` hain, human-readable slug nahi hai (jaise `/shop/freshbites`). |
| 12 | **Product Categories** | Products ki apni category nahi hai — sirf shop ki category hai. |
| 13 | **Shopping Cart** | Koi cart system nahi hai — har product individually WhatsApp par order hota hai. |
| 14 | **Favorites / Wishlist** | Koi favorite shops ya wishlist feature nahi hai. |
| 15 | **Ratings & Reviews** | Shops aur products ki rating/review ka system nahi hai. |
| 16 | **Merchant Registration Flow** | Merchant sign up karta hai → dashboard empty dikhta hai → manually shop create karta hai. Koi guided onboarding wizard nahi hai. |
| 17 | **Multi-Shop per Merchant** | Ek merchant sirf ek shop bana sakta hai (owner_id UUID hai, array nahi). |
| 18 | **Analytics Dashboard** | Koi views, clicks, orders count nahi dikhta merchant ko. |
| 19 | **Profile Page** | Merchant ki apni profile (name, email, avatar) edit nahi kar sakta. |
| 20 | **Footer** | Koi footer nahi hai — about, contact, privacy policy, terms pages missing. |

---

## 🧭 CURRENT NAVIGATION FLOW (User Journey)

```
🏠 Home (/) — PUBLIC
│
├── 🔍 Search Bar — filters shops by name/category
├── 🏷️  Category Pills — Food, Grocery, Boutique, Electronics, Cosmetics
├── 📖 Stories Tray — 6 static placeholders (NOT dynamic)
├── 🛍️  Shop Cards Grid
│   ├── 🖱️  Click card banner/name → /shop/[id] (Shop Detail)
│   └── 📞 WhatsApp Button → wa.me link (direct order)
│
├── (No "Sign In" link anywhere on homepage ❌)
│
└── 🚪 (User must manually type /auth in browser to sign in ❌)

🔐 /auth — PUBLIC
│
├── Sign In Form → Success → Redirect to /dashboard
├── Sign Up Form → Email confirmation → /auth/callback → /dashboard
└── Toggle between Sign In / Sign Up

📊 /dashboard — PROTECTED (must be logged in)
│
├── 🔓 Sign Out button (top right)
├── 🏪 Shop Form (Create or Edit)
│   ├── Shop Name
│   ├── Category (dropdown: Food/Grocery/Boutique/Electronics/Cosmetics)
│   ├── Location
│   ├── WhatsApp Number
│   ├── Logo URL
│   └── ☑️  is_live Toggle
│
├── 📦 Add Product Form
│   ├── Product Name
│   ├── Description
│   ├── Price (PKR)
│   ├── Image URL
│   └── ☑️  is_available Toggle
│   └── (Edit mode: Update Product + Cancel buttons)
│
└── 📋 Product List
    ├── Each row: Thumbnail | Name | Price | Status | [Edit] [🗑️ Delete]
    └── Empty state: "No products yet" with icon

🛒 /shop/[id] — PUBLIC
│
├── ← Back button
├── Shop Info Banner (name, category, location, LIVE badge)
├── 📞 "Chat on WhatsApp" button (shop-level)
└── 📦 Products Grid
    └── Each card: Image | Name | Description | Price | [Order Now via WhatsApp]
```

---

## 🎯 WHAT A MERCHANT CAN DO TODAY (Full Flow)

1. Type `/auth` in browser → Sign Up with email/password
2. Check email → Click confirmation link → Redirected to `/dashboard`
3. **Create Shop**: Fill form (name, category, location, WhatsApp, logo URL, live toggle) → Click "Create Shop"
4. **Add Products**: Fill product form (name, description, price, image URL, availability) → Click "Add Product"
5. **Edit Products**: Click "Edit" on any product → Modify fields → Click "Update Product" or "Cancel"
6. **Delete Products**: Click trash icon → Confirm dialog → Product removed
7. **Toggle Shop Live**: Check/uncheck "is_live" → Click "Update Shop"
8. **Sign Out**: Click "Sign out" in header → Redirected to `/auth`
9. Go to Homepage (`/`) → See your shop (if `is_live = true`) → Customers can browse and order via WhatsApp

---

## 🎯 WHAT A CUSTOMER CAN DO TODAY

1. Visit `/` → See live shops grid
2. Search by shop name or category
3. Filter by category pill
4. View stories (static placeholders)
5. Click shop card → `/shop/[id]` → See all products
6. Click "Order via WhatsApp" on any shop card or product → Opens WhatsApp with pre-filled message
7. Toggle dark mode (if system preference is dark)

---

## 🚨 WHAT'S URGENTLY MISSING (Should Be Next)

| Priority | Feature | Reason |
|---|---|---|
| 🔴 P0 | **Auth/Sign In button on Homepage** | Users can't discover authentication — `/auth` ke baare mein kisi ko pata nahi |
| 🔴 P0 | **Bottom Navigation / Tab Bar** | Mobile-first platform hai lekin koi navigation nahi |
| 🟠 P1 | **Story CRUD (stories table + merchant upload)** | "Stories" feature incomplete hai — placeholder data useless |
| 🟠 P1 | **Image Upload (Supabase Storage)** | Right now sirf URL paste kar sakte hain — merchants ke liye mushkil |
| 🟡 P2 | **Order History Table** | WhatsApp orders ka koi record nahi — analytics impossible |
| 🟡 P2 | **Pagination** | Shops/Products zyada hone par performance degrade hogi |
| 🟢 P3 | **Admin Panel** | Kisi ko approve/reject shops, manage users nahi kar sakta |
| 🟢 P3 | **SEO URLs (slugs)** | `/shop/uuid` instead of `/shop/freshbites` |
| 🟢 P3 | **Ratings & Reviews** | Social proof ke liye zaroori |

---

## 📁 FILE STRUCTURE (Current)

```
trendmart/
├── app/
│   ├── auth/
│   │   ├── page.tsx                  ✅ Sign In / Sign Up page
│   │   └── callback/route.ts         ✅ Email confirmation handler
│   ├── dashboard/
│   │   └── page.tsx                  ✅ Merchant dashboard (shop + product CRUD)
│   ├── shop/
│   │   └── [id]/
│   │       └── page.tsx              ✅ Public shop detail + product catalog
│   ├── layout.tsx                    ✅ Root layout (metadata, fonts, theme)
│   ├── page.tsx                      ✅ Home page (search, categories, stories, shops)
│   ├── favicon.ico
│   └── globals.css                   ✅ Tailwind v4 + CSS variables
├── lib/
│   ├── supabase.ts                   ✅ Legacy Supabase client (still used by page.tsx, shop/[id])
│   └── supabase/
│       ├── client.ts                 ✅ Browser client (@supabase/ssr)
│       ├── server.ts                 ✅ Server client (@supabase/ssr)
│       └── middleware.ts             ✅ Session refresh helper
├── middleware.ts                     ✅ Root middleware (cookie refresh)
├── supabase/
│   └── migrations/
│       ├── schema.sql                ✅ Shops + Products tables, indexes, RLS (public read)
│       └── auth-schema.sql           ✅ owner_id column + owner-based write RLS policies
├── scripts/                            (removed — seed scripts deleted)
├── next.config.ts                    ✅ Image remote patterns
├── tsconfig.json                     ✅ Path alias @/ → ./
├── package.json                      ✅ Next 16.3, React 19, Supabase, Tailwind v4, @supabase/ssr
├── .gitignore                        ✅ Excludes .env*, .next, node_modules
├── .env.local                        ✅ Supabase URL + Anon Key (gitignored)
├── FEATURES_INVENTORY.md             ✅ THIS FILE — complete feature audit
└── README.md                         ✅ Original boilerplate (needs update)
```

---

## 🏁 VERDICT

| Question | Answer |
|---|---|
| **Kya merchant apna store bana sakta hai?** | ✅ **Haan** — Sign Up → Dashboard → "Create Shop" form → Add Products → Toggle Live |
| **Kya admin panel hai?** | ❌ **Nahi** — No admin panel exists |
| **Kya product add/edit/delete kar sakte hain?** | ✅ **Haan** — Full CRUD in `/dashboard` |
| **Kya story add kar sakte hain?** | ❌ **Nahi** — Stories are hardcoded placeholders |
| **Kya auth ka button hai homepage par?** | ❌ **Nahi** — `/auth` manually type karna padta hai |
| **Kya settings page hai?** | ❌ **Nahi** — No settings/profile page |
| **Kya orders track kar sakte hain?** | ❌ **Nahi** — WhatsApp redirect hai, koi order system nahi |
| **Kya image upload kar sakte hain?** | ❌ **Nahi** — Sirf URL paste kar sakte hain |
| **Kya production ready hai?** | ⚠️ **Partially** — Core flow works, but missing nav, story system, image upload, orders |