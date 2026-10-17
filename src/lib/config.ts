import { anthropicApiKey } from "./cloud";

export async function configurationStatus() {
  return {
    ready: true,
    missing: [] as string[],
    aiReady: Boolean(await anthropicApiKey()),
    desktop: process.env.STUDYPREDICT_DESKTOP === "1",
  };
}
