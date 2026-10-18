import { readdir, stat, readFile } from "node:fs/promises";
import { join } from "node:path";
import { gzipSync } from "node:zlib";

const directory = ".wrangler/cloud-bundle";
const limit = 64 * 1024 * 1024;
let total = 0;
let count = 0;
async function inspect(path) {
  for (const name of await readdir(path)) {
    const child = join(path, name);
    const info = await stat(child);
    if (info.isDirectory()) await inspect(child);
    else if (/\.(?:js|mjs|wasm)$/.test(name)) {
      total += info.size;
      count++;
    }
  }
}
await inspect(directory);
const worker = await readFile(join(directory, "worker.js"));
const gzipBytes = gzipSync(worker).byteLength;
console.log("Worker code modules:", count, "uncompressed:", (total / 1048576).toFixed(2), "MiB; entry gzip:", (gzipBytes / 1048576).toFixed(2), "MiB (informational)");
console.log("Current Cloudflare Free and Paid Worker size limit: 64 MiB uncompressed; no compressed-size limit.");
if (total > limit) {
  console.error("Worker code exceeds 64 MiB uncompressed.");
  process.exit(1);
}
