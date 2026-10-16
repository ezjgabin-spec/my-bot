const { pathToFileURL } = require("node:url");
let started = false;
process.on("disconnect", () => process.exit(0));
process.on("message", async (data) => {
  if (data.type !== "configure") return;
  process.env.ANTHROPIC_API_KEY = data.apiKey || "";
  process.env.ANTHROPIC_MODEL = data.model || "claude-sonnet-4-6";
  if (!started) {
    started = true;
    process.chdir(process.env.STUDYPREDICT_SERVER_ROOT);
    await import(
      pathToFileURL(require("node:path").join(process.cwd(), "server.js")).href
    );
  }
  process.send({ type: "configured", id: data.id });
});
