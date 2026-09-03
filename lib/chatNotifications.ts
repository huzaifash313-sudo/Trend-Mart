/** Chat alerts belong in unread badges + top banner — never the navbar bell. */

export function isChatNotification(n: {
  type: string;
  title?: string;
  linkUrl?: string;
  link_url?: string;
}): boolean {
  if (n.type === "message") return true;
  const link = (n.linkUrl || n.link_url || "").toLowerCase();
  if (
    link.includes("/inquiries?c=") ||
    link.includes("/account/inquiries") ||
    link.includes("/dashboard/inquiries")
  ) {
    return true;
  }
  const title = (n.title || "").trim();
  if (/^reply from\b/i.test(title) || /^new message from\b/i.test(title)) return true;
  return false;
}

export function isBellNotification(n: {
  type: string;
  title?: string;
  linkUrl?: string;
  link_url?: string;
}): boolean {
  return !isChatNotification(n);
}
