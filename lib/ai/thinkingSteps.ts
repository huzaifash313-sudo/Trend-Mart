/* Simulated “AI thinking” steps — returned to UI for premium feel */

import type { AssistantRole } from "@/lib/ai/assistantEngine";
import { TREND_BOT_NAME } from "@/lib/ai/trendBotBrand";

export function getThinkingSteps(
  intent: string,
  role: AssistantRole,
  query?: string,
): string[] {
  switch (intent) {
    case "product_search":
      return [
        `${TREND_BOT_NAME} TrendsMart catalog scan kar raha hai…`,
        query ? `"${query}" ke best matches rank ho rahe hain…` : "Best matches dhundh raha hoon…",
        "Product aur shop links tayyar ho rahi hain…",
      ];
    case "universal_search":
      return [
        "Products, shops aur deals check ho rahe hain…",
        "Relevance score calculate ho raha hai…",
      ];
    case "business_advisor":
    case "platform_trends":
      return [
        "Live marketplace data fetch ho raha hai…",
        "Trending categories analyze ho rahi hain…",
        "Aapke liye recommendations bana raha hoon…",
      ];
    case "business_summary":
    case "analytics_insight":
    case "revenue_trend":
      return [
        "Aapke store ka live data load ho raha hai…",
        "Orders aur analytics merge ho rahe hain…",
        "Report compile ho rahi hai…",
      ];
    case "brand_owner":
    case "brand_knowledge":
      return ["TrendsMart brand info check…", "Clear official jawab tayyar…"];
    case "app_knowledge":
    case "policy":
    case "how_it_works":
      return ["TrendsMart help & policies check…", "Best clear answer select…"];
    case "category_browse":
      return ["Category aur live products scan…", "Best picks rank…"];
    case "helpful_guide":
    case "helpful_redirect":
      return [`${TREND_BOT_NAME} app guide ready kar raha hai…`, "Useful next steps…"];
    case "order_status":
      return ["Aapke orders fetch ho rahe hain…", "Status update check ho raha hai…"];
    default:
      if (role === "merchant") {
        return [`${TREND_BOT_NAME} store data analyze kar raha hai…`, "Business jawab compile ho raha hai…"];
      }
      if (role === "customer" || role === "shop") {
        return [`${TREND_BOT_NAME} samajh raha hai…`, "TrendsMart se best jawab la raha hoon…"];
      }
      return [`${TREND_BOT_NAME}…`, "Jawab tayyar kar raha hoon…"];
  }
}
