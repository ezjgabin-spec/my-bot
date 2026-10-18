import { beforeEach, afterEach, describe, it, expect, vi } from "vitest";
import { createHmac } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { beginCheckout, receivePayment } from "../src/lib/payments";
import { accountFor, billingAccount } from "../src/lib/billing";
import { updateLocalData, readLocalData } from "../src/lib/local-store";
let directory: string;
const fetchMock = vi.fn();
beforeEach(async () => {
  directory = await mkdtemp(path.join(os.tmpdir(), "study-payments-"));
  vi.stubEnv("STUDYPREDICT_DATA_DIR", directory);
  vi.stubEnv("STRIPE_SECRET_KEY", "sk_test_placeholder");
  vi.stubEnv("STRIPE_WEBHOOK_SECRET", "whsec_placeholder");
  vi.stubEnv("STRIPE_PRICE_STUDY", "price_study");
  vi.stubEnv("STRIPE_PACK_SMALL", "price_pack");
  vi.stubEnv("APP_ORIGIN", "https://study.example.com");
  vi.stubGlobal("fetch", fetchMock);
  fetchMock.mockReset();
  await updateLocalData((data) =>
    accountFor(data, { id: "local-owner" }, false),
  );
});
afterEach(async () => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  await rm(directory, { recursive: true, force: true });
});
async function deliver(type: string, object: unknown) {
  const body = JSON.stringify({ id: "evt_test", type, data: { object } });
  const t = Math.floor(Date.now() / 1000);
  const sig = `t=${t},v1=${createHmac("sha256", "whsec_placeholder").update(`${t}.${body}`).digest("hex")}`;
  return receivePayment(body, sig);
}
describe("payment boundary (Stripe simulated)", () => {
  it("keeps checkout disabled without credentials and never grants free paid plans", async () => {
    vi.stubEnv("STRIPE_SECRET_KEY", "");
    await expect(
      beginCheckout("plan", "study", crypto.randomUUID()),
    ).rejects.toMatchObject({ status: 503 });
    expect(fetchMock).not.toHaveBeenCalled();
    expect((await billingAccount()).plan).toBe("free");
  });
  it("validates the offer and reuses a pending subscription checkout across tabs", async () => {
    fetchMock.mockImplementation(async (url: string) =>
      url.includes("prices/")
        ? Response.json({
            currency: "usd",
            unit_amount: 1299,
            active: true,
            recurring: { interval: "month", interval_count: 1 },
          })
        : Response.json({ url: "https://checkout.stripe.com/c/pay/test" }),
    );
    const first = await beginCheckout("plan", "study", crypto.randomUUID());
    expect(await beginCheckout("plan", "study", crypto.randomUUID())).toBe(
      first,
    );
    expect(
      fetchMock.mock.calls.filter(([url]) =>
        String(url).endsWith("checkout/sessions"),
      ),
    ).toHaveLength(1);
    expect((await billingAccount()).plan).toBe("free");
  });
  it("rejects a configured price that disagrees with the advertised price", async () => {
    fetchMock.mockResolvedValue(
      Response.json({
        currency: "usd",
        unit_amount: 9900,
        active: true,
        recurring: { interval: "month", interval_count: 1 },
      }),
    );
    await expect(
      beginCheckout("plan", "study", crypto.randomUUID()),
    ).rejects.toMatchObject({ status: 503 });
  });
  it("fulfills signed paid invoices once and does not credit insufficient payments", async () => {
    fetchMock.mockImplementation(async () =>
      Response.json({
        metadata: { user_id: "local-owner" },
        customer: "cus_test",
        items: { data: [{ price: { id: "price_study" } }] },
      }),
    );
    const start = Math.floor(Date.now() / 1000),
      end = start + 30 * 86400;
    const invoice = {
      id: "in_1",
      billing_reason: "subscription_create",
      subscription: "sub_test",
      currency: "usd",
      amount_paid: 1299,
      lines: { data: [{ period: { start, end }, proration: false }] },
    };
    await deliver("invoice.paid", invoice);
    await deliver("invoice.paid", invoice);
    expect((await billingAccount()).balance.monthly).toBe(3_750_000);
    expect(
      (await readLocalData()).billingLedger.filter((e) => e.kind === "renewal"),
    ).toHaveLength(1);
    await expect(
      deliver("invoice.paid", { ...invoice, id: "in_bad", amount_paid: 1 }),
    ).rejects.toThrow(/amount/);
  });
  it("validates paid packs and deduplicates completion and asynchronous-success events", async () => {
    fetchMock.mockImplementation(async () =>
      Response.json({ data: [{ price: { id: "price_pack" }, quantity: 1 }] }),
    );
    const session = {
      id: "cs_1",
      mode: "payment",
      payment_status: "paid",
      metadata: { user_id: "local-owner", kind: "pack", product: "small" },
      currency: "usd",
      amount_total: 599,
    };
    await deliver("checkout.session.completed", session);
    await deliver("checkout.session.async_payment_succeeded", session);
    expect((await billingAccount()).balance.purchased).toBe(2_500_000);
    await deliver("checkout.session.completed", {
      ...session,
      id: "cs_unpaid",
      payment_status: "unpaid",
    });
    expect((await billingAccount()).balance.purchased).toBe(2_500_000);
  });
});
