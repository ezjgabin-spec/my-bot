# Put StudyPredict online

This edition runs on Cloudflare Workers with a free `workers.dev` address. People sign in using Cloudflare Access email codes. Each verified Access account gets its own tests, uploads, grades, and predictions. `ALLOWED_EMAILS: "*"` allows any verified email; change it to comma-separated emails if you later want to make the app private.

The owner's shared Anthropic key pays for generation and written-answer grading. It is stored as a Worker secret and is never sent to browsers. Default AI limits are **10 requests per account per UTC day** and **30 across the entire site per UTC day**, enforced atomically in D1. Failed AI requests count too, since the provider may have billed for them. These are request limits, not a dollar spending cap; set a spending limit in Anthropic as well if desired. Multiple-choice grading does not consume an AI request.

The source is prepared for deployment, but an actual Cloudflare account must create the resources and enable Access. No hosting account, API key, or live address is included in the repository. Windows desktop data is not automatically copied online.

## First deployment

Use Node 22.16 or newer. In the downloaded project folder:

```sh
npm ci
npx wrangler login
npx wrangler d1 create studypredict
npx wrangler r2 bucket create studypredict-materials
```

If a resource with that name already exists, use that resource's identifier instead of recreating or deleting it. R2 may require activation in the Cloudflare dashboard even for its included free usage.

1. In `wrangler.jsonc`, replace the all-zero `database_id` with the ID printed by `d1 create`.
2. In Cloudflare **Workers & Pages**, find or choose your account's `workers.dev` subdomain. The app's address will be `https://studypredict.YOUR-SUBDOMAIN.workers.dev`. Put this exact address in `vars.APP_ORIGIN`, without a trailing slash. You do not need to purchase a domain.
3. In **Cloudflare Zero Trust**, set up your team name and enable **One-time PIN** under authentication/login methods. The team domain looks like `your-team.cloudflareaccess.com`.
4. Create an **Access application** for the entire app address (no path restriction). For `workers.dev`, Cloudflare also offers **Enable Cloudflare Access** under the Worker's **Settings → Domains & Routes** after its first deployment. Use that application if you already enabled it; avoid duplicate applications for the same hostname.
5. Configure an **Allow** policy with **Include → Login Methods → One-time PIN** to permit anyone who completes email-code sign-in. Enable One-time PIN as the application's identity provider. Do not use a Bypass policy. If Cloudflare creates an owner-only email policy automatically, replace it with this policy to let other emails in.
6. Copy the application's **Application Audience (AUD)** into `vars.CF_ACCESS_AUD` and the team domain into `vars.CF_ACCESS_TEAM_DOMAIN`. Leave `ALLOWED_EMAILS` as `*` for open signup. The application checks the signature, issuer, audience, expiry, and verified email on every data request, including direct Worker requests.
7. Apply the database migration and save the shared key through Wrangler's hidden prompt:

```sh
npm run cloud:migrate
npx wrangler secret put ANTHROPIC_API_KEY
```

Paste only the Anthropic key at that prompt. If Wrangler asks to create the `studypredict` Worker so it can store the secret, accept. If Access must be enabled from the Worker settings, finish steps 4–6 now. Secrets are retained on subsequent deployments.

8. Publish:

```sh
npm run cloud:deploy
```

`cloud:deploy` checks the required configuration, builds the Cloudflare bundle, applies any pending D1 migrations, and deploys. The shareable URL is the exact `APP_ORIGIN` address. Send that link to your brother; each of you signs in using a different email code. Use **Settings → Sign out** when switching accounts.

Cloudflare's free address does not mean unlimited hosting or free AI. The Worker bundle fits the free upload-size limit; CPU, storage, Access-user, and request limits still depend on the selected plans. PDF parsing and large requests can need more CPU than the Workers Free allowance. If a request hits that limit, paste a shorter section of notes or choose a Workers plan with sufficient CPU. Real production CPU usage and email delivery must be checked after deployment; local emulation does not enforce all plan limits.

## Checks after publishing

- Open the URL in a private browser window. Cloudflare must request an email code before opening the app.
- Sign in with two different emails in separate browser profiles. Create an exam in the first; the second must have an empty history.
- Upload notes, generate a short test, finish it, and enter an actual grade. Reload and confirm your work remains.
- Verify the shared key is under Worker **Secrets**, not a `NEXT_PUBLIC_` variable or a GitHub file.

No live Anthropic calls are made by automated tests. The deployable Worker test simulates Anthropic responses and Access signing keys while running the actual routes, D1, R2, PDF/DOCX parsers, and prediction engine.

## Development and validation

```sh
npm test
npm run lint
npm run cloud:build
npm run test:cloud-runtime
npm run test:cloud-browser
```

`test:cloud-runtime` bundles the existing `.open-next` build and runs it in Cloudflare's local runtime on port 8789. `test:cloud-browser` starts the built Worker on port 8788. It checks the real unauthenticated boundary and uses a simulated account response for visual navigation. Install Playwright's Chromium (`npx playwright install chromium`) or set `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH` to your installed Chromium executable.

To inspect a local Cloudflare build manually:

```sh
npm run cloud:migrate:local
npm run cloud:preview -- --var APP_ORIGIN:http://127.0.0.1:8787
```

An unsigned local browser cannot access private APIs. There is intentionally no production authentication bypass. Tests supply signed test identities through a local test harness.

Use `npm run build` for the original local/desktop build. `cloud:build` sets its own cloud flags; do not add them to a shared `.env` used for desktop builds. Edge middleware is used because the current OpenNext adapter's Node middleware support is experimental.

## Storage and maintenance

- D1 stores study records under a verified Access subject. Optimistic revisions and atomic batches prevent concurrent autosaves from losing data.
- R2 stores extracted study text and original uploads under that subject's private prefix. The bucket must remain private; no public bucket URL is used.
- D1 Time Travel and R2 backup/lifecycle options can be managed in Cloudflare. There is no automated account deletion or desktop-to-cloud migration UI in this version.
- Changing the Access team or identity provider can change subjects, creating new workspaces. Keep the same Access application/team for continuity.
- The historical `supabase/` directory is not used. No Supabase setup is necessary.
