import "server-only";
import { billingAccount } from "./billing";
import { activePlan } from "./plans";
import { AppError } from "./server";

// Feature preparation only: legacy subscriptions and Stripe price IDs are intact.
// Existing Ultra subscribers retain all access while future tiers are reviewed.
export async function requireSmartFlashcards() {
  const account = await billingAccount();
  if (!account.family && activePlan(account) === "free")
    throw new AppError(
      "AI Smart Flashcards requires Study or Plus. Smart Import and manual cards are free.",
      403,
    );
  return account;
}

export async function requireFeature(level: "study" | "plus" = "study") {
  const account = await billingAccount();
  const plan = activePlan(account);
  if (!account.family && (plan === "free" || (level === "plus" && plan === "study")))
    throw new AppError(`${level === "plus" ? "Plus" : "Study or Plus"} access is required for this feature.`, 403);
  return account;
}
