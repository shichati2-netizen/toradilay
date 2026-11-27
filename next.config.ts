import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  serverExternalPackages: ["mammoth", "pdfjs-dist"],
};

export default nextConfig;
