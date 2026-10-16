import { cp, mkdir, readFile, writeFile, rm, readdir } from "node:fs/promises";
import path from "node:path";
import { execFileSync } from "node:child_process";
import sharp from "sharp";
const root = process.cwd();
const platform = process.argv[2] ?? process.platform;
const stage = path.join(root, "desktop", "staging");
await rm(stage, { recursive: true, force: true });
await mkdir(path.join(stage, "app"), { recursive: true });
await cp(".next/standalone", path.join(stage, "server"), {
  recursive: true,
  // Copy link targets as normal files so Windows needs no symlink privilege.
  dereference: true,
  filter: (source) =>
    !path.basename(source).startsWith(".env") &&
    ![".studypredict-data", ".git"].includes(path.basename(source)),
});
await cp(".next/static", path.join(stage, "server/.next/static"), {
  recursive: true,
});
try {
  await cp("public", path.join(stage, "server/public"), { recursive: true });
} catch (error) {
  if (error.code !== "ENOENT") throw error;
}
for (const name of ["main.cjs", "preload.cjs", "server.cjs"])
  await cp(path.join("desktop", name), path.join(stage, "app", name));
const pkg = JSON.parse(await readFile("package.json", "utf8"));
await writeFile(
  path.join(stage, "app/package.json"),
  JSON.stringify({
    name: pkg.name,
    version: pkg.version,
    description: pkg.description,
    author: pkg.author,
    main: "main.cjs",
    private: true,
  }),
);
const svg = Buffer.from(
  '<svg xmlns="http://www.w3.org/2000/svg" width="256" height="256"><rect width="256" height="256" rx="52" fill="#151b32"/><path d="M48 162 L93 120 L130 146 L200 68 M153 68 H200 V115" fill="none" stroke="#b7a1ff" stroke-width="20" stroke-linecap="round" stroke-linejoin="round"/><path d="M49 202 H205" stroke="#6ee7b7" stroke-width="12" stroke-linecap="round"/></svg>',
);
const png = await sharp(svg).png().toBuffer();
await writeFile(path.join(stage, "app/icon.png"), png);
const header = Buffer.alloc(22);
header.writeUInt16LE(1, 2);
header.writeUInt16LE(1, 4);
header.writeUInt16LE(1, 10);
header.writeUInt16LE(32, 12);
header.writeUInt32LE(png.length, 14);
header.writeUInt32LE(22, 18);
await writeFile(path.join(stage, "app/icon.ico"), Buffer.concat([header, png]));

// PDF extraction loads a native canvas binding. Cross-built Windows packages
// must include the Windows x64 binding, never just the build machine's binding.
if (platform === "win32" && process.platform !== "win32") {
  const canvas = JSON.parse(
    await readFile("node_modules/@napi-rs/canvas/package.json", "utf8"),
  );
  const vendor = path.join(root, "desktop/vendor-win");
  await mkdir(vendor, { recursive: true });
  const packed = JSON.parse(
    execFileSync(
      "npm",
      [
        "pack",
        "@napi-rs/canvas-win32-x64-msvc@" + canvas.version,
        "--pack-destination",
        vendor,
        "--json",
        "--ignore-scripts",
      ],
      { encoding: "utf8" },
    ),
  )[0];
  const destination = path.join(
    stage,
    "server/node_modules/@napi-rs/canvas-win32-x64-msvc",
  );
  await mkdir(destination, { recursive: true });
  execFileSync(
    "tar",
    [
      "-xzf",
      path.join(vendor, packed.filename),
      "--strip-components=1",
      "-C",
      destination,
    ],
    { stdio: "inherit" },
  );
  // Standalone tracing includes native image packages for the build machine.
  // The Windows app does not use Next's image optimizer, and PDF extraction
  // uses the Windows canvas binding installed above.
  await rm(path.join(stage, "server/node_modules/@napi-rs/canvas-linux-x64-gnu"), {
    recursive: true,
    force: true,
  });
  await rm(path.join(stage, "server/node_modules/@napi-rs/canvas-linux-x64-musl"), {
    recursive: true,
    force: true,
  });
  await rm(path.join(stage, "server/node_modules/@img"), {
    recursive: true,
    force: true,
  });
}
// Fail packaging if a traced secret/config file slipped into the staging tree.
async function audit(dir) {
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    if (
      entry.name.startsWith(".env") ||
      entry.name === "studypredict.json" ||
      entry.name === "settings.json"
    )
      throw new Error("Private file found in desktop staging: " + entry.name);
    if (entry.isDirectory()) await audit(path.join(dir, entry.name));
  }
}
await audit(stage);
console.log("Desktop files staged for " + platform + ".");
