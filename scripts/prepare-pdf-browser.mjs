import { copyFile, mkdir } from "node:fs/promises";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const { version } = require("pdfjs-dist/package.json");
await mkdir("public/pdfjs", { recursive: true });
await copyFile(
  require.resolve("pdfjs-dist/build/pdf.worker.min.mjs"),
  `public/pdfjs/pdf.worker-${version}.min.mjs`,
);
