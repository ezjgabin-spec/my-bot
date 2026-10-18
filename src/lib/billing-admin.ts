import "server-only";
import { cloudBindings, isCloud } from "./cloud";
import { readLocalData, updateLocalData, type LocalData } from "./local-store";
import { accountFor, entry, settleUsageRecord } from "./billing";
import { isBillingAdmin } from "./payments";
import { AppError } from "./server";
import {
  activePlan,
  zeroWallet,
  type BillingAccount,
  type UsageReceipt,
} from "./plans";

export async function pendingUsage() {
  if (!(await isBillingAdmin()))
    throw new AppError("Owner access is required.", 403);
  if (!isCloud()) {
    const data = await readLocalData();
    return data.billingUsage
      .filter((r) => r.status === "reserved" || r.status === "uncertain")
      .slice(-100)
      .map((receipt) => ({ userId: data.billingAccounts[0].id, receipt }));
  }
  const { DB } = await cloudBindings();
  const rows = await DB.prepare(
    "SELECT user_id, value FROM study_items WHERE collection = 'billingUsage' AND json_extract(value, '$.status') IN ('reserved','uncertain') ORDER BY rowid DESC LIMIT 100",
  ).all();
  return rows.results.map((r) => ({
    userId: String(r.user_id),
    receipt: JSON.parse(String(r.value)) as UsageReceipt,
  }));
}
export async function reconcileUsage(
  userId: string,
  receiptId: string,
  costMicros: number,
  reference: string,
) {
  if (!(await isBillingAdmin()))
    throw new AppError("Owner access is required.", 403);
  const change = (data: LocalData) => {
    const account = accountFor(data, { id: userId }, !isCloud());
    const receipt = data.billingUsage.find((r) => r.id === receiptId);
    if (!receipt) throw new AppError("Usage receipt not found.", 404);
    if (receipt.status !== "reserved" && receipt.status !== "uncertain") return;
    if (Date.now() - Date.parse(receipt.at) < 10 * 60_000)
      throw new AppError(
        "Wait at least 10 minutes for an active provider request to finish.",
        409,
      );
    settleUsageRecord(data, account, receipt, {
      cost: costMicros,
      input: 0,
      output: 0,
      cacheRead: 0,
      cacheWrite: 0,
      providerId: null,
    });
    // Manual reconciliation records cost, not invented token measurements.
    receipt.inputTokens = null;
    receipt.outputTokens = null;
    entry(
      data,
      "settle",
      zeroWallet(),
      `Owner reconciliation reference: ${reference}`,
      receipt.id,
    );
  };
  if (isCloud())
    await (
      await import("./cloud-store")
    ).updateCloudDataForUser(userId, change);
  else await updateLocalData(change);
}

export async function adminUsage() {
  if (!(await isBillingAdmin()))
    throw new AppError("Owner access is required.", 403);
  if (!isCloud()) {
    const data = await readLocalData();
    const account = data.billingAccounts[0];
    return {
      accounts: account ? [summarize(account, data.billingUsage)] : [],
      limited: false,
    };
  }
  const { DB } = await cloudBindings();
  // Aggregate only billing records. This never returns users' notes or answers.
  const rows = await DB.prepare(
    `SELECT a.value AS account,
    COALESCE(SUM(CASE WHEN u.collection = 'billingUsage' THEN json_extract(u.value, '$.costMicros') ELSE 0 END), 0) AS cost,
    COALESCE(SUM(CASE WHEN u.collection = 'billingUsage' AND json_extract(u.value, '$.family') = 1 THEN json_extract(u.value, '$.costMicros') ELSE 0 END), 0) AS familyCost,
    COALESCE(SUM(CASE WHEN u.collection = 'billingUsage' THEN json_extract(u.value, '$.overrunMicros') ELSE 0 END), 0) AS overruns,
    SUM(CASE WHEN u.collection = 'billingUsage' AND json_extract(u.value, '$.status') IN ('reserved','uncertain') THEN 1 ELSE 0 END) AS pending,
    COUNT(u.item_id) AS requests
    FROM study_items a LEFT JOIN study_items u ON a.user_id = u.user_id AND u.collection = 'billingUsage'
    WHERE a.collection = 'billingAccounts' GROUP BY a.user_id ORDER BY cost DESC LIMIT 101`,
  ).all();
  return {
    accounts: rows.results.slice(0, 100).map((row) => {
      const account = JSON.parse(String(row.account)) as BillingAccount;
      return {
        id: account.id,
        email: account.email,
        plan: activePlan(account),
        family: account.family,
        balance: account.balance,
        paidUntil: account.paidUntil,
        costMicros: Number(row.cost),
        familyCostMicros: Number(row.familyCost),
        overrunMicros: Number(row.overruns),
        pending: Number(row.pending),
        requests: Number(row.requests),
      };
    }),
    limited: rows.results.length > 100,
  };
}
function summarize(a: BillingAccount, receipts: UsageReceipt[]) {
  return {
    id: a.id,
    email: a.email,
    plan: activePlan(a),
    family: a.family,
    balance: a.balance,
    paidUntil: a.paidUntil,
    costMicros: receipts.reduce((sum, r) => sum + (r.costMicros ?? 0), 0),
    familyCostMicros: receipts
      .filter((r) => r.family)
      .reduce((sum, r) => sum + (r.costMicros ?? 0), 0),
    overrunMicros: receipts.reduce((sum, r) => sum + r.overrunMicros, 0),
    pending: receipts.filter(
      (r) => r.status === "reserved" || r.status === "uncertain",
    ).length,
    requests: receipts.length,
  };
}
