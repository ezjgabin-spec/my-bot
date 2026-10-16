import type { NextConfig } from "next";
const nextConfig: NextConfig = {
  output: "standalone",
  serverExternalPackages: ["pdf-parse", "@napi-rs/canvas"],
  outputFileTracingIncludes: {
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
