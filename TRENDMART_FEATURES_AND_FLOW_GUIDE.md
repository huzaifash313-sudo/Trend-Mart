# TrendMart — Poora App Ka Simple Guide (Features, Flow aur Policies)

> Yeh file bilkul simple aur asaan zuban mein likhi gayi hai. Koi bhi isay parh kar samajh sakta hai ke TrendMart kya karta hai, kaise kaam karta hai, aur kya kya features hain. Technical baatein isme nahi hain — sirf app ka kaam aur flow.

---

## 1. TrendMart kya hai?

TrendMart ek **hyper-local multi-vendor marketplace** hai — matlab ek app jisme bahut saare local shops/dukanen (grocery, food, boutique, electronics, cosmetics waghera) apna online store bana sakti hain, aur customers apne ilaqay ke qareeb ki dukano se products browse kar ke **WhatsApp ke zariye order** kar sakte hain.

**Sabse bari baat:** Payment app ke andar nahi hoti. Order WhatsApp par merchant ko jata hai, aur paisa **delivery ke waqt cash / bank transfer** hota hai. Isliye ise "WhatsApp Ordering System" kehte hain.

**Kaun kaun is app ko use karta hai?**

| Role | Kaun hai | Kya kar sakta hai |
| --- | --- | --- |
| Guest (bina login) | Koi bhi aane wala | Browse, search, cart me items daalna |
| Customer | Login kiya hua user | Order place karna, tracking, wishlist, reviews |
| Merchant | Dukan ka malik | Apni dukan online banana, products daalna, orders dekhna |
| Super-Admin | Platform ka owner | Sab kuch manage karna (users, shops, orders, ads) |

---

## 2. App ke 4 Log (Roles) ka poora kaam

### A. Guest (bina sign-up)
- Website kholte hi sab kuch dekh sakta hai — koi verification nahi chahiye.
- Cart me items daal sakta hai (phone me save rehta hai).
- Lekin **order place karne ke liye login + email verify zaroori** hai.

### B. Customer
- **Sign up** karta hai (name, phone, email, password) → **email par 6-digit OTP** aata hai → verify karta hai.
- Checkout par uski naam/phone/address **auto-fill** hoti hai (profile me save hoti hai).
- Apna order WhatsApp par bhejta hai, phir **live tracking** se dekh sakta hai.
- Wishlist (favorites), reviews, saved addresses, order history — sab available.

### C. Merchant (Dukandar)
- "Become Merchant" se apni dukan register karta hai (name, category, phone, location, WhatsApp number).
- Email verified hone ke baad dukan **foran live** ho jati hai (auto-approve).
- **Dashboard** me se: products daalna, deals/coupons, orders desk, analytics, ads, QR code, dine-in tables, leads/inquiries.
- Delivery radius aur fees khud set karta hai.

### D. Super-Admin
- Alag admin panel: **Approve/reject merchants**, sab users aur shops ka control, global analytics (revenue, active shops), categories manage, ad plans, support tickets ka inbox, audit logs.

---

## 3. Customer ka poora safar (Homepage se Order tak)

```
Homepage → Shop/Product milna → Cart me daalna → Checkout (WhatsApp modal)
        → Email verify → Details bharo → Confirm → Order server par save
        → WhatsApp par merchant ko order message → Tracking
```

**Step-by-step:**

1. **Homepage** kholte hi:
   - Upar horizontally scroll hone wale **category pills** (Food, Grocery, Boutique...) — jo categories aap zyada dekhte hain wo pehle aati hain (category affinity).
   - **Stories tray** — shops ki 24-ghante ki active stories (WhatsApp/Instagram jaisi), tap karne par full-screen viewer.
   - **Sponsored ads carousel** — paise de kar lagaye gaye banner.
   - **"Recently Viewed"** — jo aapne pehle dekha, dobara dikhata hai.
   - **Live Shops grid** — qareeb ki dukanen, distance, rating, offer ticker, wishlist heart ke sath.
   - **Geo filter** — "Nearest / This city / All Pakistan" ka scope control.

2. **Shop ki profile** (`/shop/[id]`): banner, opening hours, offers ticker (marquee), deals strip, coupons, product grid (searchable), reviews.

3. **Product** par click → Quick View / product page. Variant wale products (size/color waghera) pehle option pick karwate hain.

4. **Cart** (`/cart`): items **shop ke hisab se group** hote hain. Har shop ka alag "Order via WhatsApp" button. Quantity change, note, tier pricing (zayada quantity = sasta) sab yahan handle hota hai.

