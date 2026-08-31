# TrendsMart — Setup & Testing Guide

> Ye guide batati hai ke naya setup (shops, products, images, variants, QR dine-in) kaise add karna hai, kaise test karna hai, aur merchant/customer dono side ka flow kya hai.

---

## 1. Pehli baar setup (naye database par)

### Step 1 — Migration chalao
Supabase Dashboard → **SQL Editor** → `supabase/migrations/20260823000000_dine_in_ordering.sql` ka **pura content paste** karo → **Run**.

Isse banega:
- `dine_in_tables` table (QR tables)
- `orders` mein naye columns (`order_type`, `table_id`, `table_code`, `dine_status`)
- `shops.shop_type` mein `dine_in` value
- 2 secure RPCs (`lookup_dine_table`, `track_dine_order`)

> Migration ke baad QR table system live hoga. Isse pehle `/t/<token>` "inactive" kahega.

### Step 2 — Merchant shop banao
1. `/account/become-merchant` → **Category** choose karo (restaurant ke liye **"Fast Food & Restaurants"**).
2. Shop banao. Products/menu add karo (naam, price, photo — bas itna kaafi hai).
3. Restaurants/cafes ko dashboard mein **"Dine-In"** button dikhega.

### Step 3 — QR Tables setup
1. `/dashboard/tables` → tables add karo (ya "Quick setup" se 5/10/20 ek saath).
2. Har table ka **PDF download** karo → print karo → table par laga do.
3. (Test ke liye) "Link" copy karke phone browser mein kholo.

---

## 2. Products + Images + Variants

### Images
- Merchant product add/edit karte waqt **photo upload** hoti hai (Supabase Storage/Cloudinary — dono allow hain).
- **Naye external image domain** use karo to `next.config.ts` → `images.remotePatterns` mein add karna zaroori hai (warna `next/image` se nahi dikhegi).
- Seed/demo images ke liye TheMealDB (`**.themealdb.com`) already allow hai.

### Variants / Options (Size, Color, Spice, etc.)
Product editor (shop page par **"Edit"**, ya `/dashboard/products`) mein ab **"Options / Variants"** section hai:

1. **Preset tap karo** — Size / Color / Spice Level / Flavour / Portion / Add-ons (ya custom naam likho).
2. **Option add karo** — label (e.g. Large) ke saath do price fields:
   - **Price** = is option ki apni alag price (Daraz-style, e.g. Red shirt = Rs. 650)
   - **+Add** = base price ke upar kitna zyada (e.g. Large = +150)
3. Ek hi screen par **live preview** dikhta hai ke customer ko kya dikhega.

Customer side (storefront **aur** QR dine-in dono mein):
- Options wale item par `+` dabao → sheet khulegi → select karo → price live update → Add.
- Bina options wale item par seedha `+`.

> **Rule:** Absolute price (Daraz) selected option se start hoti hai, baaki `+Add` uske upar. Price hamesha **server-side** calculate hoti hai — customer price set nahi kar sakta.

---

## 3. QR Dine-In Flow (test kaise karein)

```
[MERCHANT]
/dashboard/tables  → tables + QR PDFs
/dashboard/kitchen → order board (accept → preparing → ready → served)

[CUSTOMER — mobile]
QR scan → /t/<token> → table auto-detect ("Table 3") → menu (images + options)
       → items add karo → neeche "Review order" bar → naam daalo → Order Now
       → live tracker (New → Preparing → Ready → Served)

[KITCHEN]
Naya order → turant board par (sound + notification) → Accept/Preparing/Ready/Served
Fake order → Cancel (zero cost)
```

- Dine-in order **in-app** hota hai (WhatsApp nahin). WhatsApp sirf delivery/pickup flow mein hai.
- Customer ka **koi sign-up/OTP nahin** — sirf naam (phone optional). Fake orders se bachao: merchant **Accept** karta hai + per-table 15s cooldown.
- Kitchen board sirf **Fast Food & Restaurants** aur **Bakery & Sweets** ko dikhta hai (category gating).

---

## 4. Seed data (sab categories)

Demo merchant (`abdwhaw99@gmail.com`) ke paas ab **har category ki ek live shop** hai (19 shops), ~105 products images + variants ke saath:

| Category | Shop | Kuch products |
|---|---|---|
| Grocery & Kiryana | Daily Needs Mart | Basmati Rice, Oil, Atta |
| Fruits & Vegetables | Fresh Farm Produce | Tomatoes, Bananas, Mangoes |
| Bakery & Sweets | Crust & Crumb Bakery | Croissant (Size), Gulab Jamun |
| Fast Food & Restaurants | Burger Hub | Zinger (Size), Karahi (Spice), Biryani (Portion) |
| Pharmacy & Medical | WellCare Pharmacy | Panadol, Thermometer, First Aid |
| Fashion & Apparel | Style Avenue | T-Shirt (Size+Color), Kurti (Color), Sneakers (Size) |
| Electronics & Gadgets | Gadget Zone | Earbuds (Color), Smart Watch (Strap), Power Bank |
| Home & Living | Comfort Homes | Cushions (Color), Bed Sheet (Size) |
| Health & Beauty | Glow Beauty Store | Serum (Size), Lipstick (Shade) |
| Books & Stationery | PageTurner Books | Novels, Notebooks |
| Sports & Fitness | PowerFit Sports | Yoga Mat (Thickness), Dumbbells |
| Toys & Baby Care | Little Joys | Blocks, Teddy |
| Automotive | AutoPro Accessories | Mounts, Dash Cam, Seat Covers |
| Handmade & Crafts | CraftKart | Pottery, Bracelets |
| Home Maintenance | FixIt Services | AC Clean, Plumber |
| Security & Surveillance | SecureVue | CCTV, Doorbell, Smart Lock |
| Tech & IT | CodeWorks IT | Websites, PC Repair |
| Personal Services | Prime Services | Salon (Stylist), Tutoring |
| Others | TrendsMart Essentials | Gift Hamper, Bottle (Capacity) |

### Dobara seed karna ho to
Script repo mein nahi rakhi (one-off thi). Dobara chahiye to main wahi script bana kar chala doonga — bas bata dena.

---

## 5. Environment notes

- `.env.local` mein `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` hain (service role key sirf server/scripts ke liye — kabhi client par expose nahi karna).
- `next.config.ts` mein image domains: Supabase, Cloudinary, Unsplash, TheMealDB.
- **Deploy ke baad** images ka change dikhne ke liye redeploy zaroori hai (config files build-time hoti hain).

---

## 6. Checklist — sab kaam ho gaya hai

- [x] Dine-in migration (tables, orders columns, RPCs)
- [x] `/t/<token>` customer scan page (menu + images + variants + order)
- [x] `/orders/<id>?table=<token>` live tracker
- [x] `/dashboard/tables` (bulk add + QR PDF download + pause/delete)
- [x] `/dashboard/kitchen` (realtime board, accept→served, sound)
- [x] Variants (Size/Color/Spice/Flavour/Portion/Add-ons) — customer side + merchant editor
- [x] Daraz-style per-option pricing (server-authoritative)
- [x] Delivery + dine-in dono mein variants
- [x] Category gating (dine-in sirf food categories)
- [x] Seed data: 19 shops, ~105 products, sab images ke saath
