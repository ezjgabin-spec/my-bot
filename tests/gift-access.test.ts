import { describe, expect, it } from "vitest";
import { activeGift, createGift, ownerGiftAction, takeGift, restoreUnusedGift, canRedeemKnicks } from "../src/lib/gift-access";
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

describe("Knicks one-use invite and delegated admin separation", () => {
  it("requires a matching verified account, not merely the public code", () => {
    const user = account();
    expect(canRedeemKnicks(user, {id:user.id,email:user.email!})).toBe(false);
    user.knicksApprovedAt = issued.toISOString();
    expect(canRedeemKnicks(user, {id:user.id,email:"STUDENT@example.com"})).toBe(true);
    expect(canRedeemKnicks(user, {id:"stranger",email:user.email!})).toBe(false);
    expect(canRedeemKnicks(user, {id:user.id,email:"stranger@example.com"})).toBe(false);
    expect(canRedeemKnicks(user, {id:user.id})).toBe(false);
    user.knicksApprovedAt = undefined;
    expect(canRedeemKnicks(user, {id:user.id,email:user.email!})).toBe(false);
  });
  it("refuses re-redemption after unlimited access has been granted", () => {
    const user = account();
    user.knicksApprovedAt = issued.toISOString();
    user.family = true;
    expect(canRedeemKnicks(user, {id:user.id,email:user.email!})).toBe(false);
  });
  it("restricts admin mutations to known actions and verified emails", () => {
    expect(ownerGiftAction.parse({action:"grant-admin",email:"student@example.com"}).action).toBe("grant-admin");
    expect(ownerGiftAction.parse({action:"approve-knicks",email:"student@example.com"}).action).toBe("approve-knicks");
    expect(ownerGiftAction.safeParse({action:"grant-admin",email:"*"}).success).toBe(false);
    expect(ownerGiftAction.safeParse({action:"grant-admin",email:"student@example.com",owner:true}).success).toBe(false);
  });
});
