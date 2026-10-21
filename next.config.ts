import type { NextConfig } from 'next'

// Güvenlik başlıkları. CSP önce yalnızca raporlama modunda (Report-Only) çalışır: ihlaller tarayıcı konsoluna düşer,
// hiçbir şey engellenmez. İhlaller /api/csp-report adresine gönderilir ve Vercel günlüğünde `[csp-report]`
// satırları olarak birikir. Bir hafta ihlal görülmediğinde `Content-Security-Policy`e çevrilebilir.
const cspReportOnly = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  "font-src 'self' data: https://fonts.gstatic.com",
  "img-src 'self' data: blob: https://*.supabase.co https://lh3.googleusercontent.com",
  "media-src 'self' blob: https://*.supabase.co",
  "connect-src 'self' https://*.supabase.co wss://*.supabase.co",
  "frame-src 'self' https://www.paytr.com",
  "form-action 'self' https://www.paytr.com",
  "frame-ancestors 'self'",
  "base-uri 'self'",
  "object-src 'none'",
  'report-uri /api/csp-report',
  'report-to csp-endpoint',
].join('; ')

const securityHeaders = [
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'X-Frame-Options', value: 'SAMEORIGIN' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'Permissions-Policy', value: 'camera=(self), microphone=(self), geolocation=()' },
  { key: 'Strict-Transport-Security', value: 'max-age=31536000' },
  { key: 'Content-Security-Policy-Report-Only', value: cspReportOnly },
  { key: 'Reporting-Endpoints', value: 'csp-endpoint="/api/csp-report"' },
]

const nextConfig: NextConfig = {
  async headers() {
    return [{ source: '/:path*', headers: securityHeaders }]
  },
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
