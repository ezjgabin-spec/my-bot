import { NextResponse } from "next/server";
import { isCloud, cloudBindings } from "@/lib/cloud";
import { readLocalData } from "@/lib/local-store";
import { readinessMetrics, type ReadinessRecord } from "@/lib/readiness";
export async function GET() {
  let rows: ReadinessRecord[];
  if (isCloud()) {
    const { DB } = await cloudBindings();
    const result = await DB.prepare(
      "SELECT value FROM study_items WHERE collection='readinessRecords' AND json_type(value,'$.actual')='object' LIMIT 100001",
    ).all();
    if (result.results.length > 100000)
      return NextResponse.json({
        ready: false,
        message: "Accuracy report temporarily unavailable",
      });
    rows = result.results.map((r) => JSON.parse(String(r.value)));
  } else rows = (await readLocalData()).readinessRecords;
  const metrics = readinessMetrics(rows);
  return NextResponse.json(
    metrics.count < 30
      ? {
          ready: false,
          message:
            "Not enough data yet. At least 30 linked predictions and real outcomes are required.",
        }
      : {
          ready: true,
          count: metrics.count,
          coverage: metrics.coverage,
          meanWidth: metrics.width,
          methods: metrics.methods.map((m) =>
            m.count >= 30
              ? m
              : { method: m.method, message: "Not enough data yet" },
          ),
        },
    { headers: { "Cache-Control": "public, max-age=300" } },
  );
}
