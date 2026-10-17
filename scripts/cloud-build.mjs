import { spawnSync } from "node:child_process";
const result = spawnSync(
  process.platform === "win32" ? "npx.cmd" : "npx",
  ["opennextjs-cloudflare", "build"],
  {
    stdio: "inherit",
    shell: process.platform === "win32",
    env: {
      ...process.env,
      STUDYPREDICT_CLOUD: "1",
      NEXT_PUBLIC_STUDYPREDICT_CLOUD: "1",
    },
  },
);
process.exit(result.status ?? 1);
