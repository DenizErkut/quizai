import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  experimental: {
    serverActions: {
      bodySizeLimit: '25mb',
    },
  },
  // Native Node bindings must stay external to Turbopack's ESM chunks.
  serverExternalPackages: ['pdf-parse', '@resvg/resvg-js'],
}

export default nextConfig
