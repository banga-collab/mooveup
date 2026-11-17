import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    // Documents clients (certificats, photos…) jusqu'à 10 Mo
    serverActions: { bodySizeLimit: "10mb" },
  },
};

export default nextConfig;