5. **Checkout (WhatsAppCheckoutModal)** — 4 steps:
   - **Auth gate**: Pehle check karta hai ke aap signed-in aur email-verified ho. Agar nahi to login/signup par bhejta hai, aur login ke baad checkout wapas resume hota hai.
   - **Step 1 — Review**: Delivery ya Pickup (jo bhi shop ne enable kiya), quantities, coupon code field (agar shop ka coupon hai), subtotal, delivery fee, grand total. Guards: minimum order amount, shop band hai, radius ke bahar hai, to order button block hota hai.
   - **Step 2 — Shipping details**: Naam, phone (Pakistani format), address (delivery ke liye zaroori), notes. Profile se auto-fill hota hai. GPS se exact location bhi le sakte hain (maps pin).
   - **Step 3 — Confirm**: Poora order summary → **"Send via WhatsApp"** button.
   - **Step 4 — Success**: WhatsApp tab khulta hai jisme formatted order message bana hua hota hai, sirf "Send" dabana hota hai.

6. **Order ka result:** Order pehle **server (database) par save** hota hai (Pending status), phir WhatsApp khulta hai. Merchant ko **notification** milti hai, customer ko tracking link milta hai.

7. **Tracking** (`/orders/tracking`): Order ka status **Pending → Processing → Dispatched → Delivered** (ya Cancelled). Customer apna order live dekh sakta hai — color-coded timeline, realtime updates.

---

## 4. WhatsApp Order kaise kaam karta hai? (Zaroori samajhna)

- Har shop ka apna **WhatsApp number** hota hai. Order usi par jata hai — platform ke beech me nahi aata.
- App cart ko ek **khubsurat formatted message** me compile karti hai:
  - Shop ka naam, order type (Delivery/Pickup), order reference
  - Har item: naam, variant, quantity x price, total (agar discount hai to "Was" price bhi)
  - Subtotal, coupon discount, delivery fee, grand total
  - Customer ka naam, phone, address, **Google Maps live pin**
  - Ek **public order link** jo customer aur merchant dono dekh sakte hain (customer ki personal info ke baghair — sirf items aur total)
- **Important:** WhatsApp khud send nahi hota — app message taiyar karti hai, customer sirf "Send" dabata hai. (Ye FAQ me bhi clearly bataya gaya hai.)

---

## 5. Merchant (Dukandar) ka poora safar

```
Become Merchant → Email verify → Shop create (auto-live) → Dashboard
   → Products add (fast) → Deals/Coupons → Orders desk → Kitchen (agar restaurant)
   → Analytics/Finances → Ads → QR codes → Leads/Inquiries
```

### Products ka kaam
- **3 tareeqe**: Full editor (`/dashboard/products`), Batch creator (bulk), Quick Add modal (har page par).
- **4 basic fields**: Naam, Category, Price, Image. (Rules me likha tha ultra-fast form.)
- **Original Price + Discounted Price**: Merchant original price dalta hai (jis par strike/cross dikhta hai) aur discounted price. App khud **"-6% OFF" jaisa badge** dikhati hai.
- **In Stock / Out of Stock toggle**: Har product par ek button se foran pause/resume bina delete kiye.
- **Bulk actions**: Sab ko out-of-stock karo, bulk discount (e.g. 10% off), bulk delete.
- **CSV import/export**: Excel jaisi file se products daalna aur nikalna.
- **Variants**: Size, Color, Flavour, Portion waghera — har option ka alag price, stock, discount.
- **Price Tiers / Packs**: "6 = Rs 1100" (pack mode) ya "6+ = Rs 183 each" (unit mode).
- **Images**: Upload karte hi **compress aur WebP** me convert hoti hain (~100KB), taake fast load hon aur free storage me lamba chalein.

### Deals (Offers)
- Alag se **shop deals** bana sakta hai with schedules:
  - **Weekly**: har hafte ke khaas din (e.g. Monday offer)
  - **Date range**: e.g. 14 Aug se 20 Aug
  - **Monthly**: har month ki khaas tarikh
- Deal par **badge text** (e.g. "Buy 1 Get 1"), image, featured pin, discount price.

### Coupons
- Code-based discount (markdown pricing se alag). Percent ya flat amount, minimum order, expiry, usage limit. Customer checkout par code lagata hai, app validate karti hai.

### Orders Desk (`/dashboard/orders`)
- Naye order aate hi **live notification + sound** bajta hai.
- Status pills (Pending/Processing/Dispatched/Delivered/Cancelled) with counts, search.
- Har order par: **Bill** (printable), **WhatsApp** button (customer se baat), status change.
- Status change par customer ko **notification** jati hai.

