/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  webpack: (config) => {
    config.resolve.fallback = { 
      fs: false, 
      net: false, 
      tls: false,
      crypto: false,
    };
    
    // Fix for external dependencies (wagmi, viem, etc.)
    config.externals.push('pino-pretty', 'lokijs', 'encoding');
    
    return config;
  },
  // Allow external scripts from CDN
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
  // Environment variables
  env: {
    NEXT_PUBLIC_BACKEND_API: process.env.NEXT_PUBLIC_BACKEND_API || 'http://localhost:3001/api',
  },
};

export default nextConfig;