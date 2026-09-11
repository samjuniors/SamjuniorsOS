import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  typescript: {
    ignoreBuildErrors: true,
  },
  reactStrictMode: false,
  // Allow access to remote image placeholders used by the SamJuniorsOS UI.
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "picsum.photos",
        port: "",
        pathname: "/**",
      },
      {
        protocol: "https",
        hostname: "images.unsplash.com",
        port: "",
        pathname: "/**",
      },
    ],
  },
  transpilePackages: ["motion"],
  async headers() {
    // The Core V4/V5 prototypes are archived design references served as
    // static assets under /prototype/*. The active root route serves the
    // V2 Design1 shell directly (no iframe). Framing is allowed only for
    // these static prototype assets.
    return [
      {
        source: "/prototype/:path*",
        headers: [
          { key: "X-Frame-Options", value: "SAMEORIGIN" },
          { key: "Content-Security-Policy", value: "frame-ancestors 'self'" },
        ],
      },
    ];
  },
};

export default nextConfig;
