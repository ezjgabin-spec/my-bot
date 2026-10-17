import "server-only";
import type { D1Database, R2Bucket } from "@cloudflare/workers-types";
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
  MATERIALS: R2Bucket;
};

export async function cloudBindings(): Promise<CloudBindings> {
  const { env } = await getCloudflareContext({ async: true });
  const bindings = env as unknown as CloudBindings;
  if (!bindings.DB || !bindings.MATERIALS)
    throw new Error(
      "Cloudflare database and material storage must be configured.",
    );
  return bindings;
}
