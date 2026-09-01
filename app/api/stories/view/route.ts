/* -------------------------------------------------------------------------- */
/*  POST /api/stories/view — record a unique story view (WhatsApp-style)      */
/*  One viewer_key per story; repeat opens from the same user do not increment. */
/* -------------------------------------------------------------------------- */

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getSupabaseAdminClient } from "@/lib/supabase/admin";
import {
  checkRateLimit,
  RATE_LIMITS,
  buildRateLimitResponse,
} from "@/lib/rateLimiter";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function normalizeViewerKey(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const key = raw.trim();
  if (key.length < 8 || key.length > 128) return null;
  return key;
}

async function recordViaAdmin(
  storyId: string,
  viewerKey: string,
): Promise<number | null> {
  const admin = getSupabaseAdminClient();
  if (!admin) return null;

  const { data: story, error: storyErr } = await admin
    .from("stories")
    .select("id, view_count, expires_at")
    .eq("id", storyId)
    .maybeSingle();
  if (storyErr || !story) return null;
  if (story.expires_at && new Date(story.expires_at).getTime() <= Date.now()) {
    return null;
  }

  const { error: insertErr } = await admin.from("story_views").insert({
    story_id: storyId,
    viewer_key: viewerKey,
  });
  if (insertErr) {
    const code = (insertErr as { code?: string }).code;
    if (code === "23505") {
      return Math.max(0, Number(story.view_count) || 0);
    }
    return null;
  }

  const next = Math.max(0, Number(story.view_count) || 0) + 1;
  const { data: updated, error: updateErr } = await admin
    .from("stories")
    .update({ view_count: next })
    .eq("id", storyId)
    .select("view_count")
    .maybeSingle();
  if (updateErr) return next;
  return Math.max(0, Number(updated?.view_count) || next);
}

export async function POST(request: NextRequest) {
  const limited = checkRateLimit(request, {
    ...RATE_LIMITS.STORY_VIEW,
    name: "story-view",
  });
  if (!limited.allowed) {
    return buildRateLimitResponse(limited);
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const storyId =
    typeof body === "object" && body !== null && "storyId" in body
      ? String((body as { storyId: unknown }).storyId ?? "").trim()
      : "";
  if (!UUID_RE.test(storyId)) {
    return NextResponse.json({ error: "Invalid story id." }, { status: 400 });
  }

  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  const authUid = auth.user?.id?.trim() ?? "";

  let viewerKey =
    typeof body === "object" && body !== null && "viewerKey" in body
      ? normalizeViewerKey((body as { viewerKey: unknown }).viewerKey)
      : null;
  if (!viewerKey && authUid.length >= 8) viewerKey = authUid;
  if (!viewerKey) {
    return NextResponse.json({ error: "Invalid viewer key." }, { status: 400 });
  }

  try {
    const { data, error } = await supabase.rpc("record_story_view", {
      p_story_id: storyId,
      p_viewer_key: viewerKey,
    });

    if (!error) {
      const n = typeof data === "number" ? data : Number(data);
      if (Number.isFinite(n)) {
        return NextResponse.json({ viewCount: Math.max(0, Math.floor(n)) });
      }
    }

    const fallback = await recordViaAdmin(storyId, viewerKey);
    if (typeof fallback === "number") {
      return NextResponse.json({ viewCount: fallback });
    }

    return NextResponse.json(
      { error: error?.message ?? "Could not record story view." },
      { status: 500 },
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unexpected error.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
