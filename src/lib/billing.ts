import "server-only";
import { createHash, timingSafeEqual } from "node:crypto";
import { AppError, requireUser } from "./server";
import { isCloud } from "./cloud";
import { gen2TrialEnabled, gen2FreeBudgetMicros, nextUtcMonth, GEN2_FREE_TESTS } from "./gen2-rollout";
import { updateLocalData, type LocalData } from "./local-store";
import {
  activePlan,
  FREE_ALLOWANCE_MICROS,
  hasPredictions,
  MICROS_PER_CREDIT,
  PACKS,
  PLANS,
  WEEK_MS,
  zeroWallet,
  type BillingAccount,
  type LedgerEntry,
  type PaidPlan,
  type PackId,
  type UsageReceipt,
  type Wallet,
} from "./plans";

export function entry(
  data: LocalData,
  kind: LedgerEntry["kind"],
  delta: Wallet,
  note: string,
  operationId?: string,
) {
  data.billingLedger.push({
    id: crypto.randomUUID(),
    kind,
    delta,
    note,
    operationId,
    at: new Date().toISOString(),
  });
}
export function accountFor(
  data: LocalData,
  user: { id: string; email?: string },
  local = false,
  now = new Date(),
): BillingAccount {
  const gen2 = gen2TrialEnabled();
  const freeBudget = gen2 ? gen2FreeBudgetMicros() : FREE_ALLOWANCE_MICROS;
  let account = data.billingAccounts[0];
  if (!account) {
    account = {
      id: user.id,
      email: user.email ?? null,
      plan: "free",
      family: local,
      createdAt: now.toISOString(),
      paidUntil: null,
      periodStart: null,
      customerId: null,
      subscriptionId: null,
      balance: { ...zeroWallet(), free: freeBudget },
      freeTests: gen2 ? GEN2_FREE_TESTS.signup : 1,
      freeRuleVersion: gen2 ? 2 : undefined,
      nextFreeAt: gen2 ? nextUtcMonth(now) : new Date(now.getTime() + WEEK_MS).toISOString(),
      codeAttempts: 0,
      codeWindow: now.toISOString(),
      lastPaidPeriodEnd: null,
    };
    data.billingAccounts.push(account);
    entry(
      data,
      "signup",
      { ...zeroWallet(), free: freeBudget },
      "Signup test and free processing allowance",
    );
  }
  if (account.id !== user.id)
    throw new AppError("Billing account mismatch.", 403);
  if (user.email) account.email = user.email;
  if (gen2 && account.freeRuleVersion !== 2) {
    // An explicit beta migration; never silently modify existing balances while disabled.
    account.freeRuleVersion = 2;
    account.freeTests = GEN2_FREE_TESTS.signup;
    account.nextFreeAt = nextUtcMonth(now);
    const delta = freeBudget - account.balance.free;
    account.balance.free = freeBudget;
    entry(data, "signup", { ...zeroWallet(), free: delta }, "Gen 2 Free test allowance migration");
  }
  if (
    account.paidUntil &&
    Date.parse(account.paidUntil) <= now.getTime() &&
    account.balance.monthly > 0
  ) {
    const amount = account.balance.monthly;
    account.balance.monthly = 0;
    account.balance.bank += amount;
    entry(
      data,
      "expiry",
      { ...zeroWallet(), monthly: -amount, bank: amount },
      "Unused monthly value moved to Free Test Bank",
    );
  }
  if (Date.parse(account.nextFreeAt) <= now.getTime()) {
    const delta = freeBudget - account.balance.free;
    account.freeTests = gen2 ? GEN2_FREE_TESTS.monthly : 1;
    account.balance.free = freeBudget;
    if (gen2) {
      account.nextFreeAt = nextUtcMonth(now);
    } else {
      const periods = Math.floor((now.getTime() - Date.parse(account.nextFreeAt)) / WEEK_MS) + 1;
      account.nextFreeAt = new Date(Date.parse(account.nextFreeAt) + periods * WEEK_MS).toISOString();
    }
    entry(data, "weekly", { ...zeroWallet(), free: delta }, gen2 ? "Monthly non-rollover Free allowance reset" : "Weekly free test and processing allowance reset");
  }
  return account;
}
export async function billingAccount() {
  const user = await requireUser();
  return updateLocalData((data) => accountFor(data, user, !isCloud()));
}
export async function canSeePredictions() {
  return hasPredictions(await billingAccount());
}
export async function billingSummary() {
  const user = await requireUser();
  return updateLocalData((data) => {
    const a = accountFor(data, user, !isCloud());
    const receipts = [...data.billingUsage].reverse();
    return {
      plan: activePlan(a),
      family: a.family,
      balance: a.balance,
      freeTests: a.freeTests,
      nextFreeAt: a.nextFreeAt,
      paidUntil: a.paidUntil,
      predictions: hasPredictions(a),
      canManageSubscription: !!a.customerId,
      usage: receipts.slice(0, 50),
      totalCostMicros: receipts.reduce(
        (sum, r) => sum + (r.costMicros ?? 0),
        0,
      ),
      pendingCount: receipts.filter(
        (r) => r.status === "reserved" || r.status === "uncertain",
      ).length,
      ledger: data.billingLedger.slice(-50).reverse(),
    };
  });
}

