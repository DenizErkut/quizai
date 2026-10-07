import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  experimental: {
    serverActions: {
      bodySizeLimit: '25mb',
    },
  },
  // Native Node bindings must stay external to Turbopack's ESM chunks.
  serverExternalPackages: ['pdf-parse', '@resvg/resvg-js', 'pdfjs-dist', '@napi-rs/canvas'],
  // pdfjs loads its worker and standard fonts from disk at runtime.
  outputFileTracingIncludes: {
    '/api/admin/exam-upload': ['./node_modules/pdfjs-dist/legacy/build/**', './node_modules/pdfjs-dist/standard_fonts/**', './node_modules/@napi-rs/canvas*/**'],
  },
}

export default nextConfig
