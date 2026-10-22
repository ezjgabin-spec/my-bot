import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { createHmac } from "node:crypto";
import {
  accountFor,
  applyCreditPurchase,
  applyPaidMonth,
  billingAccount,
  redeemFamilyCode,
  reserveUsage,
  settleUsage,
  withFreeTest,
} from "../src/lib/billing";
import {
  emptyData,
  readLocalData,
  updateLocalData,
} from "../src/lib/local-store";
import { SONNET_RATES, usageCost } from "../src/lib/ai-pricing";
import { activePlan, MICROS_PER_CREDIT, PLANS } from "../src/lib/plans";
import { verifyStripeSignature } from "../src/lib/payments";
import { reconcileUsage } from "../src/lib/billing-admin";
let directory: string;
const user = { id: "local-owner" };
const reservation = {
  operation: "test" as const,
  model: "claude-sonnet-4-6",
  pricingVersion: "test",
};
beforeEach(async () => {
  vi.stubEnv("FAMILY_CODE_SHA256", "5014754c782e050b8561badb73161e1b10912c638bd6a5fd8d3b037ab8e67c6f");
  directory = await mkdtemp(path.join(os.tmpdir(), "study-billing-"));
  vi.stubEnv("STUDYPREDICT_DATA_DIR", directory);
  await updateLocalData((data) => accountFor(data, user, false));
});
afterEach(async () => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
  await rm(directory, { recursive: true, force: true });
});
describe("metered credits and entitlements", () => {
  it("reconciles an aged unknown charge once and returns unused reserved value", async () => {
    const r = await reserveUsage(reservation, 100_000, 100_000);
    await settleUsage(r.id, null);
    await expect(reconcileUsage(user.id, r.id, 25_000, "provider-record-123")).rejects.toMatchObject({ status: 409 });
    vi.useFakeTimers();
    vi.setSystemTime(new Date(Date.now() + 11 * 60_000));
    await reconcileUsage(user.id, r.id, 25_000, "provider-record-123");
    await reconcileUsage(user.id, r.id, 25_000, "provider-record-123");
    expect((await billingAccount()).balance.free).toBe(275_000);
    const receipt = (await readLocalData()).billingUsage[0];
    expect(receipt.status).toBe("completed");
    expect(receipt.costMicros).toBe(25_000);
    expect(receipt.inputTokens).toBeNull();
  });
  it("gives one signup test, restores failed generation, and refreshes once a week", async () => {
    await expect(
      withFreeTest(async () => {
        throw new Error("failed");
      }),
    ).rejects.toThrow("failed");
    expect((await billingAccount()).freeTests).toBe(1);
    await withFreeTest(async () => "saved");
    await expect(withFreeTest(async () => "duplicate")).rejects.toMatchObject({
      status: 402,
    });
    const a = await billingAccount();
    vi.useFakeTimers();
    vi.setSystemTime(new Date(Date.parse(a.nextFreeAt) + 1));
    expect((await billingAccount()).freeTests).toBe(1);
    await withFreeTest(async () => "saved");
    expect((await billingAccount()).freeTests).toBe(0);
  });
  it("reserves atomically and settles exact fractional costs only once", async () => {
    const results = await Promise.allSettled([
      reserveUsage(reservation, 250_000, 250_000),
      reserveUsage(reservation, 250_000, 250_000),
    ]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    const r = results.find((r) => r.status === "fulfilled")!;
    if (r.status !== "fulfilled") throw new Error("missing receipt");
    const usage = {
      cost: 33_333,
      input: 100,
      output: 100,
      cacheRead: 0,
      cacheWrite: 0,
      providerId: "msg",
    };
    await settleUsage(r.value.id, usage);
    await settleUsage(r.value.id, usage);
    expect((await billingAccount()).balance.free).toBe(300_000 - 33_333);
    expect((await readLocalData()).billingUsage[0].chargedMicros).toBe(33_333);
  });
  it("keeps timed-out reservations pending and releases rejected requests", async () => {
    const r = await reserveUsage(reservation, 100_000, 100_000);
    await settleUsage(r.id, null);
    expect((await billingAccount()).balance.free).toBe(200_000);
    expect((await readLocalData()).billingUsage[0].status).toBe("uncertain");
    const second = await reserveUsage(reservation, 100_000, 100_000);
    await settleUsage(second.id, null, true);
    expect((await billingAccount()).balance.free).toBe(200_000);
  });
  it("persists permanent unlimited family access and rate-limits incorrect code guesses", async () => {
    for (let i = 0; i < 5; i++)
      await expect(redeemFamilyCode("wrong")).rejects.toMatchObject({
        status: 400,
      });
    await expect(redeemFamilyCode("test-family-access")).rejects.toMatchObject({
      status: 429,
    });
    await updateLocalData((data) => {
      data.billingAccounts[0].codeWindow = "2000-01-01T00:00:00Z";
    });
    await redeemFamilyCode("test-family-access");
    const r = await reserveUsage(reservation, 500_000_000, 500_000_000);
    await settleUsage(r.id, {
      cost: 400_000_000,
      input: 1,
      output: 1,
      cacheRead: 0,
      cacheWrite: 0,
      providerId: "msg",
    });
    expect((await readLocalData()).billingUsage[0].chargedMicros).toBe(0);
    vi.stubEnv("FAMILY_CODE_SHA256", "disabled");
    expect((await billingAccount()).family).toBe(true);
  });
  it("preserves exact unused value at renewal and ignores duplicate or old invoices", () => {
    const data = emptyData();
    const first = {
      eventId: "i1",
      plan: "study" as const,
      start: "2027-01-01T00:00:00Z",
      end: "2027-02-01T00:00:00Z",
      customerId: "c",
      subscriptionId: "s",
    };
    applyPaidMonth(data, user, first);
    data.billingAccounts[0].balance.monthly = 1_234_567;
    applyCreditPurchase(data, user, "small", "p1");
    applyCreditPurchase(data, user, "small", "p1");
    applyPaidMonth(data, user, {
      ...first,
      eventId: "i2",
      start: first.end,
      end: "2027-03-01T00:00:00Z",
    });
    applyPaidMonth(data, user, first);
    const a = data.billingAccounts[0];
    expect(a.balance.bank).toBe(1_234_567);
    expect(a.balance.monthly).toBe(150 * MICROS_PER_CREDIT);
    expect(a.balance.purchased).toBe(100 * MICROS_PER_CREDIT);
    accountFor(data, user, false, new Date("2028-01-01"));
    expect(a.balance.bank).toBe(1_234_567 + 150 * MICROS_PER_CREDIT);
    expect(a.balance.purchased).toBe(100 * MICROS_PER_CREDIT);
    expect(activePlan(a, Date.parse("2028-01-01"))).toBe("free");
  });
  it("backs each plan's allowance within the stated fee and reserve assumptions", () => {
    for (const id of ["study", "plus", "ultra"] as const) {
      const plan = PLANS[id];
      const feeCents = Math.ceil(plan.priceCents * 0.029 + 30);
      expect(
        plan.priceCents -
          feeCents -
          plan.reserveCents -
          plan.credits * 0.025 * 100,
      ).toBeGreaterThanOrEqual(plan.targetCents);
    }
  });
  it("accounts for cache token classes without double-counting", () => {
    const actual = usageCost(
      {
        input_tokens: 1000,
        output_tokens: 2000,
        cache_read_input_tokens: 1000,
        cache_creation_input_tokens: 3000,
        cache_creation: {
          ephemeral_5m_input_tokens: 2000,
          ephemeral_1h_input_tokens: 1000,
        },
      },
      SONNET_RATES,
    );
    expect(actual.cost).toBe(46_800);
    expect(() =>
      usageCost({ input_tokens: -1, output_tokens: 1 }, SONNET_RATES),
    ).toThrow();
  });
  it("verifies webhook signatures against exact raw bytes and rejects stale events", () => {
    const raw = '{"id":"evt_1"}',
      secret = "whsec_test",
      now = 1800000000000;
    const t = now / 1000;
    const signature = `t=${t},v1=${createHmac("sha256", secret).update(`${t}.${raw}`).digest("hex")}`;
    expect(() =>
      verifyStripeSignature(raw, signature, secret, now),
    ).not.toThrow();
    expect(() =>
      verifyStripeSignature(raw + " ", signature, secret, now),
    ).toThrow();
    expect(() =>
      verifyStripeSignature(raw, signature, secret, now + 301_000),
    ).toThrow();
  });
});

it("accepts the new default family code and retires the old default",async()=>{
 delete process.env.FAMILY_CODE_SHA256;
 await expect(redeemFamilyCode("i-like-cars")).rejects.toMatchObject({status:400});
 await redeemFamilyCode("Knicks");
 expect((await billingAccount()).family).toBe(true);
 const receipt=await reserveUsage(reservation,500000000,500000000);
 expect(receipt.family).toBe(true);
 expect(receipt.allocation).toEqual({monthly:0,bank:0,purchased:0,free:0});
});
