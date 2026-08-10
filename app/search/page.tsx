import { redirect } from "next/navigation";

/**
 * Legacy /search — marketplace products now live at /products.
 * Preserve query string so old links and CategoryGrid keep working.
 */
export default async function SearchRedirectPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const qs = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (typeof value === "string" && value) qs.set(key, value);
    else if (Array.isArray(value) && value[0]) qs.set(key, value[0]);
  }
  const suffix = qs.toString();
  redirect(suffix ? `/products?${suffix}` : "/products");
}
