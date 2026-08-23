/* -------------------------------------------------------------------------- */
/*  Recent dine-in orders — stored on the phone (localStorage) so a customer   */
/*  can reopen tracking after leaving the scan page / closing the browser.    */
/* -------------------------------------------------------------------------- */

export interface RecentDineOrder {
  orderId: string;
  tableToken: string;
  tableName: string;
  shopName: string;
  createdAt: number;
}

const KEY = "tm_dine_recent_orders";
const MAX = 10;

export function getRecentDineOrders(): RecentDineOrder[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(KEY);
    const list = raw ? (JSON.parse(raw) as RecentDineOrder[]) : [];
    return Array.isArray(list) ? list.filter((o) => o && o.orderId) : [];
  } catch {
    return [];
  }
}

export function saveRecentDineOrder(order: RecentDineOrder): void {
  if (typeof window === "undefined") return;
  try {
    const list = getRecentDineOrders().filter((o) => o.orderId !== order.orderId);
    list.unshift(order);
    window.localStorage.setItem(KEY, JSON.stringify(list.slice(0, MAX)));
  } catch {
    /* storage full / private mode — ignore */
  }
}

export function removeRecentDineOrder(orderId: string): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(
      KEY,
      JSON.stringify(getRecentDineOrders().filter((o) => o.orderId !== orderId)),
    );
  } catch {
    /* ignore */
  }
}
