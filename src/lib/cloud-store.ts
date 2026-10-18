import "server-only";
import { cloudBindings } from "./cloud";
import { requireUser, AppError } from "./server";
import { emptyData, type LocalData, type StudyMaterial } from "./local-store";
import { MAX_MATERIAL_CHARACTERS } from "./material-limits";

type Collection = Exclude<keyof LocalData, "version">;
type Row = { collection: Collection; item_id: string; value: string };
const collections = Object.keys(emptyData()).filter(
  (k) => k !== "version",
) as Collection[];

// Every query uses the verified Access subject. Browser-supplied IDs are never
// used to select an account. Each item gets its own row (no growing JSON blob).
async function snapshot(userId: string) {
  const { DB } = await cloudBindings();
  const results = await DB.batch([
    DB.prepare("INSERT OR IGNORE INTO workspaces(user_id) VALUES (?)").bind(
      userId,
    ),
    DB.prepare("SELECT revision FROM workspaces WHERE user_id = ?").bind(
      userId,
    ),
    DB.prepare(
      "SELECT collection, item_id, value FROM study_items WHERE user_id = ? ORDER BY rowid",
    ).bind(userId),
  ]);
  const data = emptyData();
  const rows = results[2].results as unknown as Row[];
  for (const row of rows) {
    if (!collections.includes(row.collection))
      throw new Error("Invalid stored collection");
    (data[row.collection] as unknown[]).push(JSON.parse(row.value));
  }
  const revision = (results[1].results[0] as { revision: number }).revision;
  return { data, rows, revision };
}

export async function readCloudData() {
  return (await snapshot((await requireUser()).id)).data;
}

export async function updateCloudData<T>(
  change: (data: LocalData) => T | Promise<T>,
): Promise<T> {
  const { id: userId } = await requireUser();
  return updateCloudDataForUser(userId, change);
}

// Internal payment fulfillment only. Routes must authenticate the user or
// verify a payment-provider signature before choosing this ID.
export async function updateCloudDataForUser<T>(userId: string, change: (data: LocalData) => T | Promise<T>): Promise<T> {
  const { DB } = await cloudBindings();
  for (let retry = 0; retry < 8; retry++) {
    const { data, rows, revision } = await snapshot(userId);
    const result = await change(data);
    const token = crypto.randomUUID();
    const before = new Map(
      rows.map((r) => [`${r.collection}/${r.item_id}`, r.value]),
    );
    const statements = [
      DB.prepare(
        "UPDATE workspaces SET revision = revision + 1, mutation_token = ? WHERE user_id = ? AND revision = ?",
      ).bind(token, userId, revision),
    ];
    for (const collection of collections) {
      for (const item of data[collection]) {
        const record = item as unknown as Record<string, unknown>;
        const id = String(record.id ?? record.exam_id);
        if (!id || id === "undefined")
          throw new Error("Stored item needs an ID");
        const value = JSON.stringify(item);
        const key = `${collection}/${id}`;
        if (before.get(key) !== value)
          statements.push(
            DB.prepare(
              "INSERT INTO study_items(user_id, collection, item_id, value) SELECT ?, ?, ?, ? WHERE EXISTS (SELECT 1 FROM workspaces WHERE user_id = ? AND mutation_token = ?) ON CONFLICT(user_id, collection, item_id) DO UPDATE SET value = excluded.value",
            ).bind(userId, collection, id, value, userId, token),
          );
        before.delete(key);
      }
    }
    for (const key of before.keys()) {
      const [collection, id] = key.split("/");
      statements.push(
        DB.prepare(
          "DELETE FROM study_items WHERE user_id = ? AND collection = ? AND item_id = ? AND EXISTS (SELECT 1 FROM workspaces WHERE user_id = ? AND mutation_token = ?)",
        ).bind(userId, collection, id, userId, token),
      );
    }
    // D1 batches are atomic. A lost compare-and-swap makes every following
    // statement a no-op, then retries against the new state.
    const committed = await DB.batch(statements);
    if (committed[0].meta.changes === 1) return result;
  }
  throw new AppError(
    "Your workspace changed in another tab. Please retry.",
    409,
  );
}

// During the D1-only beta, keep extracted notes in the student's private
// workspace. The original binary is deliberately not retained; extracted text
// is all the generation workflow needs. Never share text across users.
export async function storeCloudMaterial(
  material: Omit<StudyMaterial, "created_at">,
  _original?: Uint8Array,
) {
  void _original;
  if (
    material.extracted_text.length > MAX_MATERIAL_CHARACTERS ||
    new TextEncoder().encode(JSON.stringify(material)).byteLength > 1_800_000
  )
    throw new AppError(
      "Study notes exceed the 500,000-character storage limit. Split them into chapters.",
      413,
    );
  await updateCloudData((data) => {
    data.materials.push({
      ...material,
      created_at: new Date().toISOString(),
    });
  });
}

export async function cloudMaterialText(materialId: string) {
  const data = await readCloudData();
  const material = data.materials.find((item) => item.id === materialId);
  if (!material) throw new AppError("Study material could not be found.", 404);
  if (!material.extracted_text)
    throw new AppError(
      "This material was stored before D1-only mode and its text is unavailable. Please upload the notes again.",
      409,
    );
  return material.extracted_text;
}

export async function withCloudAiLock<T>(
  userId: string,
  run: () => Promise<T>,
  purpose: "assessment" | "interpretation" = "assessment",
): Promise<T> {
  void purpose;
  if ((await requireUser()).id !== userId)
    throw new AppError("Not allowed.", 403);
  if ((await (await import("./billing")).billingAccount()).family) return run();
  const { DB } = await cloudBindings();
  const token = crypto.randomUUID();
  const now = Date.now();
  const claim = await DB.prepare(
    "INSERT INTO ai_leases(user_id, token, expires_at) VALUES (?, ?, ?) ON CONFLICT(user_id) DO UPDATE SET token = excluded.token, expires_at = excluded.expires_at, quota_reserved = 0 WHERE ai_leases.expires_at < ?",
  )
    .bind(userId, token, now + 360_000, now)
    .run();
  if (!claim.meta.changes)
    throw new AppError(
      "Another AI request is running for your account. Please wait.",
      409,
    );
  try {
    // Per-call wallet reservations replace the old shared daily request quota.
    return await run();
  } finally {
    await DB.prepare("DELETE FROM ai_leases WHERE user_id = ? AND token = ?")
      .bind(userId, token)
      .run();
  }
}
