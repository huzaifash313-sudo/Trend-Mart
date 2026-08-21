import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { destroyCloudinaryAsset, extractCloudinaryPublicId } from "@/lib/cloudinary";

/**
 * POST /api/cloudinary/delete
 * Body: { publicId: string }
 *
 * Server-only delete — keeps CLOUDINARY_API_SECRET out of the browser.
 * Non-fatal by design: a failed delete never blocks the merchant's flow.
 *
 * ACCESS CONTROL:
 *  - Anonymous callers are rejected (previously anyone could delete any asset).
 *  - Platform admins may delete any asset.
 *  - Merchants may only delete an asset that is actually referenced by one of
 *    their own shops (shop logo/banner or a product image). A user who owns no
 *    shop can never delete anything, and one merchant can never delete another
 *    merchant's asset.
 */
export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json(
        { success: false, error: "Sign in required." },
        { status: 401 },
      );
    }

    const body = (await request.json()) as { publicId?: string };
    const publicId = body.publicId;
    // Only allow safe public_id characters (folder path + letters/numbers).
    if (!publicId || !/^[a-zA-Z0-9_\-\/]+$/.test(publicId)) {
      return NextResponse.json({ success: false }, { status: 400 });
    }

    // Platform admins may delete any asset.
    const { data: isAdmin } = await supabase.rpc("is_admin");
    if (isAdmin === true) {
      const ok = await destroyCloudinaryAsset(publicId);
      return NextResponse.json({ success: ok });
    }

    // Merchants: the asset must belong to one of the caller's own shops.
    const { data: shops, error: shopsError } = await supabase
      .from("shops")
      .select("id, logo_url, banner_url")
      .eq("owner_id", user.id);
    if (shopsError) throw shopsError;
    const ownedShops = (shops ?? []) as Array<{
      id: string;
      logo_url?: string | null;
      banner_url?: string | null;
    }>;
    if (ownedShops.length === 0) {
      return NextResponse.json(
        { success: false, error: "Forbidden." },
        { status: 403 },
      );
    }

    const ownedShopIds = ownedShops.map((s) => s.id);
    const { data: products, error: productsError } = await supabase
      .from("products")
      .select("image_url, images")
      .in("shop_id", ownedShopIds);
    if (productsError) throw productsError;

    const allowedPublicIds = new Set<string>();
    for (const shop of ownedShops) {
      for (const url of [shop.logo_url, shop.banner_url]) {
        const pid = url ? extractCloudinaryPublicId(url) : null;
        if (pid) allowedPublicIds.add(pid);
      }
    }
    for (const row of (products ?? []) as Array<{
      image_url?: unknown;
      images?: unknown;
    }>) {
      const urls = [
        row.image_url,
        ...(Array.isArray(row.images) ? (row.images as unknown[]) : []),
      ];
      for (const url of urls) {
        const pid = typeof url === "string" ? extractCloudinaryPublicId(url) : null;
        if (pid) allowedPublicIds.add(pid);
      }
    }

    if (!allowedPublicIds.has(publicId)) {
      return NextResponse.json(
        { success: false, error: "Forbidden." },
        { status: 403 },
      );
    }

    const ok = await destroyCloudinaryAsset(publicId);
    return NextResponse.json({ success: ok });
  } catch {
    return NextResponse.json({ success: false }, { status: 500 });
  }
}
