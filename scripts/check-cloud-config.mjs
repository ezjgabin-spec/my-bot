import { readFile } from "node:fs/promises";
const config = JSON.parse(await readFile("wrangler.jsonc", "utf8"));
const vars = config.vars ?? {};
const missing = [];
if (
  !config.d1_databases?.[0]?.database_id ||
  config.d1_databases[0].database_id === "00000000-0000-0000-0000-000000000000"
)
  missing.push("D1 database_id");
if (
  !/^https:\/\/[^/]+$/.test(vars.APP_ORIGIN ?? "") ||
  vars.APP_ORIGIN.includes("your-subdomain")
)
  missing.push(
    "APP_ORIGIN (your actual https://...workers.dev address, without a trailing slash)",
  );
if (
  !/^[a-z0-9-]+\.cloudflareaccess\.com$/.test(
    vars.CF_ACCESS_TEAM_DOMAIN ?? "",
  ) ||
  vars.CF_ACCESS_TEAM_DOMAIN.startsWith("your-team.")
)
  missing.push("CF_ACCESS_TEAM_DOMAIN");
if (!vars.CF_ACCESS_AUD)
  missing.push("CF_ACCESS_AUD (Access application audience)");
if (!vars.ALLOWED_EMAILS) missing.push("ALLOWED_EMAILS (* for open signup)");
if (missing.length) {
  console.error(
    "Finish these values in wrangler.jsonc before publishing:\n- " +
      missing.join("\n- ") +
      "\nSee CLOUDFLARE.md for the dashboard steps. No passwords or API keys belong in this file.",
  );
  process.exit(1);
}
console.log(
  "Cloudflare configuration fields are present. Confirm email-code Access is enabled for this address and the Anthropic secret is saved.",
);
