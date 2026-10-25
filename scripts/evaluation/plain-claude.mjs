// Runs the SAME metered, prospective comparison used by the app. Never sends an actual outcome.
const origin = process.env.STUDYPREDICT_ORIGIN;
const id = process.argv[2];
if (!origin || !id)
  throw Error(
    "Set STUDYPREDICT_ORIGIN and STUDYPREDICT_COOKIE; pass a locked prediction ID. This consumes AI credits.",
  );
const response = await fetch(new URL("/api/readiness", origin), {
  method: "PUT",
  headers: {
    Origin: origin,
    "Content-Type": "application/json",
    Cookie: process.env.STUDYPREDICT_COOKIE ?? "",
  },
  body: JSON.stringify({ id }),
});
if (!response.ok)
  throw Error(
    `Comparison failed (${response.status}): ${await response.text()}`,
  );
console.log(JSON.stringify(await response.json(), null, 2));
