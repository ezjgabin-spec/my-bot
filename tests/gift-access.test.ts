import { describe, expect, it } from "vitest";
import { activeGift, createGift, ownerGiftAction, takeGift, restoreUnusedGift } from "../src/lib/gift-access";
import { activePlan, zeroWallet, type BillingAccount } from "../src/lib/plans";

const issued = new Date("2026-10-20T12:00:00.000Z");
const now = issued.getTime();
function account(): BillingAccount {
  return {
    id: "student-1", email: "student@example.com", family: false, plan: "free",
    createdAt: issued.toISOString(), paidUntil: null, periodStart: null,
    customerId: null, subscriptionId: null, balance: zeroWallet(),
    freeTests: 0, nextFreeAt: issued.toISOString(), codeAttempts: 0,
    codeWindow: issued.toISOString(), lastPaidPeriodEnd: null,
  };
}

describe("owner gift authorization inputs", () => {
  it("accepts bounded one-account grants", () => {
    expect(ownerGiftAction.parse({
      action: "grant", email: " Student@Example.com ", tier: "plus", days: 14, budgetCents: 200,
    }).email).toBe("student@example.com");
  });
  it("rejects unbounded budgets, permanent access, wildcard and injected properties", () => {
    for (const candidate of [
      { action: "grant", email: "*", tier: "plus", days: 14, budgetCents: 200 },
      { action: "grant", email: "student@example.com", tier: "ultra", days: 14, budgetCents: 200 },
      { action: "grant", email: "student@example.com", tier: "plus", days: 400, budgetCents: 200 },
      { action: "grant", email: "student@example.com", tier: "plus", days: 14, budgetCents: 10_000 },
      { action: "grant", email: "student@example.com", tier: "plus", days: 14, budgetCents: 200, family: true },
    ]) expect(ownerGiftAction.safeParse(candidate).success).toBe(false);
  });
});

describe("gifted access and metering", () => {
  it("auto-expires the plan and keeps existing subscription precedence", () => {
    const user = account();
    user.gift = createGift("plus", 14, 200, "verified-owner", issued);
    expect(activePlan(user, now + 100)).toBe("plus");
    expect(activePlan(user, now + 14 * 86_400_000)).toBe("free");
    user.plan = "study";
    user.paidUntil = new Date(now + 30 * 86_400_000).toISOString();
    expect(activePlan(user, now + 100)).toBe("study");
    user.family = true;
    expect(activePlan(user, now + 100)).toBe("ultra");
  });
  it("never spends more than the gift budget", () => {
    const user = account();
    user.gift = createGift("study", 7, 50, "verified-owner", issued);
    expect(user.gift.initialMicros).toBe(500_000);
    const reservation = takeGift(user, 900_000, now + 100);
    expect(reservation?.amount).toBe(500_000);
    expect(user.gift.remainingMicros).toBe(0);
    expect(takeGift(user, 1, now + 100)).toBeNull();
  });
  it("returns unused provider reservations only to the same active grant", () => {
    const user = account();
    user.gift = createGift("plus", 14, 200, "verified-owner", issued);
    const reservation = takeGift(user, 900_000, now + 100)!;
    expect(restoreUnusedGift(user, reservation.id, 600_000, now + 100)).toBe(600_000);
    expect(user.gift.remainingMicros).toBe(1_700_000);
    expect(restoreUnusedGift(user, "different-grant", 400_000, now + 100)).toBe(0);
    expect(restoreUnusedGift(user, reservation.id, 100_000, now + 14 * 86_400_000)).toBe(0);
    user.gift = undefined;
    expect(restoreUnusedGift(user, reservation.id, 100_000, now + 100)).toBe(0);
  });
});
