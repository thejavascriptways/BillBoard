import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Packaged BillBoard runs this output with Electron's Node binary.
  output: "standalone",
  // The dev server is opened at 127.0.0.1. Next only allows localhost by
  // default, and a blocked HMR socket leaves the page as static HTML.
  allowedDevOrigins: ["127.0.0.1"],
  async headers() {
    return [
      {
        source: "/sw.js",
        headers: [
          { key: "Cache-Control", value: "no-cache, no-store, must-revalidate" },
          { key: "Service-Worker-Allowed", value: "/" },
        ],
      },
    ];
  },
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
