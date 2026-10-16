export function configurationStatus() {
  return {
    ready: true,
    missing: [] as string[],
    aiReady: Boolean(process.env.ANTHROPIC_API_KEY),
    desktop: process.env.STUDYPREDICT_DESKTOP === "1",
  };
}
