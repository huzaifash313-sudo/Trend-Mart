# TrendsMart POS — SQL migrations (RUN IN ORDER)

Copy-paste each file into **Supabase → SQL Editor → New query → Run**.

Do them **top to bottom**. Safe to re-run (IF NOT EXISTS / additive).

| # | File | What it does |
|---|------|----------------|
| 1 | [`20260322_merchant_pos.sql`](./20260322_merchant_pos.sql) | POS settings JSON, order `source`, stock moves, RLS |
| 2 | [`20260323_pos_barcode_strength.sql`](./20260323_pos_barcode_strength.sql) | Barcode / short_code columns |
| 3 | [`20260324_pos_erp_strength.sql`](./20260324_pos_erp_strength.sql) | Cash sessions, held bills, customers, payment split |
| 4 | [`20260325_pos_stock_heavy.sql`](./20260325_pos_stock_heavy.sql) | Expiry, batch, reorder_level |
| 5 | [`20260326_pos_finance_recipes.sql`](./20260326_pos_finance_recipes.sql) | Cost price, expenses, udhaar credit, recipes/BOM |

## How to run (2 minutes)

1. Open Supabase project → **SQL Editor**
2. Open file #1 in Cursor → **Select all** → Copy
3. Paste in SQL Editor → **Run**
4. Repeat for #2, #3, #4, #5

## After SQL

1. Merchant → Dashboard → **POS / Counter**
2. **Setup** → Enable POS → Pair **Bluetooth** or **USB** printer (optional)
3. Enable **Barcode scan** (optional) → USB wedge or **📷 Scan (Alt+B)**
4. Optional: set **Cost price** on products for profit reports; use **Expenses / Credit / Recipes** modules

## Soft-launch (do NOT expect yet)

- SMS OTP at checkout
- Strict merchant approval queue (still auto-approve)
- Branded SMTP

---

Each migration file below also starts with a `>>> RUN ME` banner comment.
