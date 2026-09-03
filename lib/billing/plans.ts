/* TrendsMart — public pricing catalog (affordable PK market). */

/** Flat monthly store fee after free trial — Rs 1,000. */
export const MONTHLY_STORE_FEE_PKR = 1000;

/** New merchants get 30 days free (full features). */
export const FREE_TRIAL_DAYS = 30;

/** 1 ad-token ≈ Rs 1 — plan price maps 1:1 to tokens. */
export const TOKEN_TO_PKR = 1;

export type TokenPackDef = {
  key: string;
  name: string;
  tokens: number;
  pricePkr: number;
  bonusTokens: number;
  blurb: string;
};

/** Fallback packs if DB catalog is empty (keep in sync with SQL seed). */
export const DEFAULT_TOKEN_PACKS: TokenPackDef[] = [
  {
    key: "starter",
    name: "Starter Pack",
    tokens: 500,
    pricePkr: 500,
    bonusTokens: 0,
    blurb: "Enough for one week of homepage ads.",
  },
  {
    key: "popular",
    name: "Popular Pack",
    tokens: 1200,
    pricePkr: 1000,
    bonusTokens: 200,
    blurb: "Best value — month of ads + buffer.",
  },
  {
    key: "pro",
    name: "Pro Pack",
    tokens: 3000,
    pricePkr: 2500,
    bonusTokens: 500,
    blurb: "Multi-page campaigns for busy seasons.",
  },
];

export function tokensForPack(pack: { tokens: number; bonus_tokens?: number; bonusTokens?: number }): number {
  const bonus = pack.bonus_tokens ?? pack.bonusTokens ?? 0;
  return Math.max(0, Number(pack.tokens) || 0) + Math.max(0, Number(bonus) || 0);
}

export const PLAN_COPY = {
  trialTitle: "Free Trial — 1st month",
  trialBody:
    "Register your store and use every feature free for 30 days. No commission on WhatsApp orders.",
  paidTitle: "TrendsMart Standard",
  paidBody: `After trial: Rs ${MONTHLY_STORE_FEE_PKR.toLocaleString("en-PK")}/month flat. 0% order commission. Unlimited products & stories.`,
  tokensTitle: "Ad Tokens",
  tokensBody:
    "Buy tokens once, spend them on sponsored banners. Enough tokens = instant auto-approve (no waiting on admin).",
} as const;
