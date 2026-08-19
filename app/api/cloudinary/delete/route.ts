import { NextRequest, NextResponse } from "next/server";
import { destroyCloudinaryAsset } from "@/lib/cloudinary";

/**
 * POST /api/cloudinary/delete
 * Body: { publicId: string }
 * Server-only delete — keeps CLOUDINARY_API_SECRET out of the browser.
 * Non-fatal by design: a failed delete never blocks the merchant's flow.
 */
export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as { publicId?: string };
    const publicId = body.publicId;
    // Only allow safe public_id characters (folder path + letters/numbers).
    if (!publicId || !/^[a-zA-Z0-9_\-\/]+$/.test(publicId)) {
      return NextResponse.json({ success: false }, { status: 400 });
    }
    const ok = await destroyCloudinaryAsset(publicId);
    return NextResponse.json({ success: ok });
  } catch {
    return NextResponse.json({ success: false }, { status: 500 });
  }
}
