/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  experimental: {
    optimizePackageImports: [
      '@rainbow-me/rainbowkit',
      'wagmi',
      'viem',
      'lucide-react',
      '@tanstack/react-query',
    ],
  },
  webpack: (config) => {
    config.resolve.fallback = {
      fs: false,
      net: false,
      tls: false,
      crypto: false,
    };

    // Stub heavy/React-Native modules not needed in browser
    config.resolve.alias['@react-native-async-storage/async-storage'] = false;
    config.resolve.alias['@metamask/sdk'] = false;

    config.externals.push('pino-pretty', 'lokijs', 'encoding');

    return config;
  },
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          {
            key: 'Content-Security-Policy',
            value: "script-src 'self' 'unsafe-eval' 'unsafe-inline' https://cdn.jsdelivr.net https://cdnjs.cloudflare.com;",
          },
        ],
      },
    ];
  },
  env: {
    NEXT_PUBLIC_BACKEND_API: process.env.NEXT_PUBLIC_BACKEND_API || 'http://localhost:3001/api',
  },
};

export default nextConfig;
