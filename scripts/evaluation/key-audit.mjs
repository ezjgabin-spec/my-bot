import { readFile } from "node:fs/promises";
const file = process.argv[2];
if (!file)
  throw Error(
    "Pass a JSON export containing questions and their keyAudit records.",
  );
const data = JSON.parse(await readFile(file, "utf8"));
const qs = Array.isArray(data) ? data : data.questions;
const counts = { computed: 0, verified: 0, mismatch: 0, unverified: 0 };
for (const q of qs) counts[q.keyAudit?.status ?? "unverified"]++;
const checked = counts.computed + counts.verified + counts.mismatch;
console.log(
  JSON.stringify(
    {
      total: qs.length,
      ...counts,
      mismatchRateAmongChecked: checked ? counts.mismatch / checked : null,
      unverifiedRate: qs.length ? counts.unverified / qs.length : null,
      note: "Unverified questions are not treated as successful checks. Code verifies specified calculations, not the correctness of natural-language interpretation.",
    },
    null,
    2,
  ),
);
