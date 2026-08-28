/* Simple, clear product name placeholder used across the product forms. */

/** Return a simple product name placeholder. */
export function getProductNamePlaceholder(_category?: string | null): string {
  void _category; // reserved for future category-aware placeholders
  return "Product name";
}
