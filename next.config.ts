import type { NextConfig } from "next";
import { networkInterfaces } from "node:os";

const localNetworkHosts = Object.values(networkInterfaces())
  .flatMap((interfaces) => interfaces ?? [])
  .filter((details) => details.family === "IPv4" && !details.internal)
  .map((details) => details.address);

const nextConfig: NextConfig = {
  poweredByHeader: false,
  allowedDevOrigins: localNetworkHosts,
  turbopack: { root: process.cwd() },
  experimental: {
    optimizePackageImports: ["lucide-react"]
  }
};

export default nextConfig;
