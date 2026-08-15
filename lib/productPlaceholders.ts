/* Category-aware product name placeholder examples.
 *
 * Merchants shouldn't see a generic / irrelevant example (e.g. "Factory ERP
 * System") when adding a product — the hint should match their store category
 * so the "Add Product" form feels native to their business.
 */

const CATEGORY_EXAMPLES: Record<string, string> = {
  "Grocery & Kiryana": "e.g. Rice 5kg Bag",
  "Fruits & Vegetables": "e.g. Fresh Tomatoes 1kg",
  "Bakery & Sweets": "e.g. Chocolate Cake 1lb",
  "Fast Food & Restaurants": "e.g. Chicken Biryani",
  "Pharmacy & Medical": "e.g. Panadol 500mg Tablets",
  "Fashion & Apparel": "e.g. Premium Cotton Kurti",
  "Electronics & Gadgets": "e.g. Wireless Earbuds",
  "Home & Living": "e.g. Bedsheet Set (King)",
  "Health & Beauty": "e.g. Face Cream 50ml",
  "Books & Stationery": "e.g. Notebook Pack of 3",
  "Sports & Fitness": "e.g. Non-slip Yoga Mat",
  "Toys & Baby Care": "e.g. Baby Diapers (Medium)",
  "Automotive Accessories": "e.g. Car Phone Holder",
  "Handmade & Crafts": "e.g. Handmade Wall Art",
  "Home Maintenance & Repair": "e.g. Plumbing Repair Service",
  "Security & Surveillance": "e.g. CCTV Camera (2MP)",
  "Tech & IT Services": "e.g. Business Website Design",
  "Personal & Professional Services": "e.g. AC Cleaning Service",
};

const FALLBACK_EXAMPLE = "e.g. Your Product Name";

/** Return a relevant example product name for a store category. */
export function getProductNamePlaceholder(category?: string | null): string {
  const key = (category ?? "").trim();
  return CATEGORY_EXAMPLES[key] ?? FALLBACK_EXAMPLE;
}
