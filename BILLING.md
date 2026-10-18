# Billing and family access

This release adds pricing, persistent credit wallets, provider-usage receipts, a free tier, a family redemption code, owner monitoring, and Stripe checkout/webhook integration. Checkout stays disabled until its secrets and price IDs are configured. No real payment has been tested or taken during development.

## Using it now

Open **Settings → Code** (also available under **Plans & credits**) and enter the temporary family code supplied by the owner. A successful redemption persists permanent family access for that signed-in account. Family users receive all existing features, bypass credit and daily request limits, and never need a subscription. Their API costs are still recorded. Redemption does not grant billing-administrator access.

The temporary code is represented only by a SHA-256 digest in server code. This is a convenience code, not a strong identity check: anyone who obtains or guesses it can redeem it. Set `FAMILY_CODE_SHA256=disabled` to stop new redemptions without removing existing family access, or replace it with the digest of a new code. Five failed attempts per account are allowed per 15 minutes. Do not put secrets in `NEXT_PUBLIC_*` variables or Git.

Set the Cloudflare variable `BILLING_ADMIN_EMAILS` to the owner's exact sign-in email (comma-separated if needed) to enable **/usage**. Family access never grants access to other users' billing records. Desktop/development runs are owner accounts and remain unlimited.

## Terms implemented

| Plan | Monthly price | Credits | Included API budget | Target contribution |
|---|---:|---:|---:|---:|
| StudyBot | $12.99 | 150 | $3.75 | $8 |
| Plus | $24.99 | 320 | $8 | $15 |
| Ultra | $64.99 | 1,600 | $40 | $20 |

One credit covers $0.025 in calculated API cost. Balances retain integer microdollars, including fractional-credit value. Targets assume card fees of 2.9% + $0.30, conservatively rounded up to a cent, plus hosting reserves of $0.56/$0.96/$2.80. They are conditional contribution targets, not guaranteed net profit. Verify actual fees before launch. Refunds, disputes, taxes, additional infrastructure, advertising, free usage, and family spending are additional expenses. Model-price changes or uncertain provider outcomes must be reconciled. The UI makes no guaranteed-profit claim.

At each paid renewal, unused monthly value moves to the **Free Test Bank** and a fresh allowance is granted. No fixed test conversion destroys value; the bank is measured in credits and a large exam costs more than a short quiz. Bank value and purchased credits do not expire. Bank value is spent before new monthly credits, then purchased credits. At paid-period expiration, remaining monthly value also moves to the bank, while prediction access ends. These balances remain future cost obligations, not earned profit.

Free accounts receive a signup test, then one test every seven days; unused free tests do not accumulate. $0.30 of free processing refreshes every seven days. Interpretation, generation and written grading share that allowance; uploads and ordinary scoring do not consume it. Free users have the same document formats and technical question/file limits as other users. Extensive processing can require paid credits. A failed generation returns the test entitlement but consumed provider processing still counts. Forecasts are retained internally and omitted from both public state and attempt APIs until access is unlocked.

Pricing lists only features that exist today. Oral tutoring, parent profiles, flashcard generation, and other brainstormed future features are not advertised as delivered benefits. Plus and Ultra currently provide larger AI allowances for the existing feature set.

## Connect payments next

1. Create a Stripe account and connect the payout bank account **inside Stripe**. No bank credentials belong in this app.
2. Create USD monthly recurring prices: $12.99, $24.99, $64.99. Create one-time prices for 100/$5.99, 300/$14.99, and 800/$34.99 credit packs. Discounts, trials, prorations and annual plans are not enabled by this integration.
3. Add secrets `STRIPE_SECRET_KEY` and `STRIPE_WEBHOOK_SECRET` to the Worker. Add price-ID variables `STRIPE_PRICE_STUDY`, `STRIPE_PRICE_PLUS`, `STRIPE_PRICE_ULTRA`, `STRIPE_PACK_SMALL`, `STRIPE_PACK_MEDIUM`, `STRIPE_PACK_LARGE`. Test-mode keys and prices must be paired; start with test mode.
4. Create a Stripe webhook at `https://<your-app>/api/billing/webhook` for `invoice.paid`, `checkout.session.completed`, `checkout.session.async_payment_succeeded`, and `customer.subscription.deleted`. Cloudflare Access must bypass **only this exact webhook path** so Stripe can reach it. The app verifies the signature over the raw body and rejects stale/invalid signatures. Keep all user and owner endpoints behind Access.
5. Configure Stripe's customer portal for payment-method updates and cancellation at period end. Keep plan switching/prorations disabled until a separate upgrade policy is implemented. Users can cancel and choose a new plan after the paid period ends. Checkout validates configured prices against the displayed offers and prevents concurrent subscription checkouts. A failed checkout opening may require waiting for its 31-minute reservation to expire.
6. Verify one test subscription, a renewal, one credit pack, duplicate webhook delivery, and cancellation in your own Stripe test environment before enabling live keys. Success URLs never grant credits; verified payment events do. Configure applicable tax collection and review refund/dispute operations before public launch. Refund/dispute automation is not included; handle these in Stripe and account reconciliation.

The existing generic D1 `study_items` storage supports the additional billing collections, so no new migration is required. Payment fulfillment uses a compare-and-swap transaction per verified user. Paid invoices are keyed by invoice ID and period; duplicate events do not refill balances twice, and late paid periods are credited into the bank without extending access improperly.

## Metering and monitoring

Every Claude completion uses `ai-meter.ts`: count prompt/tool tokens, reserve an upper-bound amount atomically, cap output to the available allowance, make one provider call with SDK retries disabled, then settle against returned usage. Each retry is a distinct recorded provider call. Cache-read and 5-minute/1-hour cache-write tokens have separate rates. No study text or answers are stored in the billing ledger.

The initial Sonnet 4.6 standard-rate table assumes $3/$15 per million input/output tokens, $0.30 cache reads, $3.75 five-minute cache writes and $6 one-hour writes. Set `AI_PRICING_JSON` to a server-side JSON mapping of model IDs to `{version,input,output,cacheRead,cacheWrite5m,cacheWrite1h}` in **integer nanodollars per token** to change rates (3,000 means $3 per million). Unsupported models fail closed. Verify the table against your actual Anthropic pricing, including any negotiated, regional or tool charges. No paid provider tools or explicit caching are requested by the current app.

The ledger records model, pricing version, input/output/cache tokens, provider message ID, calculated cost, reservation, charge and status. HTTP rejections release reservations. Timeouts, 5xx errors or missing usage keep reservations pending; they are not guessed to be free. Raw usage is reconciled against provider billing rather than described as an exact invoice. A runtime termination can also leave a reservation pending. Owner monitoring shows pending counts and costs above reservations; it cannot silently create negative customer balances.

The owner console separates family spending from other accounts and shows lifetime cost, request counts, remaining credits and pending checks for up to the 100 highest-cost accounts. Each customer's **Plans & credits** page shows their latest 50 requests. Billing administration requires the explicit owner email allowlist.

The owner console also lists up to 100 pending reservations. After checking the provider record, an owner can settle one with the confirmed cost and an audit reference. Requests younger than 10 minutes cannot be manually settled. Repeated reconciliation does not charge twice; unspent reserved value returns to the appropriate balance. Enter zero only when the provider confirms that no usage was charged.
