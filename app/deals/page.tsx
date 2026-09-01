import type { Metadata } from "next";
import DealsPageClient from "./DealsPageClient";
import { buildDealsListingMetadata } from "@/lib/seo/listingMetadata";

type PageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

function pickParam(
  value: string | string[] | undefined,
): string | undefined {
  if (typeof value === "string") return value;
  if (Array.isArray(value) && value[0]) return value[0];
  return undefined;
}

export async function generateMetadata({
  searchParams,
}: PageProps): Promise<Metadata> {
  const params = await searchParams;
  return buildDealsListingMetadata({
    q: pickParam(params.q),
    category: pickParam(params.category),
    filter: pickParam(params.filter),
    day: pickParam(params.day),
  });
}

export default function DealsPage() {
  return <DealsPageClient />;
}