### Dine-In (Restaurant / Bakery wale)
- Merchant **tables** banata hai, har table ka **QR code** hota hai.
- Customer QR scan karta hai → **bina sign-up ke** table ka menu dekhta hai → order karta hai.
- **Kitchen board**: orders live group by table. One-tap **Accept → Preparing → Ready → Served**.
- **Manual order** bhi daal sakta hai (walk-in customer ke liye, staff se).

### Delivery Radius & Fees (Delivery Slabs)
- Merchant apna **service radius** set karta hai: 3km, 5km, 10km... ya whole city, ya whole Pakistan.
- **Minimum order amount** (kam order place na ho).
- **Free delivery threshold** (e.g. Rs 2000 se upar delivery free).
- **Delivery fee**: fixed (flat) + per-km (distance ke hisab se).
- Jo customer radius ke bahar hai usse order hi nahi karne diya jata.

### Analytics & Finances
- Revenue, orders, avg order value, unique customers (7/30/90 days).
- Top products, orders per day, lead sources, top-clicked products.
- **Finances**: manual income/expense ledger (WhatsApp Order, Walk-in Sale, Rent...), net profit, pending payments.
- Sab **CSV/PDF export** (bills, invoices, inventory, sales summary).

### Ads (Paid Promotions)
- Merchant **ad plan** pick karta hai (duration + price), banner upload karta hai.
- Admin **approve/reject** karta hai (khud approve nahi kar sakta — system block karta hai).
- Approved ad homepage par **sponsored carousel** me dikhti hai, with **views/clicks** counters.

### Subscriptions (Tiers)
- **Free Trial**: 14 din, 0 PKR, 10% commission, 25 products, 100MB.
- **Starter**: Rs 1,999/month, 7% commission, 100 products.
- **Pro**: Rs 4,999/month, 5% commission, 500 products, 2GB.
- **Enterprise**: Rs 14,999/month, 3% commission, 5000 products, 10GB.
- Har month platform **billing invoice** banata hai (fee + commission). Suspended shop public se hidden ho jati hai.

### QR Codes
- Har shop ka apna **QR code** (downloadable, print-ready PNG) — flex/stand par lagao, customer scan kare to seedha shop khul jaye.
- Dine-in tables ke QR bhi (A6 print-ready PDF).

### Leads & Inquiries
- Customer WhatsApp/booking par click kare to **lead** record hoti hai (source ke sath). Merchant convert/unconvert mark kar sakta hai.
- **Inquiries inbox**: customers ke messages.

### Audit & Safety
- **Audit logs**: platform par har admin action record.
- **One shop per account** rule.
- Sensitive info (WhatsApp number waghera) **7 din me sirf ek baar** change ho sakti hai.

---

## 6. Super-Admin Panel ka kaam

Ek hi page par 8 tabs:
1. **Overview** — platform metrics: total merchants, orders, revenue, pending verifications, 14-din ka revenue trend chart, live transaction feed.
2. **Approvals** — pending merchants approve/reject (email notification bhi jati hai).
3. **Merchants** — sab shops, search/filter, suspend/reactivate, delete, drill-down (QR, products, orders).
4. **Users** — sab customers, roles, order counts, **ban/unban** (banned user ko suspension page dikhta hai).
5. **Orders** — poori platform ki orders, global search.
6. **Categories** — sub-categories add/active-deactivate.
7. **Ads** — sab ad requests approve/reject (reason ke sath), ad plans CRUD (price/duration), platform-wide ads.
8. **Transactions** — live feed.

Plus **Support Inbox** (tickets resolve karna, admin reply) aur **Audit Logs**.

---

## 7. Har Feature ki Choti-Choti Explanation

| Feature | Kya hai |
| --- | --- |
| **Stories** | Shops ki 24hr wali photos/videos tray. Free merchant = 1 story, Pro = 10. |
| **Fuzzy Search** | Ghalat spelling / Roman Urdu bhi samajh jati hai. e.g. "zinger" search karo to "burger" bhi milega, "cheeni" to "sugar". |
| **For You Feed** | Popularity + discount + freshness + rating se products rank hote hain. Ek hi shop se zyada items top par nahi aate (fairness/round-robin). |
| **Nearest Sort** | Customer ki location se distance ke hisab se sort. |
| **Popularity** | Products par orders_count, clicks, rating, reviews ka combined score. |
| **Category Affinity** | Jo category aap zyada browse karte ho, wo homepage par pehle aati hai. |
| **Recently Viewed** | Wapas "pick up where you left off". |
| **Wishlist** | Guest ka local, logged-in ka database me sync. Bottom nav par count badge. |
| **Reviews** | Sirf wohi likh sakta hai jisne **Delivered** order kiya ho (verified purchase). Merchant reply kar sakta hai. Owner apni shop par review nahi kar sakta. |
| **Notifications** | 3 types: in-app bell (realtime), Web Push (browser), Email (branded, Resend se). Order/status/support ticket par khud notify hoti hain. |
| **PWA** | "Add to Home Screen" se app jaise chalti hai, offline page, push notifications. |
| **Theme Engine** | Dark/Light mode, font size slider (14–20px), grid layout options, card style. |
| **Support Desk** | Public form → ticket ban jata hai, admin inbox me aata hai, email confirmation jati hai. |
| **AI Chat Widget** | Rule-based assistant jo pricing/hours/location/order ke sawalon ke jawab deta hai. |
| **Announcements** | Shop ka banner (offer/announcement) with expiry, homepage card par ticker. |
| **Offline** | Network kharab hone par offline page + cart local rehta hai. |

