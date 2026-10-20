import { z } from "zod";
import type { GiftAccess, BillingAccount } from "./plans";

// These grants are bound directly to a signed-in account. No shareable invite
// strings, permanent Ultra access, or unmetered AI processing.
const email = z.string().trim().toLowerCase().email().max(200);
export const ownerGiftAction = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("grant"),
    email,
    tier: z.enum(["study", "plus"]),
    days: z.number().int().min(1).max(90),
    budgetCents: z.number().int().min(25).max(1000),
  }).strict(),
  z.object({ action: z.literal("revoke-gift"), email }).strict(),
  z.object({ action: z.literal("revoke-family"), email }).strict(),
]);
export type OwnerGiftAction = z.infer<typeof ownerGiftAction>;

export function activeGift(account: Pick<BillingAccount, "gift">, now = Date.now()) {
  const gift = account.gift;
  return gift && Number.isFinite(Date.parse(gift.expiresAt)) &&
    Date.parse(gift.expiresAt) > now && gift.remainingMicros >= 0
    ? gift
    : null;
}

export function createGift(
  tier: GiftAccess["tier"],
  days: number,
  budgetCents: number,
  issuedBy: string,
  now = new Date(),
): GiftAccess {
  if (!["study", "plus"].includes(tier) || !Number.isInteger(days) || days < 1 ||
      days > 90 || !Number.isInteger(budgetCents) || budgetCents < 25 || budgetCents > 1000) {
    throw new Error("Invalid gift settings.");
  }
  const expiresAt = new Date(now.getTime() + days * 86_400_000).toISOString();
  return {
    id: crypto.randomUUID(),
    tier,
    issuedAt: now.toISOString(),
    expiresAt,
    issuedBy,
    initialMicros: budgetCents * 10_000,
    remainingMicros: budgetCents * 10_000,
  };
}

// Called inside a serialized owner-to-recipient billing mutation.
export function takeGift(account: BillingAccount, requestedMicros: number, now = Date.now()) {
  const gift = activeGift(account, now);
  if (!gift || requestedMicros <= 0) return null;
  const amount = Math.min(Math.max(0, requestedMicros), gift.remainingMicros);
  gift.remainingMicros -= amount;
  return amount > 0 ? { id: gift.id, amount } : null;
}

export function restoreUnusedGift(
  account: BillingAccount,
  giftId: string,
  unusedMicros: number,
  now = Date.now(),
) {
  const gift = activeGift(account, now);
  if (!gift || gift.id !== giftId || unusedMicros <= 0) return 0;
  const restored = Math.min(unusedMicros, gift.initialMicros - gift.remainingMicros);
  gift.remainingMicros += restored;
  return restored;
}
