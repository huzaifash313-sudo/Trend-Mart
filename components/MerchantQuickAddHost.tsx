"use client";

import dynamic from "next/dynamic";

/**
 * Client-only host so root layout (Server Component) can lazy-load the heavy
 * merchant quick-add tree without `ssr: false` in a Server Component.
 */
const MerchantQuickAddModal = dynamic(
  () => import("@/components/MerchantQuickAddModal"),
  { ssr: false },
);

export default function MerchantQuickAddHost() {
  return <MerchantQuickAddModal />;
}
