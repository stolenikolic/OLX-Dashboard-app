import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "**.supabase.co" },
      { protocol: "https", hostname: "d4n0y8dshd77z.cloudfront.net" },
      { protocol: "https", hostname: "**.cloudfront.net" },
      { protocol: "https", hostname: "**.pik.ba" },
      { protocol: "https", hostname: "s8.pik.ba" },
    ],
  },
};

export default nextConfig;
