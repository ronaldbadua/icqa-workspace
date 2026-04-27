import type { NextConfig } from "next";

const replitDomain = process.env.REPLIT_DEV_DOMAIN;

const nextConfig: NextConfig = {
  allowedDevOrigins: replitDomain ? [replitDomain, `*.${replitDomain}`] : [],
  async headers() {
    return [
      {
        // Prevent browsers from caching HTML pages so they always get
        // the latest JS bundles after a deployment. Fixes stale
        // server-action errors when the app is updated.
        source: "/((?!_next/static|_next/image|favicon.ico).*)",
        headers: [
          { key: "Cache-Control", value: "no-store, must-revalidate" },
        ],
      },
    ];
  },
};

export default nextConfig;
