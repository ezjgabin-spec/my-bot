// Public product terms. Money in the ledger is integer microdollars, not floats.
export const MICROS_PER_CREDIT = 25_000;
export const FREE_ALLOWANCE_MICROS = 300_000;
export const WEEK_MS = 7 * 86_400_000;
export const PLANS = {
  free: {
    name: "Free",
    priceCents: 0,
    credits: 0,
    targetCents: 0,
    reserveCents: 0,
    description: "Get to know your material.",
    features: [
      "One test on signup, then one every 7 days",
      "PDF, PowerPoint, Word, notes and links",
      "Practice results and saved test history",
      "$0.30 of AI processing per weekly allowance",
      "Predictions unlock with a paid plan",
    ],
  },
  study: {
    name: "StudyBot",
    priceCents: 1299,
    credits: 150,
    targetCents: 800,
    reserveCents: 56,
    description: "Build a consistent study routine.",
    features: [
      "150 credits every billing month",
      "Grade predictions and confidence ranges",
      "Full performance and topic analytics",
      "Written-answer grading and explanations",
      "Unused value becomes your Free Test Bank",
    ],
  },
  plus: {
    name: "StudyBot Plus",
    priceCents: 2499,
    credits: 320,
    targetCents: 1500,
    reserveCents: 96,
    description: "More room for every class.",
    features: [
      "320 credits every billing month",
      "Everything in StudyBot",
      "Over twice the included AI budget",
      "More long exams and written feedback",
      "Full-value Free Test Bank at renewal",
    ],
  },
  ultra: {
    name: "StudyBot Ultra",
    priceCents: 6499,
    credits: 1600,
    targetCents: 2000,
    reserveCents: 280,
    description: "Go deep. Study across your whole course.",
    features: [
      "1,600 credits every billing month",
      "Everything in Plus",
      "Five times the Plus AI budget",
      "Room for intensive document interpretation",
      "Full-value Free Test Bank at renewal",
    ],
  },
} as const;
export type PlanId = keyof typeof PLANS;
export type PaidPlan = Exclude<PlanId, "free">;
export const PACKS = {
  small: { credits: 100, priceCents: 599 },
  medium: { credits: 300, priceCents: 1499 },
  large: { credits: 800, priceCents: 3499 },
} as const;
export type PackId = keyof typeof PACKS;
export const credits = (micros: number) =>
  Math.round((micros / MICROS_PER_CREDIT) * 1000) / 1000;
export const dollars = (micros: number) => micros / 1_000_000;

export type Wallet = {
  monthly: number;
  bank: number;
  purchased: number;
  free: number;
};
export type BillingAccount = {
  id: string;
  email: string | null;
  plan: PlanId;
  family: boolean;
  createdAt: string;
  paidUntil: string | null;
  periodStart: string | null;
  customerId: string | null;
  subscriptionId: string | null;
  balance: Wallet;
  freeTests: number;
  nextFreeAt: string;
  codeAttempts: number;
  codeWindow: string;
  lastPaidPeriodEnd: string | null;
  pendingCheckout?: {
    requestId: string;
    expiresAt: number;
    url?: string;
    product: string;
  };
};
export type LedgerEntry = {
  id: string;
  kind:
    | "signup"
    | "weekly"
    | "reserve"
    | "settle"
    | "uncertain"
    | "family"
    | "renewal"
    | "purchase"
    | "expiry"
    | "free-test"
    | "free-test-return";
  at: string;
  operationId?: string;
  delta: Wallet;
  note: string;
  periodEnd?: string;
  revenueCents?: number;
};
export type UsageReceipt = {
  id: string;
  operation: "test" | "grading" | "interpretation" | "flashcards" | "handwriting" | "writing";
  model: string;
  pricingVersion: string;
  at: string;
  completedAt: string | null;
  status: "reserved" | "completed" | "failed" | "uncertain";
  family: boolean;
  reserved: number;
  allocation: Wallet;
  costMicros: number | null;
  chargedMicros: number;
  inputTokens: number | null;
  outputTokens: number | null;
  cacheReadTokens: number;
  cacheWriteTokens: number;
  providerId: string | null;
  overrunMicros: number;
};
export const zeroWallet = (): Wallet => ({
  monthly: 0,
  bank: 0,
  purchased: 0,
  free: 0,
});
export function activePlan(account: BillingAccount, now = Date.now()): PlanId {
  return account.family
    ? "ultra"
    : account.paidUntil && Date.parse(account.paidUntil) > now
      ? account.plan
      : "free";
}
export const hasPredictions = (account: BillingAccount) =>
  account.family || activePlan(account) !== "free";
