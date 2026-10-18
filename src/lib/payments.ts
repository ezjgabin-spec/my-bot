import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";
import { isCloud, cloudBindings } from "./cloud";
import { AppError, requireUser } from "./server";
import {
  billingAccount,
  accountFor,
  applyPaidMonth,
  applyCreditPurchase,
} from "./billing";
import { updateLocalData } from "./local-store";
import { PACKS, PLANS, activePlan, type PaidPlan, type PackId } from "./plans";

async function setting(name: string) {
  const bindings = isCloud()
    ? ((await cloudBindings()) as unknown as Record<string, unknown>)
    : {};
  return typeof bindings[name] === "string"
    ? (bindings[name] as string)
    : (process.env[name] ?? "");
}
export async function isBillingAdmin() {
  const user = await requireUser();
  if (!isCloud()) return true;
  const allowed = (await setting("BILLING_ADMIN_EMAILS"))
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
  return (
    "email" in user &&
    typeof user.email === "string" &&
    allowed.includes(user.email)
  );
}
export async function paymentConfiguration() {
  const base =
    !!(await setting("STRIPE_SECRET_KEY")) &&
    !!(await setting("STRIPE_WEBHOOK_SECRET"));
  const plans = Object.fromEntries(
    await Promise.all(
      (["study", "plus", "ultra"] as PaidPlan[]).map(async (plan) => [
        plan,
        base && !!(await setting(`STRIPE_PRICE_${plan.toUpperCase()}`)),
      ]),
    ),
  );
  const packs = Object.fromEntries(
    await Promise.all(
      (Object.keys(PACKS) as PackId[]).map(async (pack) => [
        pack,
        base && !!(await setting(`STRIPE_PACK_${pack.toUpperCase()}`)),
      ]),
    ),
  );
  return { plans, packs, ready: base };
}
async function stripe(
  path: string,
  values?: URLSearchParams,
  idempotencyKey?: string,
): Promise<Record<string, unknown>> {
  const secret = await setting("STRIPE_SECRET_KEY");
  if (!secret)
    throw new AppError(
      "Payments are not connected yet. No payment has been taken.",
      503,
    );
  const response = await fetch(`https://api.stripe.com/v1/${path}`, {
    method: values ? "POST" : "GET",
    headers: {
      Authorization: `Bearer ${secret}`,
      ...(values
        ? { "Content-Type": "application/x-www-form-urlencoded" }
        : {}),
      ...(idempotencyKey ? { "Idempotency-Key": idempotencyKey } : {}),
    },
    body: values?.toString(),
    signal: AbortSignal.timeout(20_000),
  });
  if (!response.ok)
    throw new AppError(
      "The payment provider could not complete this request. Please try again later.",
      502,
    );
  return response.json();
}
export async function beginCheckout(
  kind: "plan" | "pack",
  product: PaidPlan | PackId,
  requestId: string,
) {
  const user = await requireUser();
  const account = await billingAccount();
  if (account.family)
    throw new AppError(
      "Your family account already has unlimited access. No payment is needed.",
    );
  if (
    kind === "plan" &&
    (activePlan(account) !== "free" || account.subscriptionId)
  )
    throw new AppError(
      "Manage your existing subscription instead of starting another one.",
      409,
    );
  const config = await paymentConfiguration();
  if (!(kind === "plan" ? config.plans[product] : config.packs[product]))
    throw new AppError(
      "Payments are not connected yet. No payment has been taken.",
      503,
    );
  const priceId = await setting(
    kind === "plan"
      ? `STRIPE_PRICE_${product.toUpperCase()}`
      : `STRIPE_PACK_${product.toUpperCase()}`,
  );
  const price = await stripe(`prices/${encodeURIComponent(priceId)}`);
  const expected =
    kind === "plan"
      ? PLANS[product as PaidPlan].priceCents
      : PACKS[product as PackId].priceCents;
  const recurring = price.recurring as {
    interval?: string;
    interval_count?: number;
  } | null;
  if (
    price.currency !== "usd" ||
    price.unit_amount !== expected ||
    price.active !== true ||
    (kind === "plan"
      ? recurring?.interval !== "month" || recurring?.interval_count !== 1
      : !!recurring)
  )
    throw new AppError(
      "The configured price does not match this offer. The owner needs to check payment setup.",
      503,
    );
  const origin = process.env.APP_ORIGIN;
  if (!origin || !origin.startsWith("https://"))
    throw new AppError(
      "A secure public app address is required for checkout.",
      503,
    );
  const expiresAt = Math.floor(Date.now() / 1000) + 1860;
  if (kind === "plan") {
    const existing = await updateLocalData((data) => {
      const a = accountFor(data, user, !isCloud());
      if (a.family || activePlan(a) !== "free" || a.subscriptionId)
        throw new AppError(
          "This account already has access. Refresh your plan.",
          409,
        );
      if (a.pendingCheckout && a.pendingCheckout.expiresAt > Date.now()) {
        if (a.pendingCheckout.product !== product)
          throw new AppError(
            "Another plan checkout is already open. Complete it or wait for it to expire before choosing a different plan.",
            409,
          );
        if (a.pendingCheckout.url) return a.pendingCheckout.url;
        throw new AppError(
          "A checkout is already opening for this account. Wait a moment and retry.",
          409,
        );
      }
      a.pendingCheckout = { requestId, expiresAt: expiresAt * 1000, product };
      return null;
    });
    if (existing) return existing;
  }
  const values = new URLSearchParams({
    mode: kind === "plan" ? "subscription" : "payment",
    "line_items[0][price]": priceId,
    "line_items[0][quantity]": "1",
    success_url: `${origin}/pricing?checkout=success`,
    cancel_url: `${origin}/pricing?checkout=cancelled`,
    client_reference_id: user.id,
    "metadata[user_id]": user.id,
    "metadata[kind]": kind,
    "metadata[product]": product,
  });
  values.set("expires_at", String(expiresAt));
  values.set("payment_method_types[0]", "card");
  if (kind === "plan")
    values.set("subscription_data[metadata][user_id]", user.id);
  if (account.customerId) values.set("customer", account.customerId);
  else if ("email" in user && typeof user.email === "string")
    values.set("customer_email", user.email);
  const session = await stripe(
    "checkout/sessions",
    values,
    `${user.id}:${requestId}`,
  );
  if (
    typeof session.url !== "string" ||
    !session.url.startsWith("https://checkout.stripe.com/")
  )
    throw new AppError("Checkout could not be opened.", 502);
  if (kind === "plan")
    await updateLocalData((data) => {
      const a = accountFor(data, user, !isCloud());
      if (a.pendingCheckout?.requestId === requestId)
        a.pendingCheckout.url = String(session.url);
    });
  return session.url;
}
export async function billingPortal() {
  const account = await billingAccount();
  if (!account.customerId)
    throw new AppError("There is no paid subscription to manage.");
  const session = await stripe(
    "billing_portal/sessions",
    new URLSearchParams({
      customer: account.customerId,
      return_url: `${process.env.APP_ORIGIN}/pricing`,
    }),
  );
  if (
    typeof session.url !== "string" ||
    !session.url.startsWith("https://billing.stripe.com/")
  )
    throw new AppError("Billing portal could not be opened.", 502);
  return session.url;
}
export function verifyStripeSignature(
  raw: string,
  signature: string,
  secret: string,
  now = Date.now(),
) {
  const parts = signature.split(",").map((part) => part.split("="));
  const timestamp = parts.find(([key]) => key === "t")?.[1];
  if (
    !timestamp ||
    !/^\d+$/.test(timestamp) ||
    Math.abs(now / 1000 - Number(timestamp)) > 300
  )
    throw new AppError("Invalid webhook signature.", 400);
  const digest = createHmac("sha256", secret)
    .update(`${timestamp}.${raw}`)
    .digest();
  if (
    !parts.some(
      ([key, value]) =>
        key === "v1" &&
        /^[a-f0-9]{64}$/.test(value ?? "") &&
        timingSafeEqual(digest, Buffer.from(value, "hex")),
    )
  )
    throw new AppError("Invalid webhook signature.", 400);
}
const objectId = (value: unknown): string =>
  typeof value === "string"
    ? value
    : value && typeof value === "object" && "id" in value
      ? String(value.id)
      : "";
