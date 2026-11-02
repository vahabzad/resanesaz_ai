import type { NextConfig } from "next";

const allowedDevOrigins = (process.env.ALLOWED_DEV_ORIGINS ?? "127.0.0.1,localhost")
  .split(",")
  .map((origin) => origin.trim())
  .filter(Boolean);

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // Public pages disable scripts; metadata must be present in the initial HTML head.
  htmlLimitedBots: /.*/,
  allowedDevOrigins,
  // Logo/editorial previews can take up to 180 seconds on the Backend.
  experimental: {
    proxyTimeout: 200_000,
    // Shared NodeNext contracts use .js specifiers while this app consumes TS sources.
    extensionAlias: { ".js": [".ts", ".tsx", ".js"] },
  },
  async headers() {
    const secured = [{ key: "Content-Security-Policy", value: "default-src 'none'; style-src 'self' 'unsafe-inline'; img-src https: data:; font-src 'self'; script-src 'none'; frame-ancestors 'self'; base-uri 'none'; form-action 'none'" }, { key: "X-Content-Type-Options", value: "nosniff" }, { key: "Referrer-Policy", value: "no-referrer" }];
    return [{ source: "/s/:path*", headers: secured }, { source: "/sites/:siteId/preview/:path*", headers: [...secured, { key: "X-Robots-Tag", value: "noindex, nofollow" }, { key: "Cache-Control", value: "private, no-store" }] }];
  },
  async rewrites() {
    const backendUrl = process.env.BACKEND_URL ?? "http://127.0.0.1:4000";
    return [{ source: "/api/:path*", destination: `${backendUrl}/api/:path*` }];
  },
};

export default nextConfig;
