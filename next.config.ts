import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  poweredByHeader: false,
  turbopack: { root: process.cwd() },
  experimental: {
    optimizePackageImports: ["lucide-react"]
  }
};

export default nextConfig;