---

## 8. Policies aur Rules (App ke Andar)

- **Terms & Conditions, Privacy Policy, Merchant Security Guidelines, Refund Policy** — sab dedicated pages par.
- **Registration ke waqt acceptance**: Customer signup par Terms + Privacy accept karta hai (record hota hai). Merchant guidelines bhi checkbox.
- **Versioning**: Agar policies update hon to purane users ko dobara accept karne ka prompt.
- **Refund Policy**: Order cancel, merchant-side refunds, damaged item 24hr window, non-returnable items, disputes.
- **Merchant Security Guidelines**: account security, listing integrity, radius honesty, upload rules.
- **Review rules**: sirf delivered order ke baad, ek user ek shop par ek review.
- **Banned users**: platform se block, `/banned` page par suspension notice.
- **Rate limiting**: OTP/forms par spam se bachne ke liye limits (e.g. OTP sirf 5 attempts).

---

## 9. Jo Cheezein Missing / Half Hain (Suggestions)

Yeh wo chizein hain jo ya to bani nahi ya abhi complete nahi — agar koi pooche to yehi jawab hai:

**Missing features:**
1. **Phone OTP** — sirf email OTP hai. Phone verification future me. (Rules me chahiye tha.)
2. **Payment Gateway** — koi online payment nahi (JazzCash/Easypaisa/COD). WhatsApp-first design hai.
3. **Tax (GST 17%)** — code ready hai (taxService) lekin checkout me apply nahi hota. Abhi math: subtotal - coupon + delivery fee.
4. **Cart sirf device par** — server-side cart nahi. Dosri device par cart nahi aati. (Order DB me saved hota hai.)
5. **Live GPS store-level proximity** — shop ka pin + radius filter hai, lekin street-level exact "kitne km mein" wali sorting abhi mehenga verification nahi hai. Google Maps exact pin optional hai.
6. **Sentry full SDK** — sirf config shim hai, real error tracking errorService + audit logs se hota hai.
7. **Subscription UI** — backend tayyar hai, merchant dashboard me upgrade UI zyada wired nahi.
8. **Admin approval queue** — design me "strict queue" hai lekin abhi **auto-approve** hota hai (new store email verify hote hi live). Approval tab fallback ke taur par hai.
9. **WhatsApp message auto-send** — message ready hota hai, customer khud send karta hai (WhatsApp API integration nahi).
10. **Order tracking ke 2 paths** — purana `/orders` (phone se) aur naya `/orders/tracking` (login ke sath). Naya wala strict hai.

**Suggestions (agar aage kaam ho to):**
- Phone OTP (Twilio) checkout par mandatory verification.
- Payment gateway integration (COD + JazzCash).
- Server-side cart sync (logged-in users ke liye).
- WhatsApp Business API (auto-send + order status messages).
- Live order tracking map (merchant ki delivery boy GPS).
- Super-admin ko subscription management tab.
- Email ke liye custom SMTP (Resend already hai, bas polish).
- Product search par server-side full-text (mehngi queries ke liye).

---

## 10. 30-Second Summary (Agar koi pooche "TrendMart kya hai?")

> "TrendMart ek hyper-local marketplace hai jahan local shops apni dukan online bana leti hain. Customer qareeb ki dukan se products dekh kar WhatsApp ke zariye order karta hai — payment delivery par hoti hai. App me guest browsing, email-OTP signup, geo radius filters, fuzzy search, deals/coupons/discounts, merchant dashboard (products, orders, kitchen/dine-in, analytics), ads, QR codes, subscriptions, aur ek super-admin panel hai. Backend Supabase par hai jisme proper security (RLS) aur realtime notifications hain."

---

*Yeh file app ke features aur flow ki non-technical explanation hai. Technical details ke liye `TRENDMART_TECHNICAL_INTERVIEW_GUIDE.md` dekhen.*
