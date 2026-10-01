import type { NextConfig } from "next";
import { networkInterfaces } from "node:os";

const localNetworkHosts = [
  "localhost",
  "127.0.0.1",
  ...Object.values(networkInterfaces())
    .flatMap((interfaces) => interfaces ?? [])
    .filter((details) => details.family === "IPv4" && !details.internal)
    .map((details) => details.address),
  "192.168.*.*",
  "10.*.*.*",
  "172.16.*.*"
];

const nextConfig: NextConfig = {
  poweredByHeader: false,
  allowedDevOrigins: localNetworkHosts,
  turbopack: { root: process.cwd() },
  experimental: {
    optimizePackageImports: ["lucide-react"]
  },
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          {
            key: "Cache-Control",
            value: "no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0"
          }
        ]
      }
    ];
  }
};

export default nextConfig;
