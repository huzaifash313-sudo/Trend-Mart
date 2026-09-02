/* Track which conversation the user is actively viewing (WhatsApp-style). */

const ACTIVE_KEY = "tm_active_conversation_id";

let activeConversationId: string | null = null;

export function getActiveConversationId(): string | null {
  if (typeof window === "undefined") return activeConversationId;
  if (activeConversationId) return activeConversationId;
  try {
    return sessionStorage.getItem(ACTIVE_KEY);
  } catch {
    return null;
  }
}

export function setActiveConversationId(id: string | null): void {
  activeConversationId = id;
  if (typeof window === "undefined") return;
  try {
    if (id) sessionStorage.setItem(ACTIVE_KEY, id);
    else sessionStorage.removeItem(ACTIVE_KEY);
  } catch {
    /* ignore */
  }
  window.dispatchEvent(
    new CustomEvent("trendsmart:active-chat", { detail: { conversationId: id } }),
  );
}

export function isViewingConversation(conversationId: string | null | undefined): boolean {
  if (!conversationId) return false;
  return getActiveConversationId() === conversationId;
}