export async function receivePayment(raw: string, signature: string) {
  const secret = await setting("STRIPE_WEBHOOK_SECRET");
  if (!secret) throw new AppError("Payment webhooks are not configured.", 503);
  verifyStripeSignature(raw, signature, secret);
  const event = JSON.parse(raw) as {
    id: string;
    type: string;
    data: { object: Record<string, unknown> };
  };
  if (!event.id || !event.data?.object)
    throw new AppError("Invalid payment event.");
  const object = event.data.object;
  const update = async (
    userId: string,
    change: Parameters<typeof updateLocalData>[0],
  ) => {
    if (!userId || userId.length > 200)
      throw new AppError("Missing payment account identity.");
    if (isCloud())
      return (await import("./cloud-store")).updateCloudDataForUser(
        userId,
        change,
      );
    return updateLocalData(change);
  };
  if (event.type === "customer.subscription.deleted") {
    const userId = (object.metadata as { user_id?: string })?.user_id;
    if (userId)
      await update(userId, (data) => {
        const account = accountFor(data, { id: userId });
        if (account.subscriptionId === objectId(object))
          account.subscriptionId = null;
      });
  } else if (event.type === "invoice.paid") {
    if (
      !["subscription_create", "subscription_cycle"].includes(
        String(object.billing_reason),
      )
    )
      return;
    const parent = object.parent as
      { subscription_details?: { subscription?: unknown } } | undefined;
    const subscriptionId = objectId(
      object.subscription ?? parent?.subscription_details?.subscription,
    );
    if (!subscriptionId) return;
    const subscription = await stripe(
      `subscriptions/${encodeURIComponent(subscriptionId)}`,
    );
    const userId =
      (subscription.metadata as { user_id?: string })?.user_id ?? "";
    const items = (
      subscription.items as {
        data: {
          price: { id: string };
          current_period_start?: number;
          current_period_end?: number;
        }[];
      }
    ).data;
    const planIds = await Promise.all(
      (["study", "plus", "ultra"] as PaidPlan[]).map(async (plan) => ({
        plan,
        price: await setting(`STRIPE_PRICE_${plan.toUpperCase()}`),
      })),
    );
    const plan = planIds.find(
      (p) => p.price && items.length === 1 && items[0].price.id === p.price,
    )?.plan;
    if (
      !plan ||
      object.currency !== "usd" ||
      Number(object.amount_paid) < PLANS[plan].priceCents
    )
      throw new AppError(
        "Invoice amount or price does not match the configured plan.",
      );
    // Use the paid invoice's service period, not the subscription's current
    // period, so delayed/replayed events cannot grant a later unpaid month.
    const lines =
      (
        object.lines as {
          data?: {
            period?: { start: number; end: number };
            proration?: boolean;
          }[];
        }
      )?.data ?? [];
    const period = lines.find((line) => !line.proration && line.period)?.period;
    if (!period) throw new AppError("Invoice service period is missing.");
    await update(userId, (data) =>
      applyPaidMonth(
        data,
        { id: userId },
        {
          eventId: `invoice:${objectId(object)}`,
          plan,
          start: new Date(period.start * 1000).toISOString(),
          end: new Date(period.end * 1000).toISOString(),
          subscriptionId,
          customerId: objectId(subscription.customer),
        },
      ),
    );
  } else if (
    [
      "checkout.session.completed",
      "checkout.session.async_payment_succeeded",
    ].includes(event.type)
  ) {
    if (object.mode !== "payment" || object.payment_status !== "paid") return;
    const metadata = object.metadata as {
      user_id?: string;
      kind?: string;
      product?: PackId;
    };
    if (
      metadata?.kind !== "pack" ||
      !metadata.product ||
      !Object.hasOwn(PACKS, metadata.product)
    )
      return;
    const pack = metadata.product;
    const lineItems = await stripe(
      `checkout/sessions/${encodeURIComponent(objectId(object))}/line_items`,
    );
    const lines = lineItems.data as {
      price: { id: string };
      quantity: number;
    }[];
    if (
      lines.length !== 1 ||
      lines[0].quantity !== 1 ||
      lines[0].price.id !==
        (await setting(`STRIPE_PACK_${pack.toUpperCase()}`)) ||
      object.currency !== "usd" ||
      Number(object.amount_total) < PACKS[pack].priceCents
    )
      throw new AppError(
        "Credit pack payment does not match the configured offer.",
      );
    await update(metadata.user_id ?? "", (data) =>
      applyCreditPurchase(
        data,
        { id: metadata.user_id! },
        pack,
        `checkout:${objectId(object)}`,
      ),
    );
  }
}