// The temporary code is stored only as a server-side digest. Set the hash to
// "disabled" to stop new redemptions; existing family entitlements persist.
const TEMPORARY_CODE_HASH =
  "3334815b03ad192fc39b70040e5f8ecd3cba5a8a92711379e6a5748ad85b63a4";
export async function redeemFamilyCode(code: string) {
  const user = await requireUser();
  const hash = process.env.FAMILY_CODE_SHA256 ?? TEMPORARY_CODE_HASH;
  const supplied = createHash("sha256").update(code.trim()).digest("hex");
  const valid =
    /^[a-f0-9]{64}$/.test(hash) &&
    timingSafeEqual(Buffer.from(supplied, "hex"), Buffer.from(hash, "hex"));
  const outcome = await updateLocalData((data) => {
    const a = accountFor(data, user, !isCloud());
    if (a.family) return "already";
    if (Date.now() - Date.parse(a.codeWindow) > 15 * 60_000) {
      a.codeWindow = new Date().toISOString();
      a.codeAttempts = 0;
    }
    if (a.codeAttempts >= 5) return "limited";
    a.codeAttempts++;
    if (!valid) return "invalid";
    a.family = true;
    entry(
      data,
      "family",
      zeroWallet(),
      "Permanent complimentary Ultra access redeemed",
    );
    return "ok";
  });
  if (outcome === "limited")
    throw new AppError("Too many code attempts. Try again in 15 minutes.", 429);
  if (outcome === "invalid") throw new AppError("That code is not valid.", 400);
}

export async function withFreeTest<T>(run: () => Promise<T>): Promise<T> {
  const user = await requireUser();
  const claimed = await updateLocalData((data) => {
    const a = accountFor(data, user, !isCloud());
    if (
      a.family ||
      activePlan(a) !== "free" ||
      a.balance.bank + a.balance.purchased > 0
    )
      return null;
    if (a.freeTests < 1)
      throw new AppError(
        "Your next free test unlocks on " +
          new Date(a.nextFreeAt).toLocaleDateString("en-US", {
            timeZone: "UTC",
          }) +
          ". Visit Plans & credits for more practice.",
        402,
      );
    a.freeTests--;
    entry(data, "free-test", zeroWallet(), "Free test reserved");
    return a.nextFreeAt;
  });
  try {
    return await run();
  } catch (error) {
    if (claimed)
      await updateLocalData((data) => {
        const a = accountFor(data, user, !isCloud());
        if (a.nextFreeAt === claimed)
          a.freeTests = Math.min(gen2TrialEnabled() ? GEN2_FREE_TESTS.signup : 1, a.freeTests + 1);
        entry(
          data,
          "free-test-return",
          zeroWallet(),
          "Failed generation returned the free test; provider usage still counts toward the processing allowance",
        );
      });
    throw error;
  }
}

