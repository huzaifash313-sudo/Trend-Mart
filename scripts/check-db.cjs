const SUPABASE_URL = "https://olbxprailtqjbxmkrbhe.supabase.co";
const KEY = "sb_publishable_oqHUrSoDggpaZUBpsGQ9hg_daavN2NK";
const opts = { headers: { apikey: KEY, Authorization: `Bearer ${KEY}` } };

const select = `id,shop_id,name,title,price,original_price,compare_at_price,deal_expires_at,currency,image_url,images,is_available,stock_status,category_id,sub_category_id,created_at,short_code,variants,price_tiers,orders_count,click_count,shops!inner(id,name,logo_url,whatsapp_number,category,is_live,verification_status,latitude,longitude,location,service_radius_km,delivery_zones,avg_rating,review_count,free_delivery_threshold,announcement,announcement_expires_at,delivery_fee_flat,delivery_fee_per_km)`;

async function main() {
  const url = `${SUPABASE_URL}/rest/v1/products?select=${encodeURIComponent(select)}&shops.is_live=eq.true&shops.verification_status=eq.approved&is_available=eq.true&order=created_at.desc&offset=0&limit=48`;
  const res = await fetch(url, opts);
  const text = await res.text();
  console.log("status:", res.status);
  console.log(text.slice(0, 300));
}
main().catch((e) => console.log("ERR", e.message));
