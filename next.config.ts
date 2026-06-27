import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ["googleapis", "@google-cloud/local-auth"],
};

export default nextConfig;