export function spendable(a: BillingAccount) {
  return (
    a.balance.bank +
    a.balance.monthly +
    a.balance.purchased +
    (activePlan(a) === "free" ? a.balance.free : 0)
  );
}
export async function reserveUsage(
  input: Pick<UsageReceipt, "operation" | "model" | "pricingVersion">,
  requested: number,
  minimum: number,
) {
  const user = await requireUser();
  return updateLocalData((data) => {
    const a = accountFor(data, user, !isCloud());
    const amount = a.family ? requested : Math.min(requested, spendable(a));
    if (amount < minimum)
      throw new AppError(
        "Not enough AI allowance for this request. Try shorter material or visit Plans & credits. Your saved work is safe.",
        402,
      );
    const allocation = zeroWallet();
    if (!a.family) {
      let remaining = amount;
      const order: (keyof Wallet)[] =
        activePlan(a) === "free"
          ? ["free", "bank", "monthly", "purchased"]
          : ["bank", "monthly", "purchased"];
      for (const bucket of order) {
        allocation[bucket] = Math.min(a.balance[bucket], remaining);
        a.balance[bucket] -= allocation[bucket];
        remaining -= allocation[bucket];
      }
    }
    const receipt: UsageReceipt = {
      ...input,
      planAtRequest: activePlan(a),
      id: crypto.randomUUID(),
      at: new Date().toISOString(),
      completedAt: null,
      status: "reserved",
      family: a.family,
      reserved: amount,
      allocation,
      costMicros: null,
      chargedMicros: 0,
      inputTokens: null,
      outputTokens: null,
      cacheReadTokens: 0,
      cacheWriteTokens: 0,
      providerId: null,
      overrunMicros: 0,
    };
    data.billingUsage.push(receipt);
    entry(
      data,
      "reserve",
      Object.fromEntries(
        Object.entries(allocation).map(([key, n]) => [key, -n]),
      ) as Wallet,
      input.operation + " reserved",
      receipt.id,
    );
    return receipt;
  });
}

export async function settleUsage(
  id: string,
  result: {
    cost: number;
    input: number;
    output: number;
    cacheRead: number;
    cacheWrite: number;
    providerId: string | null;
  } | null,
  definiteFailure = false,
) {
  const user = await requireUser();
  await updateLocalData((data) => {
    const a = accountFor(data, user, !isCloud());
    const receipt = data.billingUsage.find((r) => r.id === id);
    if (!receipt || receipt.status !== "reserved") return; // idempotent settlement
    settleUsageRecord(data, a, receipt, result, definiteFailure);
  });
}
export function settleUsageRecord(
  data: LocalData,
  a: BillingAccount,
  receipt: UsageReceipt,
  result: {
    cost: number;
    input: number;
    output: number;
    cacheRead: number;
    cacheWrite: number;
    providerId: string | null;
  } | null,
  definiteFailure = false,
) {
  const id = receipt.id;
  receipt.completedAt = new Date().toISOString();
  if (!result && !definiteFailure) {
    receipt.status = "uncertain";
    entry(
      data,
      "uncertain",
      zeroWallet(),
      "Provider outcome unknown; reservation retained for reconciliation",
      id,
    );
    return;
  }
  const cost = result?.cost ?? 0;
  receipt.status = result ? "completed" : "failed";
  receipt.costMicros = cost;
  receipt.inputTokens = result?.input ?? 0;
  receipt.outputTokens = result?.output ?? 0;
  receipt.cacheReadTokens = result?.cacheRead ?? 0;
  receipt.cacheWriteTokens = result?.cacheWrite ?? 0;
  receipt.providerId = result?.providerId ?? null;
  receipt.overrunMicros = Math.max(0, cost - receipt.reserved);
  receipt.chargedMicros = receipt.family ? 0 : Math.min(cost, receipt.reserved);
  let remaining = receipt.chargedMicros;
  const returned = zeroWallet();
  const order: (keyof Wallet)[] = ["free", "bank", "monthly", "purchased"];
  for (const bucket of order) {
    const used = Math.min(remaining, receipt.allocation[bucket]);
    remaining -= used;
    const refund = receipt.allocation[bucket] - used;
    // A renewal may have happened during the request. Old monthly reserves
    // return to the bank; old weekly reserves do not replenish a new week.
    const target =
      bucket === "monthly" &&
      (!a.periodStart ||
        Date.parse(a.periodStart) > Date.parse(receipt.at) ||
        activePlan(a) === "free")
        ? "bank"
        : bucket;
    if (
      bucket === "free" &&
      Date.parse(receipt.at) < Date.parse(a.nextFreeAt) - WEEK_MS
    )
      continue;
    returned[target] += refund;
    a.balance[target] += refund;
  }
  entry(
    data,
    "settle",
    returned,
    result
      ? "Actual provider usage settled; unused reservation returned"
      : "Rejected request; reservation returned",
    id,
  );
}

