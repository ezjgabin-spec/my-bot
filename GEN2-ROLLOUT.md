# StudyPredict Gen 2 rollout checklist

The feature work lives on branches pending pull-request review. This is not a live deployment and does not change Stripe.

## Decisions already made

- Planned tiers: Free $0, Study $4.99/month, Plus $9.99/month.
- Planned Free signup allowance: three test generations; two each calendar month afterward with no rollover. Free predictions are included when the Gen 2 trial flag is enabled.
- Unlimited manual/structured Smart Import flashcards have no AI calls; AI flashcard generation is Study+.
- Study gets graded essay feedback; Plus unlocks model essays, revisions and Humanize. Auto Humanize uses a second metered call.
- Purchased credits are compatible with Free. Exact pack prices, monthly included credit allocations and expiration policy must still be validated against real API costs.

## Deliberately not activated

- Production payment prices are still the earlier Stripe sandbox products. No change to subscription checkout, Ultra entitlements or existing paid wallet balances.
- The new Free-plan rule is feature-gated: `GEN2_FREE_TRIAL_ENABLED=1` activates it only when `GEN2_FREE_MONTHLY_BUDGET_MICROS` is configured to a measured and approved provider-cost cap. Otherwise old 1 signup test / weekly refresh behavior remains.
- New paid pricing ($4.99/$9.99) requires separate Stripe product/price creation, customer notification, entitlement migration, and testing.

## Before enabling anything

1. Merge and test each Gen 2 stage in order, including Cloudflare runtime checks and human browser testing.
2. Try every AI operation on small representative material. The private `/admin/ai-costs` page reports actual settled Claude usage by feature; its monetary figures are estimated provider costs, **not profit**.
3. Decide allowances and packs from real per-feature cost distributions including outliers and usage caps.
4. Secure and verify Stripe sandbox webhook and checkout independently. Do not switch live billing during the Gen 2 code rollout.
5. Confirm free grade predictions, monthly non-rollover logic and existing account migration in staging before production.
