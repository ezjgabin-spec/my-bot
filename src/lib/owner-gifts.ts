import "server-only";
import { cloudBindings, isCloud } from "./cloud";
import { readLocalData, updateLocalData, type LocalData } from "./local-store";
import { accountFor, entry } from "./billing";
import { isBillingAdmin } from "./payments";
import { AppError, requireUser } from "./server";
import { activeGift, createGift, ownerGiftAction, type OwnerGiftAction } from "./gift-access";
import { activePlan, zeroWallet, type BillingAccount } from "./plans";

export async function requireGiftOwner() {
  const user = await requireUser();
  if (!(await isBillingAdmin())) throw new AppError("Owner access required.", 403);
  return user;
}

function view(account: BillingAccount) {
  return {
    id: account.id,
    email: account.email,
    plan: activePlan(account),
    family: account.family,
    isPaidSubscriber: Boolean(account.paidUntil && Date.parse(account.paidUntil) > Date.now()),
    gift: account.gift
      ? {
          tier: account.gift.tier,
          expiresAt: account.gift.expiresAt,
          remainingMicros: account.gift.remainingMicros,
          initialMicros: account.gift.initialMicros,
          active: Boolean(activeGift(account)),
        }
      : null,
  };
}

export async function listOwnerGifts() {
  await requireGiftOwner();
  if (!isCloud()) {
    const local = await readLocalData();
    return { accounts: local.billingAccounts.map(view), limited: false };
  }
  const { DB } = await cloudBindings();
  // Billing-only records: never load student notes, essays or account passwords.
  const rows = await DB.prepare(
    "SELECT value FROM study_items WHERE collection = 'billingAccounts' " +
    "ORDER BY lower(json_extract(value, '$.email')) ASC LIMIT 301",
  ).all<{ value: string }>();
  return {
    accounts: rows.results.slice(0, 300).map((row) => view(JSON.parse(row.value) as BillingAccount)),
    limited: rows.results.length > 300,
  };
}

async function resolveRecipient(email: string): Promise<{ id: string; email: string }> {
  if (!isCloud()) {
    const data = await readLocalData();
    const matches = data.billingAccounts.filter((a) => a.email?.toLowerCase() === email);
    if (matches.length !== 1) throw new AppError("That account hasn't signed in yet. Ask them to sign up and open StudyBot first.", 404);
    return { id: matches[0].id, email };
  }
  const { DB } = await cloudBindings();
  const results = await DB.prepare(
    "SELECT user_id FROM study_items WHERE collection = 'billingAccounts' " +
    "AND lower(json_extract(value, '$.email')) = ? LIMIT 2",
  ).bind(email).all<{ user_id: string }>();
  if (results.results.length !== 1)
    throw new AppError(
      results.results.length ? "Multiple accounts use that email. Contact support before gifting." : "That email hasn't opened a StudyBot account yet.",
      results.results.length ? 409 : 404,
    );
  return { id: results.results[0].user_id, email };
}

export async function changeOwnerGift(raw: unknown) {
  const owner = await requireGiftOwner();
  const input: OwnerGiftAction = ownerGiftAction.parse(raw);
  const recipient = await resolveRecipient(input.email);
  if (recipient.id === owner.id) throw new AppError("Use a separate test account for gifts; you cannot change your own owner account.", 400);

  const change = (data: LocalData) => {
    const account = accountFor(data, recipient, !isCloud());
    // Check again during the atomic D1 update, not only during recipient lookup.
    if (account.email?.toLowerCase() !== recipient.email)
      throw new AppError("Account identity changed. Refresh the page and try again.", 409);
    if (input.action === "grant") {
      if (account.family) throw new AppError("This account already has permanent family access. Revoke it first if you want a capped beta gift.", 409);
      if (account.paidUntil && Date.parse(account.paidUntil) > Date.now())
        throw new AppError("Don't overwrite an active paid subscriber's access.", 409);
      if (activeGift(account))
        throw new AppError("This account already has an active gift. Revoke it before making a different grant.", 409);
      const gift = createGift(input.tier, input.days, input.budgetCents, owner.id);
      account.gift = gift;
      entry(data, "gift", zeroWallet(),
        "Owner gift: " + gift.tier + " through " + gift.expiresAt.slice(0, 10) +
          ", $" + (gift.initialMicros / 1_000_000).toFixed(2) + " AI cap",
        gift.id);
    } else if (input.action === "revoke-gift") {
      if (!account.gift) throw new AppError("No gift was found for this account.", 404);
      const oldId = account.gift.id;
      account.gift = undefined;
      entry(data, "gift-revoke", zeroWallet(), "Owner revoked gifted access and unused gift budget", oldId);
    } else if (input.action === "revoke-family") {
      if (!account.family) throw new AppError("This account has no permanent family entitlement.", 409);
      account.family = false;
      entry(data, "family-revoke", zeroWallet(), "Owner revoked legacy permanent family access");
    }
    return view(account);
  };

  if (isCloud()) {
    const { updateCloudDataForUser } = await import("./cloud-store");
    return updateCloudDataForUser(recipient.id, change);
  }
  return updateLocalData(change);
}