// Called only from the verified payment webhook, never with browser claims.
export function applyPaidMonth(
  data: LocalData,
  user: { id: string },
  input: {
    eventId: string;
    plan: PaidPlan;
    start: string;
    end: string;
    customerId: string;
    subscriptionId: string;
  },
) {
  if (data.billingLedger.some((e) => e.operationId === input.eventId)) return;
  const a = accountFor(data, user);
  if (a.family) return;
  if (
    data.billingLedger.some(
      (e) => e.kind === "renewal" && e.periodEnd === input.end,
    )
  )
    return;
  if (Date.parse(input.end) <= Date.parse(input.start))
    throw new Error("Invalid billing period");
  const banked = a.balance.monthly;
  const allowance = PLANS[input.plan].credits * MICROS_PER_CREDIT;
  if (
    (a.lastPaidPeriodEnd &&
      Date.parse(input.end) <= Date.parse(a.lastPaidPeriodEnd)) ||
    Date.parse(input.end) <= Date.now()
  ) {
    a.balance.bank += allowance;
    entry(
      data,
      "renewal",
      { ...zeroWallet(), bank: allowance },
      "Late paid invoice credited to Free Test Bank",
      input.eventId,
    );
    Object.assign(data.billingLedger.at(-1)!, {
      periodEnd: input.end,
      revenueCents: PLANS[input.plan].priceCents,
    });
    return;
  }
  a.balance.bank += banked;
  a.balance.monthly = allowance;
  a.plan = input.plan;
  a.periodStart = input.start;
  a.paidUntil = input.end;
  a.lastPaidPeriodEnd = input.end;
  a.customerId = input.customerId;
  a.subscriptionId = input.subscriptionId;
  delete a.pendingCheckout;
  entry(
    data,
    "renewal",
    { ...zeroWallet(), monthly: allowance - banked, bank: banked },
    "Paid month activated; unused value preserved in Free Test Bank",
    input.eventId,
  );
  Object.assign(data.billingLedger.at(-1)!, {
    periodEnd: input.end,
    revenueCents: PLANS[input.plan].priceCents,
  });
}
export function applyCreditPurchase(
  data: LocalData,
  user: { id: string },
  pack: PackId,
  paymentId: string,
) {
  if (data.billingLedger.some((e) => e.operationId === paymentId)) return;
  const a = accountFor(data, user);
  const amount = PACKS[pack].credits * MICROS_PER_CREDIT;
  a.balance.purchased += amount;
  entry(
    data,
    "purchase",
    { ...zeroWallet(), purchased: amount },
    "Purchased credits; no expiration",
    paymentId,
  );
  data.billingLedger.at(-1)!.revenueCents = PACKS[pack].priceCents;
}
