# Optional email-verified password login

The existing production default is **Cloudflare Access** and remains unchanged.
The new password login is an opt-in replacement, not an automatic migration. Accounts signed into Access use an Access identity ID; password accounts use a separate `password:<uuid>` ID and a different workspace. Do not switch a production site until users have a data-migration plan.

## Required before enabling

1. Run `npm run cloud:migrate` to apply `0002_password_accounts.sql` to D1. It adds password signup, session, email verification, and rate-limit tables without changing existing records.
2. Set the Cloudflare Worker secrets `AUTH_EMAIL_API_KEY` (a Resend email API key) and `PASSWORD_AUTH_PEPPER` (a new, long, random secret with at least 32 characters; never commit it). Configure `AUTH_FROM_EMAIL` with a verified sending domain. Resend must be authorized to send email from this address.
3. Only when those are available, set the Worker variable `PASSWORD_AUTH_ENABLED` to `1` in your deployment config, build, and deploy. Keep Cloudflare Access protecting the public site until you test the password APIs from an authorized browser/session.
4. With the new login working, decide when to replace Cloudflare Access protection. While Access protects the entire hostname, visitors must still pass Access before they can see the password page. Removing Access while the password mode is disabled or untested would expose the app's pages with no effective sign-in path. Keep the Access app policy until ready.
5. Plan migration or continued use of Access for existing users before a public switch. Existing Access user data is retained but does **not** appear in new password accounts.

## What it does

- New accounts request a one-time six-digit code, sent via Resend. The code is HMAC-protected with a server-only pepper, expires in 10 minutes, and permits at most five failed checks.
- Passwords must be 12–128 characters, are salted and derived using WebCrypto PBKDF2-SHA256 with 260,000 iterations, and are never logged.
- Sign-in and signup requests have D1-backed rate limits. Sessions are random 256-bit tokens stored only as SHA-256 digests in D1, exposed to the browser only as a Secure, HTTP-only, SameSite=Lax cookie for 14 days. Logout revokes the session.
- Every authenticated user is scoped to its own D1 workspace. The existing billing code grants one initial free test plus the first seven-day AI allowance once per verified user.
- No new bulky password-hashing npm package is required.

## Before a public launch

Provide a user-friendly password reset/recovery flow and email-delivery monitoring, and audit all login/account workflows in the actual Cloudflare environment. The password-login tests use a mocked Resend service and cannot prove live email delivery or Cloudflare Access policy settings. Keep `PASSWORD_AUTH_ENABLED=0` until the necessary security and migration work is finished.

## Size check

Since September 2026, Cloudflare Workers have a **64 MiB uncompressed** size limit on both Free and Paid accounts; the old 3 MiB compressed Free-plan limit was removed. `wrangler deploy --dry-run --outdir .wrangler/cloud-bundle` and `node scripts/check-worker-size.mjs` check bundle size without publishing.
See https://developers.cloudflare.com/changelog/post/2026-09-04-increased-worker-size-limit/
