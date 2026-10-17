import "server-only";
import type { D1Database } from "@cloudflare/workers-types";
import { getCloudflareContext } from "@opennextjs/cloudflare";

export function isCloud() {
  // A Cloudflare build must never fall back to the desktop's shared local user
  // if a runtime variable is accidentally removed during deployment.
  return (
    process.env.NEXT_PUBLIC_STUDYPREDICT_CLOUD === "1" ||
    process.env.STUDYPREDICT_CLOUD === "1"
  );
}

export type CloudBindings = {
  DB: D1Database;
  ANTHROPIC_API_KEY?: string;
};

export async function cloudBindings(): Promise<CloudBindings> {
  const { env } = await getCloudflareContext({ async: true });
  const bindings = env as unknown as CloudBindings;
  if (!bindings.DB)
    throw new Error(
      "Cloudflare D1 database must be configured.",
    );
  return bindings;
}

export async function anthropicApiKey(): Promise<string | undefined> {
  if (isCloud()) {
    const { env } = await getCloudflareContext({ async: true });
    return (env as unknown as CloudBindings).ANTHROPIC_API_KEY || undefined;
  }
  return process.env.ANTHROPIC_API_KEY || undefined;
}
