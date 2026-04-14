import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /** Pure Node geocoder + kdtree — avoid bundling issues */
  serverExternalPackages: ["local-reverse-geocoder", "kdt"],
};

export default nextConfig;
