/* TrendBot — brand constants, teasers, route rules */

export const TREND_BOT_NAME = "TrendBot";
export const TREND_BOT_TAGLINE = "TrendsMart AI · Free · Live data";

export const TREND_BOT_TEASERS = [
  "Salam! Main TrendBot hoon — kuch bhi pooch sakte ho!",
  "Best mobile ka link chahiye? Naam batao — dhundh deta hoon!",
  "Cart, deals, shops — sab samajhta hoon. Tap karo!",
  "Kaunsa business karun? Live marketplace data se bataunga!",
  "Order track, delivery, wishlist — pooch lo!",
  "Qareeb ki dukanain — main recommend kar sakta hoon!",
  "Free AI assistant — koi API key nahi, abhi try karo!",
  "TrendsMart ka smart assistant hoon — kisi bhi sawaal ka jawab deta hoon.",
];

export const TREND_BOT_WELCOME_CUSTOMER =
  `👋 *Salam! Main TrendBot hoon* — TrendsMart ka cute AI assistant.\n\n` +
  `• Product links — *"best mobile ka link do"*\n` +
  `• App help — cart, orders, delivery, deals\n` +
  `• Suggested prompts neeche — ya apna sawal likho\n\n` +
  `_Galat guess nahi karta — nahi pata to seedha keh deta hoon._`;

export const TREND_BOT_WELCOME_SHOP = (shopName: string) =>
  `👋 *Salam!* Main *${shopName}* ka TrendBot hoon.\n\n` +
  `Products, prices, timings — ya seedha:\n*"best mobile ka link do"*\n\n` +
  `Links tap karke product khol sakte hain.`;

/** Paths where the global floating TrendBot should hide. */
export function shouldHideGlobalTrendBot(pathname: string): boolean {
  const p = pathname.toLowerCase();
  if (p.startsWith("/shop/")) return true;
  if (p.startsWith("/dashboard")) return true;
  if (p.startsWith("/admin")) return true;
  if (p.startsWith("/auth")) return true;
  if (p === "/login" || p === "/signup" || p === "/forgot-password") return true;
  if (p === "/assistant" || p === "/account/assistant" || p === "/dashboard/assistant") return true;
  return false;
}
