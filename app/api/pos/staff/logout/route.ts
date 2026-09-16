/* End the current counter shift — POST /api/pos/staff/logout */

import { NextResponse } from "next/server";
import { STAFF_COOKIE } from "@/lib/pos/staffAuth";

export const runtime = "nodejs";

export async function POST() {
  const response = NextResponse.json({ success: true });
  // Clearing the cookie is enough: the token is stateless and short-lived.
  response.cookies.set(STAFF_COOKIE, "", {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 0,
  });
  return response;
}
