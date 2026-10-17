import type { NextConfig } from "next";
import path from "node:path";
const cloud = process.env.STUDYPREDICT_CLOUD === "1";
const nextConfig: NextConfig = {
  output: "standalone",
  serverExternalPackages: cloud ? [] : ["pdf-parse", "@napi-rs/canvas"],
  turbopack: cloud
    ? { resolveAlias: { "pdf-parse": "./src/lib/pdf-cloud.ts" } }
    : {},
  webpack(config) {
    if (cloud)
      config.resolve.alias["pdf-parse"] = path.resolve("src/lib/pdf-cloud.ts");
    return config;
  },
  outputFileTracingIncludes: cloud
    ? {}
    : {
        "/api/materials": [
          "./node_modules/pdf-parse/dist/**/*",
          "./node_modules/pdfjs-dist/legacy/build/**/*",
          "./node_modules/@napi-rs/canvas/**/*",
          "./node_modules/@napi-rs/canvas-linux-x64-gnu/**/*",
          "./node_modules/@napi-rs/canvas-win32-x64-msvc/**/*",
        ],
      },
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Referrer-Policy", value: "same-origin" },
          {
            key: "Permissions-Policy",
            value: "camera=(), microphone=(), geolocation=()",
          },
          {
            key: "Content-Security-Policy",
            value: "frame-ancestors 'none'; object-src 'none'; base-uri 'self'",
          },
        ],
      },
    ];
  },
};
export default nextConfig;
